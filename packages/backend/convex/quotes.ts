import { calendarDayEpoch } from "./lib/formula";
import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { AggregateHelpers } from "./lib/aggregates";
import { calculateQuoteTotals, syncQuoteTotals } from "./lib/quoteTotals";
import { computeQuoteTotals } from "./lib/money";
import {
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import {
	emitStatusChangeEvent,
	emitRecordCreatedEvent,
	emitRecordUpdatedEvent,
} from "./eventBus";
import { computeFieldChanges } from "./lib/changeTracking";
import {
	optionalUserQuery,
	userMutation,
	userQuery,
	type UserMutationCtx,
} from "./lib/factories";

/**
 * Quote operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like quote numbering, status transitions,
 * BoldSign integration) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Validate client access (wrapper for shared utility)
 */
async function validateClientAccess(
	ctx: QueryCtx | MutationCtx,
	clientId: Id<"clients">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	await validateParentAccess(ctx, "clients", clientId, "Client", existingOrgId);
}

/**
 * Validate project access (wrapper for shared utility)
 */
async function validateProjectAccess(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	await validateParentAccess(
		ctx,
		"projects",
		projectId,
		"Project",
		existingOrgId
	);
}

/**
 * Generate the next sequential quote number for an organization
 * Uses a counter stored in the organization for O(1) performance
 */
async function generateNextQuoteNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<string> {
	const org = await ctx.db.get(orgId);
	if (!org) {
		throw new Error("Organization not found");
	}

	let nextNumber: number;

	// If organization doesn't have a lastQuoteNumber (legacy), scan all quotes once
	if (org.lastQuoteNumber === undefined) {
		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		let maxNumber = 0;
		for (const quote of quotes) {
			if (quote.quoteNumber) {
				// Extract number from format Q-000001
				const match = quote.quoteNumber.match(/^Q-(\d+)$/);
				if (match) {
					const num = parseInt(match[1], 10);
					if (num > maxNumber) {
						maxNumber = num;
					}
				}
			}
		}
		nextNumber = maxNumber + 1;
	} else {
		// Use the counter - much faster!
		nextNumber = org.lastQuoteNumber + 1;
	}

	// Update the organization's counter
	await ctx.db.patch(orgId, { lastQuoteNumber: nextNumber });

	// Format with leading zeros (6 digits)
	return `Q-${nextNumber.toString().padStart(6, "0")}`;
}

/**
 * Create a quote with automatic orgId assignment
 */
async function createQuoteWithOrg(
	ctx: UserMutationCtx,
	data: Omit<Doc<"quotes">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"quotes">> {
	// Validate client access
	await validateClientAccess(ctx, data.clientId, ctx.orgId);

	// Validate project access if provided
	if (data.projectId) {
		await validateProjectAccess(ctx, data.projectId, ctx.orgId);
	}

	// Auto-generate quote number if not provided
	const quoteNumber =
		data.quoteNumber || (await generateNextQuoteNumber(ctx, ctx.orgId));

	const quoteData = {
		...data,
		quoteNumber,
		orgId: ctx.orgId,
	};

	return await ctx.db.insert("quotes", quoteData);
}

/**
 * Update a quote with validation
 */
async function updateQuoteWithValidation(
	ctx: UserMutationCtx,
	id: Id<"quotes">,
	updates: Partial<Doc<"quotes">>
): Promise<void> {
	// Validate quote exists and belongs to user's org
	await ctx.orgEntity("quotes", id);

	// Validate new client if being updated
	if (updates.clientId) {
		await validateClientAccess(ctx, updates.clientId, ctx.orgId);
	}

	// Validate new project if being updated
	if (updates.projectId) {
		await validateProjectAccess(ctx, updates.projectId, ctx.orgId);
	}

	// Update the quote
	await ctx.db.patch(id, updates);
}

// Define specific types for quote operations
type QuoteDocument = Doc<"quotes">;
type QuoteId = Id<"quotes">;

// Interface for quote statistics
interface QuoteStats {
	total: number;
	byStatus: {
		draft: number;
		sent: number;
		approved: number;
		declined: number;
		expired: number;
	};
	totalValue: number;
	averageValue: number;
	approvalRate: number;
	thisMonth: number;
}

/**
 * Get all quotes for the current user's organization with calculated totals
 * Optimized to avoid N+1 query problem by batching line item fetches
 */
export const list = optionalUserQuery({
	args: {
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("approved"),
				v.literal("declined"),
				v.literal("expired")
			)
		),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args): Promise<QuoteDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("quotes", "view");

		let quotes: QuoteDocument[];

		if (args.projectId) {
			await validateProjectAccess(ctx, args.projectId, orgId);
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
				.collect();
		} else if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
				.collect();
		} else if (args.status) {
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_status", (q) =>
					q.eq("orgId", orgId).eq("status", args.status!)
				)
				.collect();
		} else {
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
		}

		quotes = await ctx.applyReadScope("quotes", quotes, (q, s) =>
			q.projectId ? s.projectIds.has(q.projectId) : s.clientIds.has(q.clientId)
		);

		// Batch fetch ALL line items for ALL quotes in a single query
		// This avoids N+1 query problem (1 query for quotes + 1 query for all line items = 2 total)
		const allLineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Group line items by quoteId for O(1) lookup
		const lineItemsByQuote = new Map<Id<"quotes">, typeof allLineItems>();
		for (const item of allLineItems) {
			const existing = lineItemsByQuote.get(item.quoteId) || [];
			existing.push(item);
			lineItemsByQuote.set(item.quoteId, existing);
		}

		// Calculate totals for each quote using in-memory data
		const quotesWithCalculatedTotals = quotes.map((quote) => {
			const lineItems = lineItemsByQuote.get(quote._id) || [];

			// Shared roll-up (lib/money.ts) — same math as quotes.get and the portal
			const totals = computeQuoteTotals({
				lineAmounts: lineItems.map((item) => item.amount),
				discountEnabled: quote.discountEnabled,
				discountAmount: quote.discountAmount,
				discountType: quote.discountType,
				taxEnabled: quote.taxEnabled,
				taxRate: quote.taxRate,
			});

			return {
				...quote,
				...totals,
			};
		});

		// Sort by creation time (newest first)
		return quotesWithCalculatedTotals.sort(
			(a, b) => b._creationTime - a._creationTime
		);
	},
});

