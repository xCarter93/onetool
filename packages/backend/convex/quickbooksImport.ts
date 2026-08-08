import { ConvexError, v } from "convex/values";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/factories";
import type { UserMutationCtx, UserQueryCtx } from "./lib/factories";
import { getCurrentUserOrThrow } from "./lib/auth";
import { hasPremiumAccess } from "./lib/permissions";

/**
 * One-time QBO→OneTool customer import (PRD §7).
 *
 * DB side only: the QBO fetching lives in quickbooksImportActions.ts, which
 * drives this file page by page. Matching is deliberately conservative —
 * anything with more than one plausible OneTool client becomes an `ambiguous`
 * row for a human to pick, never an auto-merge.
 */

// Cap stored candidates so a pathological name collision can't bloat a row.
const MAX_CANDIDATES = 10;

// ============================================================================
// Local auth helpers (mirrors quickbooks.ts — that file is owned elsewhere)
// ============================================================================

async function requireOrgOwner(ctx: UserMutationCtx): Promise<void> {
	const organization = await ctx.db.get(ctx.orgId);
	if (!organization) {
		throw new ConvexError("Organization not found");
	}
	if (organization.ownerUserId !== ctx.user._id) {
		throw new ConvexError(
			"Only the organization owner can manage the QuickBooks import"
		);
	}
}

async function requirePremium(ctx: UserMutationCtx): Promise<void> {
	if (!(await hasPremiumAccess(ctx))) {
		throw new ConvexError(
			"QuickBooks sync is available on the Business plan. Upgrade to use it."
		);
	}
}

// ============================================================================
// Shared shapes
// ============================================================================

/**
 * A QBO Customer flattened by the action. Keeping the wire shape out of the
 * mutation lets the args stay validated instead of `v.any()`.
 */
const IMPORT_CUSTOMER = v.object({
	qboId: v.string(),
	syncToken: v.optional(v.string()),
	displayName: v.string(),
	companyName: v.optional(v.string()),
	email: v.optional(v.string()),
	phone: v.optional(v.string()),
	givenName: v.optional(v.string()),
	familyName: v.optional(v.string()),
	isJob: v.boolean(),
	billAddr: v.optional(
		v.object({
			line1: v.optional(v.string()),
			city: v.optional(v.string()),
			state: v.optional(v.string()),
			postalCode: v.optional(v.string()),
			country: v.optional(v.string()),
		})
	),
});

type ImportCustomer = {
	qboId: string;
	syncToken?: string;
	displayName: string;
	companyName?: string;
	email?: string;
	phone?: string;
	givenName?: string;
	familyName?: string;
	isJob: boolean;
	billAddr?: {
		line1?: string;
		city?: string;
		state?: string;
		postalCode?: string;
		country?: string;
	};
};

function normalizeName(value: string | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

function normalizeEmail(value: string | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

/** Same collision probe as clients.ts: a duplicate takes a portal offline. */
async function mintPortalAccessId(ctx: MutationCtx): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const candidate = crypto.randomUUID();
		const collision = await ctx.db
			.query("clients")
			.withIndex("by_portal_access_id", (q) =>
				q.eq("portalAccessId", candidate)
			)
			.first();
		if (!collision) return candidate;
	}
	throw new Error("Could not allocate a unique portal access id");
}

// ============================================================================
// Internal API — run lifecycle
// ============================================================================

/**
 * Open a run. Identity propagates from the public action, so owner + premium
 * are re-checked here rather than trusting the action's pre-flight.
 */
export const startRun = internalMutation({
	args: { orgId: v.id("organizations"), realmId: v.string() },
	handler: async (ctx, args): Promise<Id<"quickbooksImportRuns">> => {
		const user = await getCurrentUserOrThrow(ctx);
		const organization = await ctx.db.get(args.orgId);
		if (!organization) {
			throw new ConvexError("Organization not found");
		}
		if (organization.ownerUserId !== user._id) {
			throw new ConvexError("not_owner");
		}
		if (!(await hasPremiumAccess(ctx))) {
			throw new ConvexError("not_premium");
		}

		// One active run per org — a second run would race on the same links.
		// A run whose action died before its catch can strand "running" forever,
		// so anything running longer than 30 minutes is reclaimed as failed.
		const RUN_RECLAIM_MS = 30 * 60 * 1000;
		const existing = await ctx.db
			.query("quickbooksImportRuns")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		for (const run of existing) {
			if (run.status !== "running" && run.status !== "awaiting_review") {
				continue;
			}
			if (
				run.status === "running" &&
				Date.now() - run.startedAt > RUN_RECLAIM_MS
			) {
				await ctx.db.patch(run._id, {
					status: "failed",
					lastError: "Import stalled and was reclaimed by a new run",
				});
				continue;
			}
			throw new ConvexError("import_already_running");
		}

		return await ctx.db.insert("quickbooksImportRuns", {
			orgId: args.orgId,
			realmId: args.realmId,
			status: "running",
			startedByUserId: user._id,
			startedAt: Date.now(),
			totalFetched: 0,
			autoLinked: 0,
			imported: 0,
			ambiguous: 0,
			skipped: 0,
		});
	},
});

