import { calendarDayEpoch } from "./lib/formula";
import { query, QueryCtx, MutationCtx } from "./_generated/server";
import { mutation } from "./lib/triggers";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { celebrateQuoteApproved } from "./lib/celebrations";
import { calculateQuoteTotals, syncQuoteTotals } from "./lib/quoteTotals";
import { assertQuoteContentEditable } from "./lib/editLocks";
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
	consumeMeter,
	entitlementsFromIdentity,
	requireMeter,
} from "./lib/entitlements";
import { internal } from "./_generated/api";
import {
	optionalUserQuery,
	userMutation,
	userQuery,
	type UserMutationCtx,
} from "./lib/factories";
import {
	assertNoSuppressedRecipients,
	entitySendArgs,
	resolveRecipients,
} from "./email/entitySend";
import { resolveOutboundAttachments } from "./email/attachments";
import { deliverOutbound } from "./email/deliver";
import { htmlToPlainText, sanitizeHtml } from "./email/sanitizeHtml";
import {
	buildEmailHtml,
	resolveFromEmail,
	resolveReplyToEmail,
} from "./email/branding";
import { getOrCreateOutboundThread, plusTagAddress } from "./email/threads";
import { formatEmailFrom } from "./lib/emailFrom";
import { nextQuoteNumber, reserveQuoteNumber } from "./lib/orgCounters";
import { buildPortalQuoteUrl } from "./portal/quoteUrl";
import { mintPortalAccessId } from "./clients";

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
		// Org scope alone still allows a project belonging to a DIFFERENT client,
		// which would print the wrong job on the quote.
		const project = await ctx.db.get(data.projectId);
		if (project && project.clientId !== data.clientId) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Project does not belong to the selected client",
			});
		}
	}

	if (data.quoteNumber) await reserveQuoteNumber(ctx, ctx.orgId, data.quoteNumber);
	const quoteNumber =
		data.quoteNumber || (await nextQuoteNumber(ctx, ctx.orgId));

	const quoteData = {
		...data,
		quoteNumber,
		orgId: ctx.orgId,
	};

	return await ctx.db.insert("quotes", quoteData);
}

/** Quote fields whose change invalidates the stored subtotal/taxAmount/total. */
const QUOTE_TOTAL_FIELDS = [
	"subtotal",
	"taxAmount",
	"total",
	"discountEnabled",
	"discountAmount",
	"discountType",
	"taxEnabled",
	"taxRate",
] as const;

/**
 * Quote fields that change what the client sees on the document. Patching any
 * of them requires an unlocked quote and stamps contentUpdatedAt; `subtotal`
 * and `total` are deliberately absent — they are derived, and callers echo
 * them back alongside unrelated writes.
 */