/**
 * Get a specific quote by ID with calculated totals from line items
 */
export const get = optionalUserQuery({
	args: { id: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteDocument | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("quotes", "view");

		let quote: QuoteDocument;
		try {
			quote = await ctx.orgEntity("quotes", args.id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in quotes:")) {
				return null;
			}
			throw error;
		}
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				quote.projectId
					? s.projectIds.has(quote.projectId)
					: s.clientIds.has(quote.clientId)
			)
		);

		// Calculate totals from line items
		const calculatedTotals = await calculateQuoteTotals(ctx, args.id, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		// Return quote with calculated totals (overriding stored values)
		return {
			...quote,
			subtotal: calculatedTotals.subtotal,
			total: calculatedTotals.total,
			taxAmount: calculatedTotals.taxAmount,
		};
	},
});

// Self-contained payload for the list-page detail drawer: the quote with
// ACCURATE totals (recomputed from line items via calculateQuoteTotals), its
// resolved client (+ primary address), project, line items, and the quote's
// activity from the last 7 days.
interface QuotePreview {
	quote: {
		_id: Id<"quotes">;
		quoteNumber: string | null;
		title: string | null;
		status: QuoteDocument["status"];
		validUntil: number | null;
		sentAt: number | null;
		approvedAt: number | null;
		declinedAt: number | null;
		createdAt: number;
	};
	totals: {
		subtotal: number;
		taxAmount: number;
		total: number;
	};
	client: {
		_id: Id<"clients">;
		companyName: string;
		address: string | null;
	} | null;
	project: {
		_id: Id<"projects">;
		title: string;
	} | null;
	lineItems: Array<{
		_id: Id<"quoteLineItems">;
		description: string;
		quantity: number;
		unit: string;
		rate: number;
		amount: number;
	}>;
	activities: Array<{
		_id: Id<"activities">;
		description: string;
		activityType: string;
		timestamp: number;
		userName: string;
	}>;
	/** True when an invoice has already been created from this quote. */
	hasInvoice: boolean;
}

/**
 * Get a compact, self-contained preview of a quote for the detail drawer.
 * Recomputes totals from current line items (stored values can be stale),
 * resolves the client (+ primary address) and project, returns all line items
 * (ordered by sortOrder; the drawer slices to the top few), and the quote's
 * activity from the last 7 days.
 */