/**
 * Match + write one page of QBO customers. Bounded work: the org's clients and
 * client links are read once per page, not once per customer.
 */
export const processCustomerPage = internalMutation({
	args: {
		orgId: v.id("organizations"),
		runId: v.id("quickbooksImportRuns"),
		customers: v.array(IMPORT_CUSTOMER),
	},
	handler: async (ctx, args): Promise<null> => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== args.orgId) {
			throw new ConvexError("Import run not found");
		}

		const clients = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();

		const clientLinks = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "client")
			)
			.collect();

		// localId -> link, and qboId -> localId, both maintained in-memory as the
		// page writes so later customers see earlier decisions.
		const linkedLocalIds = new Set(clientLinks.map((link) => link.localId));
		const byQboId = new Map(
			clientLinks.map((link) => [link.qboId, link.localId])
		);

		// Rows already written for this run (idempotent re-entry of a page).
		const existingRows = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_run", (q) => q.eq("runId", args.runId))
			.collect();
		const rowedQboIds = new Set(existingRows.map((row) => row.qboId));

		// Mutable client list so imported clients participate in later matching.
		const candidatePool: Array<{ _id: Id<"clients">; companyName: string }> =
			clients.map((client) => ({
				_id: client._id,
				companyName: client.companyName,
			}));

		const counters = {
			totalFetched: 0,
			autoLinked: 0,
			imported: 0,
			ambiguous: 0,
			skipped: 0,
		};

		for (const customer of args.customers as ImportCustomer[]) {
			if (rowedQboIds.has(customer.qboId)) continue;
			rowedQboIds.add(customer.qboId);
			counters.totalFetched += 1;

			const rowBase = {
				orgId: args.orgId,
				runId: args.runId,
				qboId: customer.qboId,
				qboDisplayName: customer.displayName,
				qboEmail: customer.email,
				qboCompanyName: customer.companyName,
			};

			// Sub-customers (jobs) are QBO's project construct, not a client.
			if (customer.isJob === true) {
				await ctx.db.insert("quickbooksImportRows", {
					...rowBase,
					outcome: "skipped",
					skipReason: "sub_customer",
				});
				counters.skipped += 1;
				continue;
			}

			// Already mapped (previous run, or synced out of OneTool earlier).
			const existingLocalId = byQboId.get(customer.qboId);
			if (existingLocalId) {
				const linkedClientId = ctx.db.normalizeId("clients", existingLocalId);
				await ctx.db.insert("quickbooksImportRows", {
					...rowBase,
					outcome: "auto_linked",
					linkedClientId: linkedClientId ?? undefined,
				});
				counters.autoLinked += 1;
				continue;
			}

			const targets = new Set(
				[normalizeName(customer.displayName), normalizeName(customer.companyName)].filter(
					(name) => name.length > 0
				)
			);
			let candidates = candidatePool.filter(
				(client) =>
					!linkedLocalIds.has(client._id) &&
					targets.has(normalizeName(client.companyName))
			);

			// Tie-break on the primary contact's email: a unique hit wins.
			const customerEmail = normalizeEmail(customer.email);
			if (candidates.length > 1 && customerEmail) {
				const emailMatches: typeof candidates = [];
				for (const candidate of candidates) {
					const contact = await ctx.db
						.query("clientContacts")
						.withIndex("by_primary", (q) =>
							q.eq("clientId", candidate._id).eq("isPrimary", true)
						)
						.first();
					if (contact && normalizeEmail(contact.email) === customerEmail) {
						emailMatches.push(candidate);
					}
				}
				if (emailMatches.length === 1) {
					candidates = emailMatches;
				}
			}

			if (candidates.length > 1) {
				await ctx.db.insert("quickbooksImportRows", {
					...rowBase,
					outcome: "ambiguous",
					candidateClientIds: candidates
						.slice(0, MAX_CANDIDATES)
						.map((candidate) => candidate._id),
				});
				counters.ambiguous += 1;
				continue;
			}

			const syncToken = customer.syncToken ?? "0";

			if (candidates.length === 1) {
				const clientId = candidates[0]._id;
				await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
					orgId: args.orgId,
					entityType: "client",
					localId: clientId,
					qboId: customer.qboId,
					qboSyncToken: syncToken,
				});
				linkedLocalIds.add(clientId);
				byQboId.set(customer.qboId, clientId);
				await ctx.db.insert("quickbooksImportRows", {
					...rowBase,
					outcome: "auto_linked",
					linkedClientId: clientId,
				});
				counters.autoLinked += 1;
				continue;
			}

			// No match — bring the customer in as a new client.
			const clientId = await createImportedClient(
				ctx,
				args.orgId,
				run.startedByUserId,
				customer
			);
			await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
				orgId: args.orgId,
				entityType: "client",
				localId: clientId,
				qboId: customer.qboId,
				qboSyncToken: syncToken,
			});
			linkedLocalIds.add(clientId);
			byQboId.set(customer.qboId, clientId);
			candidatePool.push({ _id: clientId, companyName: customer.displayName });
			await ctx.db.insert("quickbooksImportRows", {
				...rowBase,
				outcome: "imported",
				linkedClientId: clientId,
			});
			counters.imported += 1;
		}

		const latest = await ctx.db.get(args.runId);
		if (latest) {
			await ctx.db.patch(args.runId, {
				totalFetched: latest.totalFetched + counters.totalFetched,
				autoLinked: latest.autoLinked + counters.autoLinked,
				imported: latest.imported + counters.imported,
				ambiguous: latest.ambiguous + counters.ambiguous,
				skipped: latest.skipped + counters.skipped,
			});
		}
		return null;
	},
});