const QUOTE_CONTENT_FIELDS = [
	"discountEnabled",
	"discountAmount",
	"discountType",
	"taxEnabled",
	"taxRate",
	"taxAmount",
	"pdfSettings",
	"title",
	"terms",
	"clientMessage",
	// validUntil is deliberately absent: it's offer-window metadata, not
	// document content — extending a sent quote's validity must not require a
	// revert to draft. It still stamps contentUpdatedAt (the date prints on the
	// PDF) via its own branch in the update handler.
] as const;

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

		// Every index above ends in _creationTime, so .order("desc") IS the
		// newest-first order the callers expect — no JS sort needed.
		if (args.projectId) {
			await validateProjectAccess(ctx, args.projectId, orgId);
			quotes = (
				await ctx.db
					.query("quotes")
					.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
					.order("desc")
					.collect()
			).filter((quote) => quote.orgId === orgId);
		} else if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			quotes = (
				await ctx.db
					.query("quotes")
					.withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
					.order("desc")
					.collect()
			).filter((quote) => quote.orgId === orgId);
		} else if (args.status) {
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_status", (q) =>
					q.eq("orgId", orgId).eq("status", args.status!)
				)
				.order("desc")
				.collect();
		} else {
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.order("desc")
				.collect();
		}

		// Stored totals, not a recompute: syncQuoteTotals keeps subtotal/taxAmount/
		// total in step with the line items on every line-item mutation and on
		// every discount/tax edit in `update`. Recomputing here meant collecting
		// the org's entire quoteLineItems table on each list call.
		return await ctx.applyReadScope("quotes", quotes, (q, s) =>
			q.projectId ? s.projectIds.has(q.projectId) : s.clientIds.has(q.clientId)
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

		let quote: QuoteDocument | null;
		try {
			quote = await ctx.orgEntity("quotes", args.id, { onMismatch: "skip" });
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in quotes:")) {
				return null;
			}
			throw error;
		}
		// Cross-org quote: degrade to an empty state instead of throwing.
		if (!quote) return null;
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

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
		firstSentAt: number | null;
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
	// Callers pass a day-rounded `now` so the result is cacheable.
	args: { id: v.id("quotes"), now: v.optional(v.number()) },
	handler: async (ctx, args: any): Promise<QuotePreview | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("quotes", "view");

		let quote: QuoteDocument | null;
		try {
			quote = await ctx.orgEntity("quotes", args.id, { onMismatch: "skip" });
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Entity not found in quotes:")
			) {
				return null;
			}
			throw error;
		}
		// Cross-org quote: degrade to an empty state instead of throwing.
		if (!quote) return null;
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

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
		const cutoff = (args.now ?? Date.now()) - 7 * 24 * 60 * 60 * 1000;
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
				firstSentAt: quote.firstSentAt ?? null,
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
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Subtotal cannot be negative",
			});
		}

		if (args.total < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Total cannot be negative",
			});
		}

		if (args.discountEnabled && args.discountAmount !== undefined) {
			if (args.discountAmount < 0) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					message: "Discount amount cannot be negative",
				});
			}
			if (args.discountType === "percentage" && args.discountAmount > 100) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					message: "Percentage discount cannot exceed 100%",
				});
			}
		}

		if (args.taxEnabled && args.taxRate !== undefined && args.taxRate < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Tax rate cannot be negative",
			});
		}

		// validUntil is a calendar date (UTC-midnight epoch): the quote is valid
		// through that day. Compare day-to-day in the org tz — an exact-instant
		// check rejects "tomorrow" picked in the evening west of UTC.
		if (args.validUntil) {
			const tz = (await ctx.db.get(ctx.orgId))?.timezone ?? "UTC";
			if (args.validUntil < calendarDayEpoch(Date.now(), tz)) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					message: "Valid until date cannot be in the past",
				});
			}
		}

		// Minting a quote directly as "sent" makes it portal-visible without ever
		// passing sendToClient — meter it like a first send (approved/declined at
		// creation are historical bookkeeping, not sends).
		let sentStamp: { sentAt: number; firstSentAt: number } | undefined;
		if (args.status === "sent") {
			const { plan } = await entitlementsFromIdentity(ctx);
			// One timestamp so the check and debit share a billing period.
			const now = Date.now();
			await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
			await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
			sentStamp = { sentAt: now, firstSentAt: now };
		}

		// Type assertion needed because schema still has deprecated publicToken field
		const quoteId = await createQuoteWithOrg(ctx, {
			...args,
			...sentStamp,
			createdByUserId: ctx.user._id,
		} as any);

		// Get the created quote for activity logging
		const quote = await ctx.db.get(quoteId);
		if (quote) {
			const client = await ctx.db.get(quote.clientId);
			await ActivityHelpers.quoteCreated(
				ctx,
				quote as QuoteDocument,
				client?.companyName || "Unknown Client"
			);
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

		const currentQuote = await ctx.orgEntity("quotes", id);
		const filteredUpdates = filterUndefined(updates) as Partial<QuoteDocument>;
		if (
			filteredUpdates.quoteNumber &&
			filteredUpdates.quoteNumber !== currentQuote.quoteNumber
		) {
			await reserveQuoteNumber(ctx, ctx.orgId, filteredUpdates.quoteNumber);
		}
		// Paired fields (discount type/amount, countersignature/countersigner) are
		// validated on the merged result, so patching one half can't bypass a rule
		// or trip one that the merged quote satisfies.
		const effective = { ...currentQuote, ...filteredUpdates };

		// Validate financial values
		if (updates.subtotal !== undefined && updates.subtotal < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Subtotal cannot be negative",
			});
		}

		if (updates.total !== undefined && updates.total < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Total cannot be negative",
			});
		}

		if (updates.discountAmount !== undefined && updates.discountAmount < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Discount amount cannot be negative",
			});
		}

		if (
			effective.discountType === "percentage" &&
			effective.discountAmount !== undefined &&
			effective.discountAmount > 100
		) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Percentage discount cannot exceed 100%",
			});
		}

		if (updates.taxRate !== undefined && updates.taxRate < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Tax rate cannot be negative",
			});
		}

		// Same calendar-day semantics as create (see comment there).
		if (updates.validUntil !== undefined) {
			const tz = (await ctx.db.get(ctx.orgId))?.timezone ?? "UTC";
			if (updates.validUntil < calendarDayEpoch(Date.now(), tz)) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					message: "Valid until date cannot be in the past",
				});
			}
		}

		// Validate countersignature settings
		if (effective.requiresCountersignature === true && !effective.countersignerId) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Countersigner is required when countersignature is enabled",
			});
		}

		// Validate countersigner exists if provided
		if (updates.countersignerId) {
			const countersigner = await ctx.db.get(updates.countersignerId);
			if (!countersigner) {
				throw new ConvexError({
					code: "NOT_FOUND",
					message: "Countersigner not found",
				});
			}
		}

		requireUpdates(filteredUpdates);

		await ctx.requireRecordScope("quotes", {
			projectId: currentQuote.projectId,
			clientId: currentQuote.clientId,
		});

		// Content edits are locked to draft quotes. Status transitions and every
		// other field stay editable.
		if (QUOTE_CONTENT_FIELDS.some((field) => field in filteredUpdates)) {
			assertQuoteContentEditable(currentQuote);
			filteredUpdates.contentUpdatedAt = Date.now();
		}

		// validUntil has ONE writer: quotes.extendValidUntil. It carries rules this
		// generic patch can't (expired quotes revive to sent, the PDF re-renders),
		// so accepting it here would silently produce a half-applied extension.
		if ("validUntil" in filteredUpdates) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message:
					"Use quotes.extendValidUntil to change a quote's valid-until date.",
			});
		}

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

			if (filteredUpdates.status === "sent") {
				// ANY flip to sent IS a send (portal-visible, approvable) — the
				// source doesn't matter, or a quote minted as declined/expired
				// would slip through. Metered exactly like sendToClient, keyed on
				// the immutable firstSentAt (legacy really-sent quotes carry
				// sentAt) so revert-to-draft can never re-arm the debit.
				if (!currentQuote.firstSentAt && !currentQuote.sentAt) {
					const { plan } = await entitlementsFromIdentity(ctx);
					await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
					await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
				}
				filteredUpdates.sentAt = now;
				if (!currentQuote.firstSentAt) {
					filteredUpdates.firstSentAt = now;
				}
			} else if (filteredUpdates.status === "approved") {
				filteredUpdates.approvedAt = now;
			} else if (filteredUpdates.status === "declined") {
				filteredUpdates.declinedAt = now;
			} else if (filteredUpdates.status === "draft") {
				// Revert to draft: without this the timeline (and portal sort, were
				// it ever visible) would keep claiming the quote was sent.
				// Backfill the debit key for legacy rows first — clearing sentAt
				// while firstSentAt is unset would re-arm a debit for a quote that
				// was already sent.
				if (!currentQuote.firstSentAt && currentQuote.sentAt) {
					filteredUpdates.firstSentAt = currentQuote.sentAt;
				}
				filteredUpdates.sentAt = undefined;
			}
		}

		await updateQuoteWithValidation(ctx, id, filteredUpdates);

		// Callers send their own subtotal/total next to a discount or tax edit.
		// Recompute from the line items so the stored figures — which list,
		// getStats and the revenue aggregates all read — stay authoritative.
		if (QUOTE_TOTAL_FIELDS.some((field) => field in filteredUpdates)) {
			await syncQuoteTotals(ctx, id);
		}

		// Log appropriate activity based on status change
		const updatedQuote = await ctx.db.get(id);
		if (updatedQuote) {
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

			if (filteredUpdates.status === "approved" && oldStatus !== "approved") {
				await celebrateQuoteApproved(
					ctx,
					updatedQuote as QuoteDocument,
					ctx.user._id
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
 * Extend a quote's valid-until date. Exempt from the draft-only content lock
 * (extending a sent quote's window is the whole point) but closed quotes
 * reject. Extending an EXPIRED quote revives it to sent — the offer window is
 * open again, so the portal link the client already has starts working; the
 * caller's confirm copy states this. Silent toward the client (no email;
 * resend exists to nudge).
 */
export const extendValidUntil = userMutation({
	args: { id: v.id("quotes"), validUntil: v.number() },
	returns: v.id("quotes"),
	handler: async (ctx, args): Promise<QuoteId> => {
		await ctx.requireLevel("quotes", "modify");
		const quote = await ctx.orgEntity("quotes", args.id);
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

		if (quote.status === "approved" || quote.status === "declined") {
			throw new ConvexError({
				code: "CONFLICT",
				message: `QUOTE_LOCKED: this quote is ${quote.status} and its valid-until date can no longer be changed.`,
			});
		}

		// Same calendar-day semantics as create/update.
		const tz = (await ctx.db.get(ctx.orgId))?.timezone ?? "UTC";
		if (args.validUntil < calendarDayEpoch(Date.now(), tz)) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Valid until date cannot be in the past",
			});
		}

		const revived = quote.status === "expired";
		// A genuinely expired quote was sent before (debit already taken); a
		// quote MINTED as expired was not — reviving it is its first send.
		// Legacy rows (sentAt without firstSentAt) skip the debit but still get
		// the key backfilled, or a later revert-to-draft — which clears sentAt —
		// would re-arm a debit for an already-sent quote.
		let reviveStamp:
			| { sentAt: number; firstSentAt: number }
			| { firstSentAt: number }
			| undefined;
		if (revived && !quote.firstSentAt) {
			if (!quote.sentAt) {
				const { plan } = await entitlementsFromIdentity(ctx);
				// One timestamp so the check and debit share a billing period.
				const now = Date.now();
				await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
				await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
				reviveStamp = { sentAt: now, firstSentAt: now };
			} else {
				reviveStamp = { firstSentAt: quote.sentAt };
			}
		}
		await ctx.db.patch(args.id, {
			validUntil: args.validUntil,
			// The date prints on the PDF, so the existing render goes stale.
			contentUpdatedAt: Date.now(),
			...(revived ? { status: "sent" as const } : {}),
			...reviveStamp,
		});

		if (revived) {
			await emitStatusChangeEvent(
				ctx,
				quote.orgId,
				"quote",
				args.id,
				"expired",
				"sent",
				"quotes.extendValidUntil"
			);
		}

		// The date prints on the PDF, so an existing render is now stale. Re-render
		// it here rather than waiting for the next send: the portal serves this
		// document to the client today. Quotes that never had a PDF stay without
		// one — sendToClient/ensureQuotePdf make the first render.
		const existingPdf = await ctx.db
			.query("documents")
			.withIndex("by_document_version", (q) =>
				q.eq("documentType", "quote").eq("documentId", args.id)
			)
			.first();
		if (existingPdf) {
			await ctx.scheduler.runAfter(0, internal.pdfActions.generateQuotePdf, {
				quoteId: args.id,
				orgId: quote.orgId,
			});
		}

		// quotes.update used to emit this for validUntil edits — record_updated
		// automation triggers must not go dark now that every surface saves here.
		await emitRecordUpdatedEvent(
			ctx,
			quote.orgId,
			"quote",
			args.id,
			["validUntil"],
			"quotes.extendValidUntil"
		);

		return args.id;
	},
});