export const getPreview = optionalUserQuery({
	args: { id: v.id("quotes") },
	handler: async (ctx, args: any): Promise<QuotePreview | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("quotes", "view");

		let quote: QuoteDocument;
		try {
			quote = await ctx.orgEntity("quotes", args.id);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Entity not found in quotes:")
			) {
				return null;
			}
			throw error;
		}
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				quote.projectId
					? s.projectIds.has(quote.projectId)
					: s.clientIds.has(quote.clientId)
			)
		);

		// Recompute totals from current line items (stored values can be stale)
		const totals = await calculateQuoteTotals(ctx, args.id, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		// Resolve client + its primary address. Guard the raw get() against a
		// cross-org reference so a bad ref can't leak another org's data.
		const clientDoc = await ctx.db.get(quote.clientId);
		const ownedClient =
			clientDoc && clientDoc.orgId === orgId ? clientDoc : null;
		let clientAddress: string | null = null;
		if (ownedClient) {
			const primaryProperty = await ctx.db
				.query("clientProperties")
				.withIndex("by_primary", (q: any) =>
					q.eq("clientId", ownedClient._id).eq("isPrimary", true)
				)
				.first();
			if (primaryProperty) {
				clientAddress =
					[
						primaryProperty.streetAddress,
						primaryProperty.city,
						[primaryProperty.state, primaryProperty.zipCode]
							.filter(Boolean)
							.join(" "),
					]
						.filter(Boolean)
						.join(", ") || null;
			}
		}
		const client = ownedClient
			? {
					_id: ownedClient._id,
					companyName: ownedClient.companyName,
					address: clientAddress,
				}
			: null;

		// Project (optional, org-guarded)
		let project: QuotePreview["project"] = null;
		if (quote.projectId) {
			const projectDoc = await ctx.db.get(quote.projectId);
			if (projectDoc && projectDoc.orgId === orgId) {
				project = { _id: projectDoc._id, title: projectDoc.title };
			}
		}

		// Line items, ordered by sortOrder
		const lineItemRows = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q: any) => q.eq("quoteId", args.id))
			.collect();
		const lineItems: QuotePreview["lineItems"] = lineItemRows
			.sort(
				(a: Doc<"quoteLineItems">, b: Doc<"quoteLineItems">) =>
					a.sortOrder - b.sortOrder
			)
			.map((li: Doc<"quoteLineItems">) => ({
				_id: li._id,
				description: li.description,
				quantity: li.quantity,
				unit: li.unit,
				rate: li.rate,
				amount: li.amount,
			}));

		// Whether an invoice already exists from this quote — the drawer uses
		// this to block creating a second invoice from the same quote.
		const existingInvoice = await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q: any) => q.eq("quoteId", args.id))
			.first();
		const hasInvoice = existingInvoice !== null;

		// Recent activity for this quote (last 7 days). Activities are keyed
		// generically by entityType/entityId, so query by_entity then filter.
		const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const activityRows = await ctx.db
			.query("activities")
			.withIndex("by_entity", (q: any) =>
				q.eq("entityType", "quote").eq("entityId", args.id as string)
			)
			.filter((q: any) =>
				q.and(
					q.eq(q.field("orgId"), orgId),
					q.eq(q.field("isVisible"), true),
					q.gte(q.field("timestamp"), cutoff)
				)
			)
			.order("desc")
			.take(20);

		const userNameCache = new Map<string, string>();
		const activities: QuotePreview["activities"] = [];
		for (const activity of activityRows) {
			let userName = userNameCache.get(activity.userId);
			if (userName === undefined) {
				const actor = await ctx.db.get(activity.userId);
				userName = actor ? actor.name || actor.email : "Someone";
				userNameCache.set(activity.userId, userName);
			}
			activities.push({
				_id: activity._id,
				description: activity.description,
				activityType: activity.activityType,
				timestamp: activity.timestamp,
				userName,
			});
		}

		return {
			quote: {
				_id: quote._id,
				quoteNumber: quote.quoteNumber ?? null,
				title: quote.title ?? null,
				status: quote.status,
				validUntil: quote.validUntil ?? null,
				sentAt: quote.sentAt ?? null,
				approvedAt: quote.approvedAt ?? null,
				declinedAt: quote.declinedAt ?? null,
				createdAt: quote._creationTime,
			},
			totals,
			client,
			project,
			lineItems,
			activities,
			hasInvoice,
		};
	},
});