/**
 * Insert the client (+ primary contact and billing property) directly on the
 * triggers-wrapped db so searchText and the client aggregate stay correct.
 * Deliberately does NOT enqueue a QBO sync: the customer already exists there.
 */
async function createImportedClient(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	createdByUserId: Id<"users">,
	customer: ImportCustomer
): Promise<Id<"clients">> {
	const clientId = await ctx.db.insert("clients", {
		orgId,
		companyName: customer.displayName,
		status: "active",
		isActive: true,
		portalAccessId: await mintPortalAccessId(ctx),
		createdByUserId,
	});

	const hasContact = Boolean(
		customer.email || customer.phone || customer.givenName || customer.familyName
	);
	if (hasContact) {
		await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: customer.givenName ?? customer.displayName,
			lastName: customer.familyName ?? "",
			email: customer.email ? normalizeEmail(customer.email) : undefined,
			phone: customer.phone,
			isPrimary: true,
		});
	}

	// clients has no address columns — a billing address is a primary property.
	const addr = customer.billAddr;
	if (addr?.line1) {
		await ctx.db.insert("clientProperties", {
			clientId,
			orgId,
			streetAddress: addr.line1,
			city: addr.city ?? "",
			state: addr.state ?? "",
			zipCode: addr.postalCode ?? "",
			country: addr.country,
			isPrimary: true,
		});
	}

	return clientId;
}

/** Close the run out after the last page. */
export const finishRun = internalMutation({
	args: { runId: v.id("quickbooksImportRuns") },
	handler: async (ctx, args): Promise<null> => {
		const run = await ctx.db.get(args.runId);
		if (!run) return null;

		const ambiguous = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_run_outcome", (q) =>
				q.eq("runId", args.runId).eq("outcome", "ambiguous")
			)
			.first();

		if (ambiguous) {
			await ctx.db.patch(args.runId, { status: "awaiting_review" });
			return null;
		}
		await ctx.db.patch(args.runId, {
			status: "completed",
			completedAt: Date.now(),
		});
		return null;
	},
});

export const failRun = internalMutation({
	args: { runId: v.id("quickbooksImportRuns"), error: v.string() },
	handler: async (ctx, args): Promise<null> => {
		const run = await ctx.db.get(args.runId);
		if (!run) return null;
		await ctx.db.patch(args.runId, {
			status: "failed",
			lastError: args.error.slice(0, 500),
		});
		return null;
	},
});

// ============================================================================
// Public API — resolution surface
// ============================================================================

async function loadAmbiguousRow(
	ctx: UserMutationCtx,
	rowId: Id<"quickbooksImportRows">
): Promise<Doc<"quickbooksImportRows">> {
	const row = await ctx.db.get(rowId);
	if (!row || row.orgId !== ctx.orgId) {
		throw new ConvexError("Import row not found");
	}
	if (row.outcome !== "ambiguous") {
		throw new ConvexError("This import row has already been resolved");
	}
	return row;
}