/**
 * Send a quote to the client: flips draft/declined/expired→sent and schedules
 * a branded portal-invite email deep-linking to the quote in the client
 * portal, where the client reviews and approves/declines. Mirror of
 * invoices.sendToClient. Deliberately separate from the BoldSign e-signature
 * flow, which stays web-only; an already-sent quote can be re-sent without a
 * status change.
 */
export const sendToClient = userMutation({
	args: { id: v.id("quotes"), ...entitySendArgs },
	returns: v.id("quotes"),
	handler: async (ctx, args): Promise<QuoteId> => {
		await ctx.requireLevel("quotes", "modify");
		const quote = await ctx.orgEntity("quotes", args.id);
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

		if (quote.status === "approved") {
			throw new ConvexError({
				code: "CONFLICT",
				message:
					"This quote is already approved — convert it to an invoice instead.",
			});
		}

		// The portal gates approval on sent status alone, so sending is the last
		// line of defense against putting an expired offer back in front of the
		// client (extendValidUntil is the revive path that refreshes the window).
		// Same calendar-day comparison as extendValidUntil: valid through today
		// still sends.
		if (quote.validUntil !== undefined) {
			const tz = (await ctx.db.get(ctx.orgId))?.timezone ?? "UTC";
			if (quote.validUntil < calendarDayEpoch(Date.now(), tz)) {
				throw new ConvexError({
					code: "CONFLICT",
					message:
						"This quote's valid-until date has passed — extend it before sending.",
				});
			}
		}

		// The client must be reachable in the portal: portal access enabled and a
		// primary contact with an email to receive the invite.
		const client = await ctx.db.get(quote.clientId);
		if (!client || client.orgId !== quote.orgId) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Quote client not found.",
			});
		}
		// Nothing ever clears portalAccessId (rotation replaces it), so minting on
		// demand can't revive access someone revoked.
		let portalAccessId = client.portalAccessId;
		if (!portalAccessId) {
			portalAccessId = await mintPortalAccessId(ctx);
			await ctx.db.patch(client._id, { portalAccessId });
		}
		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", client._id).eq("isPrimary", true)
			)
			.first();
		const recipientEmail = primaryContact?.email?.trim();
		if (!recipientEmail) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Add an email to this client's primary contact before sending.",
			});
		}

		// Everything the send needs is resolved before the status flip and meter
		// debit, so a suppressed recipient or a missing attachment can't leave a
		// quote marked sent with nothing delivered.
		const recipients = resolveRecipients(args, recipientEmail);
		await assertNoSuppressedRecipients(ctx, quote.orgId, [
			...recipients.to,
			...recipients.cc,
			...recipients.bcc,
		]);
		const attachments = await resolveOutboundAttachments(
			ctx,
			quote.orgId,
			args.attachments,
			{ type: "quote", id: args.id }
		);
		const customHtml =
			args.mode === "custom"
				? sanitizeHtml(args.html ?? "").trim() || undefined
				: undefined;
		if (args.mode === "custom" && !customHtml) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Write a message before sending.",
			});
		}
		if (!process.env.PORTAL_JWT_ISSUER) {
			throw new ConvexError({
				code: "CONFLICT",
				message:
					"Portal links aren't configured for this workspace, so the quote email can't be sent. Contact support.",
			});
		}

		// Sending is the act of sending: draft, declined, and expired all move to
		// sent (a "send again" reopens the quote). Already-sent quotes re-send
		// the email without a transition.
		// The send meter debits only the FIRST send ever — keyed on the
		// immutable firstSentAt (sentAt clears on revert-to-draft; legacy rows
		// predate firstSentAt, so sentAt still counts as proof of a past debit).
		if (!quote.firstSentAt) {
			if (!quote.sentAt) {
				const { plan } = await entitlementsFromIdentity(ctx);
				// One timestamp so the check and debit share a billing period.
				const now = Date.now();
				await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
				await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
				// Stamp the debit key; also self-heal sentAt for raw status writes
				// that left a sent quote without one, so this debit can never repeat
				// — the transition block below only runs for non-sent statuses.
				await ctx.db.patch(quote._id, {
					firstSentAt: now,
					...(quote.status === "sent" ? { sentAt: now } : {}),
				});
			} else {
				// Legacy row sent before firstSentAt existed: backfill the key with
				// no new debit, or a later revert-to-draft (which clears sentAt)
				// would re-arm a debit for an already-sent quote.
				await ctx.db.patch(quote._id, { firstSentAt: quote.sentAt });
			}
		}
		if (quote.status !== "sent") {
			const oldStatus = quote.status;
			const changes = computeFieldChanges(
				"quote",
				quote as unknown as Record<string, unknown>,
				{ status: "sent" }
			);
			await ctx.db.patch(quote._id, { status: "sent", sentAt: Date.now() });
			const updated = await ctx.db.get(quote._id);
			if (updated) {
				await ActivityHelpers.quoteSent(
					ctx,
					updated as QuoteDocument,
					client.companyName || "Unknown Client",
					changes
				);
				await emitStatusChangeEvent(
					ctx,
					updated.orgId,
					"quote",
					updated._id,
					oldStatus,
					"sent",
					"quotes.sendToClient"
				);
			}
		}

		// Every sent quote must end up with a CURRENT PDF (the portal blocks
		// approval without one — the audit row pins the version the client acted
		// on). Web enforces this at send time in the UI; here we self-heal by
		// scheduling a server-side render of the same template when none exists
		// or the newest one predates a content edit (revert→edit→resend cycle).
		const newestPdf = await ctx.db
			.query("documents")
			.withIndex("by_document_version", (q) =>
				q.eq("documentType", "quote").eq("documentId", args.id)
			)
			.order("desc")
			.first();
		if (
			!newestPdf ||
			newestPdf.generatedAt < (quote.contentUpdatedAt ?? 0)
		) {
			await ctx.scheduler.runAfter(0, internal.pdfActions.generateQuotePdf, {
				quoteId: args.id,
				orgId: quote.orgId,
			});
		}

		const organization = await ctx.db.get(quote.orgId);
		if (!organization) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Organization not found.",
			});
		}
		const senderName = ctx.user.name || organization.name || "OneTool";
		const subject =
			args.subject?.trim() ||
			(quote.quoteNumber
				? `Quote ${quote.quoteNumber} from ${organization.name}`
				: `New quote from ${organization.name}`);
		// A resend must land in the thread the client already replied into, so
		// reuse the newest message sent for this quote rather than forking.
		const priorSend = await ctx.db
			.query("emailMessages")
			.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
			.order("desc")
			.first();
		const priorForOrg =
			priorSend && priorSend.orgId === quote.orgId ? priorSend : null;
		const threadDocId = await getOrCreateOutboundThread(ctx, {
			orgId: quote.orgId,
			clientId: quote.clientId,
			subject,
			...(priorForOrg?.threadDocId
				? { existingThreadDocId: priorForOrg.threadDocId }
				: priorForOrg?.threadId
					? { legacyThreadId: priorForOrg.threadId }
					: {}),
		});
		const idempotencyKey = args.requestId
			? `quote-${quote._id}-${args.requestId}`
			: undefined;

		if (customHtml) {
			const bodyText = htmlToPlainText(customHtml);
			const portalUrl = buildPortalQuoteUrl({
				portalAccessId,
				quoteId: quote._id,
			});
			const html = buildEmailHtml({
				logoUrl: organization.logoUrl,
				organizationName: organization.name,
				organizationEmail: organization.email,
				organizationPhone: organization.phone,
				organizationAddress: organization.address,
				clientName: primaryContact
					? `${primaryContact.firstName} ${primaryContact.lastName}`.trim()
					: undefined,
				messageBody: bodyText,
				messageHtml: customHtml,
				senderName,
				customPortalEmail: true,
				cta: { url: portalUrl, label: "Review quote" },
			});
			const fromEmail = resolveFromEmail(organization);
			const result = await deliverOutbound(ctx, {
				orgId: quote.orgId,
				clientId: quote.clientId,
				threadDocId,
				message: {
					from: formatEmailFrom(senderName, fromEmail),
					to: recipients.to,
					cc: recipients.cc,
					bcc: recipients.bcc,
					replyTo: [
						plusTagAddress(resolveReplyToEmail(organization), threadDocId),
					],
					subject,
					html,
					text: bodyText,
					idempotencyKey,
					attachments,
				},
				record: {
					messageBody: bodyText,
					messagePreview: bodyText.substring(0, 100),
					htmlBody: customHtml,
					visibleText: bodyText,
					fromEmail,
					fromName: senderName,
					toName: primaryContact
						? `${primaryContact.firstName} ${primaryContact.lastName}`.trim()
						: recipients.to[0],
					sentBy: ctx.user._id,
					quoteId: quote._id,
					...(quote.projectId ? { projectId: quote.projectId } : {}),
				},
			});
			if (result.outcome === "suppressed") {
				throw new ConvexError({
					code: "RECIPIENT_SUPPRESSED",
					message:
						"This recipient can't receive email — a previous message hard-bounced or was marked as spam.",
				});
			}
		} else {
			// Template mode renders react-email, which needs an action.
			await ctx.scheduler.runAfter(
				0,
				internal.portal.quoteEmail.sendQuoteReadyEmail,
				{
					quoteId: quote._id,
					threadDocId,
					subject,
					senderName,
					sentBy: ctx.user._id,
					to: recipients.to,
					cc: recipients.cc,
					bcc: recipients.bcc,
					attachments,
					idempotencyKey,
				}
			);
		}

		return args.id;
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
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

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
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

		// Check if quote has related invoices
		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();

		if (invoices.length > 0) {
			throw new ConvexError({
				code: "CONFLICT",
				message:
					"Cannot delete quote with existing invoices. " +
					"Please remove or unlink the invoices first.",
			});
		}

		// Delete line items first
		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();

		for (const lineItem of lineItems) {
			await ctx.db.delete(lineItem._id);
		}

		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Get sent quotes expiring or already expired within the next 7 days
 */