/**
 * Create a new quote
 */
export const create = userMutation({
	args: {
		clientId: v.id("clients"),
		projectId: v.optional(v.id("projects")),
		title: v.optional(v.string()),
		quoteNumber: v.optional(v.string()),
		status: v.union(
			v.literal("draft"),
			v.literal("sent"),
			v.literal("approved"),
			v.literal("declined"),
			v.literal("expired")
		),
		subtotal: v.number(),
		discountEnabled: v.optional(v.boolean()),
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.number(),
		validUntil: v.optional(v.number()),
		clientMessage: v.optional(v.string()),
		terms: v.optional(v.string()),
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),
	},
	handler: async (ctx, args): Promise<QuoteId> => {
		await ctx.requireLevel("quotes", "modify");

		// Validate financial values
		if (args.subtotal < 0) {
			throw new Error("Subtotal cannot be negative");
		}

		if (args.total < 0) {
			throw new Error("Total cannot be negative");
		}

		if (args.discountEnabled && args.discountAmount !== undefined) {
			if (args.discountAmount < 0) {
				throw new Error("Discount amount cannot be negative");
			}
			if (args.discountType === "percentage" && args.discountAmount > 100) {
				throw new Error("Percentage discount cannot exceed 100%");
			}
		}

		if (args.taxEnabled && args.taxRate !== undefined && args.taxRate < 0) {
			throw new Error("Tax rate cannot be negative");
		}

		// validUntil is a calendar date (UTC-midnight epoch): the quote is valid
		// through that day. Compare day-to-day in the org tz — an exact-instant
		// check rejects "tomorrow" picked in the evening west of UTC.
		if (args.validUntil) {
			const tz = (await ctx.db.get(ctx.orgId))?.timezone ?? "UTC";
			if (args.validUntil < calendarDayEpoch(Date.now(), tz)) {
				throw new Error("Valid until date cannot be in the past");
			}
		}

		// Type assertion needed because schema still has deprecated publicToken field
		const quoteId = await createQuoteWithOrg(ctx, {
			...args,
			createdByUserId: ctx.user._id,
		} as any);

		// Get the created quote for activity logging and aggregates
		const quote = await ctx.db.get(quoteId);
		if (quote) {
			const client = await ctx.db.get(quote.clientId);
			await ActivityHelpers.quoteCreated(
				ctx,
				quote as QuoteDocument,
				client?.companyName || "Unknown Client"
			);
			await AggregateHelpers.addQuote(ctx, quote as QuoteDocument);
			await emitRecordCreatedEvent(
				ctx,
				quote.orgId,
				"quote",
				quote._id,
				"quotes.create"
			);
		}

		return quoteId;
	},
});

/**
 * Update a quote
 */