/** Flip the run to completed once the reviewer clears the last ambiguous row. */
async function completeRunIfReviewed(
	ctx: UserMutationCtx,
	runId: Id<"quickbooksImportRuns">
): Promise<void> {
	const remaining = await ctx.db
		.query("quickbooksImportRows")
		.withIndex("by_run_outcome", (q) =>
			q.eq("runId", runId).eq("outcome", "ambiguous")
		)
		.first();
	if (remaining) return;

	const run = await ctx.db.get(runId);
	if (!run || run.status !== "awaiting_review") return;
	await ctx.db.patch(runId, { status: "completed", completedAt: Date.now() });
}

export const resolveImportRow = userMutation({
	args: {
		rowId: v.id("quickbooksImportRows"),
		clientId: v.id("clients"),
	},
	handler: async (ctx, args): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const row = await loadAmbiguousRow(ctx, args.rowId);
		if (!(row.candidateClientIds ?? []).includes(args.clientId)) {
			throw new ConvexError("That client is not a candidate for this row");
		}
		await ctx.orgEntity("clients", args.clientId);

		const alreadyLinked = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", ctx.orgId)
					.eq("entityType", "client")
					.eq("localId", args.clientId)
			)
			.first();
		if (alreadyLinked) {
			throw new ConvexError("That client is already linked to QuickBooks");
		}

		// The row carries no SyncToken; the sync worker re-GETs on a 5010 stale
		// token, so "0" is safe as a seed.
		await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
			orgId: ctx.orgId,
			entityType: "client",
			localId: args.clientId,
			qboId: row.qboId,
			qboSyncToken: "0",
		});

		await ctx.db.patch(row._id, {
			outcome: "resolved",
			linkedClientId: args.clientId,
			candidateClientIds: undefined,
		});

		const run = await ctx.db.get(row.runId);
		if (run) {
			await ctx.db.patch(row.runId, {
				ambiguous: Math.max(0, run.ambiguous - 1),
				autoLinked: run.autoLinked + 1,
			});
		}
		await completeRunIfReviewed(ctx, row.runId);
		return null;
	},
});

export const skipImportRow = userMutation({
	args: { rowId: v.id("quickbooksImportRows") },
	handler: async (ctx, args): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const row = await loadAmbiguousRow(ctx, args.rowId);
		await ctx.db.patch(row._id, {
			outcome: "skipped",
			skipReason: "user_skipped",
			candidateClientIds: undefined,
		});

		const run = await ctx.db.get(row.runId);
		if (run) {
			await ctx.db.patch(row.runId, {
				ambiguous: Math.max(0, run.ambiguous - 1),
				skipped: run.skipped + 1,
			});
		}
		await completeRunIfReviewed(ctx, row.runId);
		return null;
	},
});

// ============================================================================
// Public API — read surface
// ============================================================================

/** Latest run for the org. Null when unconnected/not premium (wizard hides). */
export const getImportRun = userQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"quickbooksImportRuns"> | null> => {
		if (!(await hasPremiumAccess(ctx))) {
			return null;
		}
		return await ctx.db
			.query("quickbooksImportRuns")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.order("desc")
			.first();
	},
});

export type AmbiguousImportRow = {
	rowId: Id<"quickbooksImportRows">;
	qboDisplayName: string;
	qboEmail?: string;
	candidates: Array<{ clientId: Id<"clients">; companyName: string }>;
};

/** Ambiguous rows of a run, hydrated with candidate names for the picker. */
export const listAmbiguousRows = userQuery({
	args: { runId: v.id("quickbooksImportRuns") },
	handler: async (ctx: UserQueryCtx, args): Promise<AmbiguousImportRow[]> => {
		if (!(await hasPremiumAccess(ctx))) {
			return [];
		}
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== ctx.orgId) {
			return [];
		}

		const rows = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_run_outcome", (q) =>
				q.eq("runId", args.runId).eq("outcome", "ambiguous")
			)
			.take(100);

		const names = new Map<Id<"clients">, string>();
		const out: AmbiguousImportRow[] = [];
		for (const row of rows) {
			const candidates: AmbiguousImportRow["candidates"] = [];
			for (const clientId of row.candidateClientIds ?? []) {
				let companyName = names.get(clientId);
				if (companyName === undefined) {
					const client = await ctx.db.get(clientId);
					if (!client || client.orgId !== ctx.orgId) continue;
					companyName = client.companyName;
					names.set(clientId, companyName);
				}
				candidates.push({ clientId, companyName });
			}
			out.push({
				rowId: row._id,
				qboDisplayName: row.qboDisplayName,
				qboEmail: row.qboEmail,
				candidates,
			});
		}
		return out;
	},
});