export const getAwaitingSigning = optionalUserQuery({
	// Callers pass a day-rounded `now` so the result is cacheable.
	args: { now: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const orgId = ctx.orgId;
		if (!orgId) return [];
		await ctx.requireLevel("quotes", "view");

		const now = args.now ?? Date.now();
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
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

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

				// In-person rows: surface who captured the signature (org user).
				// (No org check: `users` has no orgId — membership is its own table —
				// and capturedByUserId is always the authenticated capturer.)
				const capturedBy = row.capturedByUserId
					? await ctx.db.get(row.capturedByUserId)
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
					channel: row.channel ?? null,
					capturedByName: capturedBy?.name ?? null,
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

/**
 * Upload target for the in-person signature blob. Quotes-gated (not
 * documents-gated like documents.generateUploadUrl) so a member with
 * quotes-modify but without documents-modify can still complete the
 * signature flow — the blob only ever lands on a quoteApprovals row.
 */
export const generateSignatureUploadUrl = userMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.requireLevel("quotes", "modify");
		return await ctx.storage.generateUploadUrl();
	},
});

// Stroke JSON on an in-person approval. Generous for a real signature (a busy
// one runs a few KB) while staying far under the document size limit the audit
// row shares with its line-item snapshot.
const MAX_SIGNATURE_RAW_DATA_CHARS = 200_000;