export const update = userMutation({
	args: {
		id: v.id("quotes"),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
		title: v.optional(v.string()),
		quoteNumber: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("approved"),
				v.literal("declined"),
				v.literal("expired")
			)
		),
		subtotal: v.optional(v.number()),
		discountEnabled: v.optional(v.boolean()),
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.optional(v.number()),
		validUntil: v.optional(v.number()),
		clientMessage: v.optional(v.string()),
		terms: v.optional(v.string()),
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),
		// Countersignature settings
		requiresCountersignature: v.optional(v.boolean()),
		countersignerId: v.optional(v.id("users")),
		signingOrder: v.optional(
			v.union(v.literal("client_first"), v.literal("org_first"))
		),
	},
	handler: async (ctx, args): Promise<QuoteId> => {
		await ctx.requireLevel("quotes", "modify");

		const { id, ...updates } = args;

		// Validate financial values
		if (updates.subtotal !== undefined && updates.subtotal < 0) {
			throw new Error("Subtotal cannot be negative");
		}

		if (updates.total !== undefined && updates.total < 0) {
			throw new Error("Total cannot be negative");
		}

		if (updates.discountAmount !== undefined && updates.discountAmount < 0) {
			throw new Error("Discount amount cannot be negative");
		}

		if (
			updates.discountType === "percentage" &&
			updates.discountAmount !== undefined &&
			updates.discountAmount > 100
		) {
			throw new Error("Percentage discount cannot exceed 100%");
		}

		if (updates.taxRate !== undefined && updates.taxRate < 0) {
			throw new Error("Tax rate cannot be negative");
		}

		// Same calendar-day semantics as create (see comment there).
		if (updates.validUntil) {
			const tz = (await ctx.db.get(ctx.orgId))?.timezone ?? "UTC";
			if (updates.validUntil < calendarDayEpoch(Date.now(), tz)) {
				throw new Error("Valid until date cannot be in the past");
			}
		}

		// Validate countersignature settings
		if (updates.requiresCountersignature === true && !updates.countersignerId) {
			throw new Error(
				"Countersigner is required when countersignature is enabled"
			);
		}

		// Validate countersigner exists if provided
		if (updates.countersignerId) {
			const countersigner = await ctx.db.get(updates.countersignerId);
			if (!countersigner) {
				throw new Error("Countersigner not found");
			}
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates) as Partial<QuoteDocument>;
		requireUpdates(filteredUpdates);

		// Get current quote to check for status changes
		const currentQuote = await ctx.orgEntity("quotes", id);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				currentQuote.projectId
					? s.projectIds.has(currentQuote.projectId)
					: s.clientIds.has(currentQuote.clientId)
			)
		);
		const oldStatus = currentQuote.status;

		// Compute field-level changes before applying the update
		const changes = computeFieldChanges(
			"quote",
			currentQuote as unknown as Record<string, unknown>,
			filteredUpdates as Record<string, unknown>
		);

		// Handle status-specific updates
		if (
			filteredUpdates.status &&
			filteredUpdates.status !== currentQuote.status
		) {
			const now = Date.now();

			if (
				filteredUpdates.status === "sent" &&
				currentQuote.status === "draft"
			) {
				filteredUpdates.sentAt = now;
			} else if (filteredUpdates.status === "approved") {
				filteredUpdates.approvedAt = now;
			} else if (filteredUpdates.status === "declined") {
				filteredUpdates.declinedAt = now;
			}
		}

		await updateQuoteWithValidation(ctx, id, filteredUpdates);

		// Log appropriate activity based on status change and update aggregates
		const updatedQuote = await ctx.db.get(id);
		if (updatedQuote) {
			// Update aggregates if relevant fields changed
			if (
				filteredUpdates.status !== undefined ||
				filteredUpdates.approvedAt !== undefined ||
				filteredUpdates.total !== undefined
			) {
				await AggregateHelpers.updateQuote(
					ctx,
					currentQuote as QuoteDocument,
					updatedQuote as QuoteDocument
				);
			}

			const client = await ctx.db.get(updatedQuote.clientId);
			const clientName = client?.companyName || "Unknown Client";
			if (
				filteredUpdates.status === "sent" &&
				currentQuote.status === "draft"
			) {
				await ActivityHelpers.quoteSent(
					ctx,
					updatedQuote as QuoteDocument,
					clientName,
					changes
				);
			} else if (filteredUpdates.status === "approved") {
				await ActivityHelpers.quoteApproved(
					ctx,
					updatedQuote as QuoteDocument,
					clientName,
					changes
				);
			} else if (filteredUpdates.status === "declined") {
				await ActivityHelpers.quoteDeclined(
					ctx,
					updatedQuote as QuoteDocument,
					clientName,
					changes
				);
			}

			// Emit status change event if status changed
			if (args.status && args.status !== oldStatus) {
				await emitStatusChangeEvent(
					ctx,
					updatedQuote.orgId,
					"quote",
					updatedQuote._id,
					oldStatus,
					args.status,
					"quotes.update"
				);
			}

			await emitRecordUpdatedEvent(
				ctx,
				updatedQuote.orgId,
				"quote",
				updatedQuote._id,
				Object.keys(filteredUpdates).filter((key) => key !== "updatedAt"),
				"quotes.update"
			);
		}

		return id;
	},
});

/**
 * Recalculate quote totals based on line items
 */
export const recalculateTotals = userMutation({
	args: { id: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteId> => {
		await ctx.requireLevel("quotes", "modify");

		const quote = await ctx.orgEntity("quotes", args.id);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				quote.projectId
					? s.projectIds.has(quote.projectId)
					: s.clientIds.has(quote.clientId)
			)
		);

		// Recompute + persist totals and keep aggregates in step
		await syncQuoteTotals(ctx, args.id);

		return args.id;
	},
});

/**
 * Delete a quote with relationship validation
 */
export const remove = userMutation({
	args: { id: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteId> => {
		await ctx.requireLevel("quotes", "delete");

		// Validate access before any destructive side effects
		const quote = await ctx.orgEntity("quotes", args.id);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				quote.projectId
					? s.projectIds.has(quote.projectId)
					: s.clientIds.has(quote.clientId)
			)
		);

		// Check if quote has related invoices
		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();

		if (invoices.length > 0) {
			throw new Error(
				"Cannot delete quote with existing invoices. " +
					"Please remove or unlink the invoices first."
			);
		}

		// Delete line items first
		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();

		for (const lineItem of lineItems) {
			await ctx.db.delete(lineItem._id);
		}

		// Remove from aggregates before deleting
		await AggregateHelpers.removeQuote(ctx, quote as QuoteDocument);
		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Search quotes
 */
export const search = optionalUserQuery({
	args: {
		query: v.string(),
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("approved"),
				v.literal("declined"),
				v.literal("expired")
			)
		),
		clientId: v.optional(v.id("clients")),
	},
	handler: async (ctx, args): Promise<QuoteDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("quotes", "view");

		let quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		quotes = await ctx.applyReadScope("quotes", quotes, (q, s) =>
			q.projectId ? s.projectIds.has(q.projectId) : s.clientIds.has(q.clientId)
		);

		// Filter by status if specified
		if (args.status) {
			quotes = quotes.filter((quote) => quote.status === args.status);
		}

		// Filter by client if specified
		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			quotes = quotes.filter((quote) => quote.clientId === args.clientId);
		}

		// Search in title, quote number, client message, and terms
		const searchQuery = args.query.toLowerCase();
		return quotes.filter(
			(quote: QuoteDocument) =>
				(quote.title && quote.title.toLowerCase().includes(searchQuery)) ||
				(quote.quoteNumber &&
					quote.quoteNumber.toLowerCase().includes(searchQuery)) ||
				(quote.clientMessage &&
					quote.clientMessage.toLowerCase().includes(searchQuery)) ||
				(quote.terms && quote.terms.toLowerCase().includes(searchQuery))
		);
	},
});

/**
 * Get quote statistics for dashboard
 */
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<QuoteStats> => {
		const orgId = ctx.orgId;
		if (!orgId) {
			return {
				total: 0,
				byStatus: {
					draft: 0,
					sent: 0,
					approved: 0,
					declined: 0,
					expired: 0,
				},
				totalValue: 0,
				averageValue: 0,
				approvalRate: 0,
				thisMonth: 0,
			};
		}
		await ctx.requireLevel("quotes", "view");

		let quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		quotes = await ctx.applyReadScope("quotes", quotes, (q, s) =>
			q.projectId ? s.projectIds.has(q.projectId) : s.clientIds.has(q.clientId)
		);

		const stats: QuoteStats = {
			total: quotes.length,
			byStatus: {
				draft: 0,
				sent: 0,
				approved: 0,
				declined: 0,
				expired: 0,
			},
			totalValue: 0,
			averageValue: 0,
			approvalRate: 0,
			thisMonth: 0,
		};

		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);
		const monthStartTime = monthStart.getTime();

		let sentCount = 0;
		let approvedCount = 0;

		quotes.forEach((quote: QuoteDocument) => {
			// Count by status
			stats.byStatus[quote.status]++;

			// Count this month's quotes
			if (quote._creationTime >= monthStartTime) {
				stats.thisMonth++;
			}

			// Calculate total value (only for approved quotes)
			if (quote.status === "approved") {
				stats.totalValue += quote.total;
				approvedCount++;
			}

			// Count for approval rate calculation
			if (
				quote.status === "sent" ||
				quote.status === "approved" ||
				quote.status === "declined"
			) {
				sentCount++;
			}
		});

		// Calculate averages and rates
		if (approvedCount > 0) {
			stats.averageValue = stats.totalValue / approvedCount;
		}

		if (sentCount > 0) {
			stats.approvalRate = (approvedCount / sentCount) * 100;
		}

		return stats;
	},
});

/**
 * Get sent quotes expiring or already expired within the next 7 days
 */