/**
 * Slice 3 (mobile 3.0): in-person signature capture — the client signs on an
 * org device. Writes a FULL quoteApprovals audit row (portal parity, `channel:
 * "in_person"`) and applies the same status effects as portal approval.
 *
 * Mirrors portal/quotes._commitApproval, with the workspace trust model:
 * authenticated org user with quotes-modify instead of portal session +
 * attestation. `ipAddress` carries the "in-person" sentinel — mutations never
 * see a client IP, and the meaningful actor (capturedByUserId) is recorded.
 * Terms acceptance is presented inline above the canvas, so termsAcceptedAt
 * stamps unconditionally; intentAffirmedAt stays typed-signature-only (never
 * set here — drawn signatures carry intent inherently).
 */
export const approveInPerson = userMutation({
	args: {
		id: v.id("quotes"),
		clientContactId: v.id("clientContacts"),
		expectedDocumentId: v.id("documents"),
		signatureStorageId: v.id("_storage"),
		signatureRawData: v.optional(v.string()),
		deviceDescription: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.requireLevel("quotes", "modify");
		const quote = await ctx.orgEntity("quotes", args.id);
		await ctx.requireRecordScope("quotes", {
			projectId: quote.projectId,
			clientId: quote.clientId,
		});

		if (quote.status !== "sent") {
			throw new ConvexError({
				code: "QUOTE_NOT_PENDING",
				message: "Only sent quotes can be signed.",
			});
		}

		// The stroke JSON rides along in the audit document; an oversized payload
		// would blow the row's size limit deep inside the insert, after the OCC
		// and scope work. Reject it up front with a message the client can show.
		if (
			args.signatureRawData !== undefined &&
			args.signatureRawData.length > MAX_SIGNATURE_RAW_DATA_CHARS
		) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Signature data is too large to store.",
			});
		}

		const contact = await ctx.db.get(args.clientContactId);
		if (
			!contact ||
			contact.orgId !== ctx.orgId ||
			contact.clientId !== quote.clientId
		) {
			throw new ConvexError({
				code: "FORBIDDEN",
				message: "Signer must be a contact on this quote's client.",
			});
		}

		// Document pin: same OCC semantics as the portal commit — the audit row
		// pins the exact PDF version the approval covers; pin latestDocumentId
		// here iff nothing is pinned yet.
		const doc = await ctx.db.get(args.expectedDocumentId);
		if (
			!doc ||
			doc.orgId !== ctx.orgId ||
			doc.documentType !== "quote" ||
			doc.documentId !== args.id
		) {
			throw new ConvexError({
				code: "QUOTE_VERSION_STALE",
				latestDocumentId: quote.latestDocumentId ?? null,
			});
		}
		if (quote.latestDocumentId == null) {
			await ctx.db.patch(args.id, { latestDocumentId: args.expectedDocumentId });
		} else if (quote.latestDocumentId !== args.expectedDocumentId) {
			// The pin can predate a content edit (revert→edit→resend after a
			// BoldSign pin): a CURRENT document supersedes a stale pin — without
			// this, ensureQuotePdf renders fresh versions the OCC check here
			// would reject forever. Anything else is a genuine version race.
			const pinned = await ctx.db.get(quote.latestDocumentId);
			const contentUpdatedAt = quote.contentUpdatedAt ?? 0;
			if (
				pinned &&
				pinned.generatedAt < contentUpdatedAt &&
				doc.generatedAt >= contentUpdatedAt
			) {
				await ctx.db.patch(args.id, {
					latestDocumentId: args.expectedDocumentId,
				});
			} else {
				throw new ConvexError({
					code: "QUOTE_VERSION_STALE",
					latestDocumentId: quote.latestDocumentId,
				});
			}
		}

		const client = await ctx.db.get(quote.clientId);
		const clientName = client?.companyName ?? "Client";

		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();
		const lineItemsSnapshot = lineItems
			.slice()
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((li) => ({
				description: li.description,
				quantity: li.quantity,
				unit: li.unit,
				rate: li.rate,
				amount: li.amount,
				sortOrder: li.sortOrder,
			}));
		const totals = await calculateQuoteTotals(ctx, args.id, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		const now = Date.now();

		// 1. Audit row first (portal commit ordering).
		const auditId = await ctx.db.insert("quoteApprovals", {
			quoteId: args.id,
			orgId: ctx.orgId,
			clientContactId: args.clientContactId,
			action: "approved",
			signatureStorageId: args.signatureStorageId,
			signatureMode: "drawn",
			signatureRawData: args.signatureRawData,
			ipAddress: "in-person",
			userAgent: (args.deviceDescription ?? "OneTool mobile").slice(0, 512),
			documentId: args.expectedDocumentId,
			documentVersion: doc.version,
			lineItemsSnapshot,
			subtotalSnapshot: totals.subtotal,
			taxSnapshot: totals.taxAmount,
			totalSnapshot: totals.total,
			termsSnapshot: quote.terms,
			termsAcceptedAt: now,
			channel: "in_person",
			capturedByUserId: ctx.user._id,
			createdAt: now,
		});

		// 2. Status patch second.
		await ctx.db.patch(args.id, {
			status: "approved",
			approvedAt: now,
		});
		const updatedQuote = await ctx.db.get(args.id);

		// 3. Activity, 4. status event, 5. celebration — portal commit ordering.
		if (updatedQuote) {
			await ActivityHelpers.quoteApproved(ctx, updatedQuote, clientName);
		}
		await emitStatusChangeEvent(
			ctx,
			ctx.orgId,
			"quote",
			args.id,
			"sent",
			"approved",
			"quotes.approveInPerson"
		);
		if (updatedQuote) {
			await celebrateQuoteApproved(ctx, updatedQuote, ctx.user._id);
		}

		return { auditId, approvedAt: now };
	},
});