export const getAwaitingSigning = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const orgId = ctx.orgId;
		if (!orgId) return [];
		await ctx.requireLevel("quotes", "view");

		const now = Date.now();
		const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

		// Get all sent quotes (non-completed, non-approved, non-declined, non-expired)
		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_status", (q) => q.eq("orgId", orgId).eq("status", "sent"))
			.collect();

		// Return quotes whose validUntil date is within the next 7 days (or already past)
		const upcoming = quotes.filter(
			(quote) =>
				quote.validUntil !== undefined && quote.validUntil <= sevenDaysFromNow
		);

		return await ctx.applyReadScope("quotes", upcoming, (q, s) =>
			q.projectId ? s.projectIds.has(q.projectId) : s.clientIds.has(q.clientId)
		);
	},
});

/**
 * Get quotes expiring soon
 */
export const getExpiringSoon = optionalUserQuery({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args): Promise<QuoteDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("quotes", "view");

		const daysAhead = args.days || 7;

		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const now = Date.now();
		const expirationThreshold = now + daysAhead * 24 * 60 * 60 * 1000;

		const expiringSoon = quotes.filter(
			(quote: QuoteDocument) =>
				quote.status === "sent" &&
				quote.validUntil &&
				quote.validUntil <= expirationThreshold &&
				quote.validUntil > now
		);

		return await ctx.applyReadScope("quotes", expiringSoon, (q, s) =>
			q.projectId ? s.projectIds.has(q.projectId) : s.clientIds.has(q.clientId)
		);
	},
});

/**
 * Plan 14.1-02 (QUOTE-04 workspace half): read the portal-quote audit trail.
 * Org-scoped. Returns rows newest-first; mints fresh signed URLs per row for
 * both the signature blob and the audit-pinned PDF document.
 *
 * Per-row defense-in-depth: row.orgId, contact.orgId, and document.orgId are
 * all validated against the caller's orgId — corrupted cross-org rows are
 * dropped, not leaked. Audit-pinned PDF resolves from row.documentId (NOT
 * quote.latestDocumentId) so re-published quotes still surface the version
 * the client actually approved.
 */
export const getApprovalAudit = userQuery({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, { quoteId }) => {
		await ctx.requireLevel("quotes", "view");
		const orgId = await getCurrentUserOrgId(ctx);

		const quote = await ctx.db.get(quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });
		if (quote.orgId !== orgId)
			throw new ConvexError({ code: "FORBIDDEN" });
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				quote.projectId
					? s.projectIds.has(quote.projectId)
					: s.clientIds.has(quote.clientId)
			)
		);

		const rows = await ctx.db
			.query("quoteApprovals")
			.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
			.order("desc")
			.collect();

		const dtos = await Promise.all(
			rows.map(async (row) => {
				// Defense-in-depth check 1: row.orgId
				if (row.orgId !== orgId) return null;

				// Defense-in-depth check 2: contact.orgId
				const contact = await ctx.db.get(row.clientContactId);
				if (!contact || contact.orgId !== orgId) return null;

				// Defense-in-depth check 3: auditPinnedDoc.orgId — drop rows
				// whose pinned document is foreign (also covers missing doc).
				const auditPinnedDoc = await ctx.db.get(row.documentId);
				if (!auditPinnedDoc || auditPinnedDoc.orgId !== orgId)
					return null;

				const auditPinnedPdfUrl = await ctx.storage.getUrl(
					auditPinnedDoc.storageId
				);

				const signatureUrl = row.signatureStorageId
					? await ctx.storage.getUrl(row.signatureStorageId)
					: null;

				// Empty-snapshot normalization (Test F + user decision D-2):
				// surface null so the UI placeholder branch fires cleanly.
				const snapshot =
					row.lineItemsSnapshot && row.lineItemsSnapshot.length > 0
						? row.lineItemsSnapshot
						: null;

				return {
					auditId: row._id,
					action: row.action,
					createdAt: row.createdAt,
					documentVersion: row.documentVersion,
					ipAddress: row.ipAddress,
					userAgent: row.userAgent,
					declineReason: row.declineReason ?? null,
					signatureUrl,
					signatureMode: row.signatureMode ?? null,
					contactEmail: contact.email ?? "",
					documentId: row.documentId,
					auditPinnedPdfUrl,
					lineItemsSnapshot: snapshot,
					subtotalSnapshot: row.subtotalSnapshot,
					taxSnapshot: row.taxSnapshot,
					totalSnapshot: row.totalSnapshot,
				};
			})
		);

		return dtos.filter((d): d is NonNullable<typeof d> => d !== null);
	},
});
