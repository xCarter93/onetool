import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import { externalIoPool } from "./externalIoPool";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/factories";
import type { UserMutationCtx, UserQueryCtx } from "./lib/factories";
import { getCurrentUserOrThrow } from "./lib/auth";
import {
	entitlementsFromIdentity,
	isFeatureAllowed,
	requireFeature,
} from "./lib/entitlements";

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

/** A run stuck mid-fetch or mid-commit this long is reclaimed by the next run. */
const RUN_RECLAIM_MS = 30 * 60 * 1000;

/** Rows applied per commit batch, and rows deleted per discard batch. */
const COMMIT_BATCH = 100;
const DELETE_BATCH = 200;

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
	await requireFeature(ctx, "quickbooks");
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
	// Sub-customers only: which customer they hang off, and its name for review.
	parentQboId: v.optional(v.string()),
	parentDisplayName: v.optional(v.string()),
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
	parentQboId?: string;
	parentDisplayName?: string;
	billAddr?: {
		line1?: string;
		city?: string;
		state?: string;
		postalCode?: string;
		country?: string;
	};
};

/** The subset of a QBO customer needed to create a OneTool client. */
type ImportedClientSource = {
	displayName: string;
	email?: string;
	phone?: string;
	givenName?: string;
	familyName?: string;
	billAddr?: {
		line1?: string;
		city?: string;
		state?: string;
		postalCode?: string;
		country?: string;
	};
};

type QboAddress = {
	line1?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
};

/**
 * Mirrors `hasLocation` in quickbooksImportActions.ts: the fetch side only sends
 * an address that carries some location, so the property gate here must accept
 * the same shapes or a city-only job site would be silently dropped.
 */
function hasUsableAddress(addr: QboAddress | undefined): addr is QboAddress {
	return Boolean(
		addr && (addr.line1 || addr.city || addr.state || addr.postalCode)
	);
}

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
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
			throw new ConvexError("not_premium");
		}

		// One active run per org — a second run would race on the same links.
		// A run whose action died before its catch can strand "running" (or
		// "committing") forever, so anything in flight past 30 minutes is
		// reclaimed as failed. A "reviewing" run is durable and never expires:
		// it holds proposals only, so a new run simply supersedes it.
		const existing = await ctx.db
			.query("quickbooksImportRuns")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		for (const run of existing) {
			if (run.status === "running" || run.status === "committing") {
				const since =
					run.status === "committing"
						? (run.committingAt ?? run.startedAt)
						: run.startedAt;
				if (Date.now() - since > RUN_RECLAIM_MS) {
					await ctx.db.patch(run._id, {
						status: "failed",
						lastError: "Import stalled and was reclaimed by a new run",
					});
					await ctx.scheduler.runAfter(
						0,
						internal.quickbooksImport.deleteRunRowsPage,
						{ runId: run._id }
					);
					continue;
				}
				throw new ConvexError("import_already_running");
			}
			if (run.status === "reviewing") {
				await ctx.db.patch(run._id, {
					status: "failed",
					lastError: "Superseded by a new import",
				});
				await ctx.scheduler.runAfter(
					0,
					internal.quickbooksImport.deleteRunRowsPage,
					{ runId: run._id }
				);
				continue;
			}
			// Legacy awaiting_review runs stay blocking: they carry real links
			// already and are cleared through resolveImportRow/skipImportRow.
			if (run.status === "awaiting_review") {
				throw new ConvexError("import_already_running");
			}
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
		// A fetch action can outlive the reclaim that failed its run. Without this
		// fence its late pages would re-create rows after deleteRunRowsPage
		// finished, stranding them forever. Throwing also stops the zombie's loop.
		if (run.status !== "running") {
			throw new ConvexError("import_run_not_active");
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

		// qboIds already rowed for this run, seeded per customer by an indexed
		// point lookup (idempotent re-entry of a page) and then kept in memory.
		const rowedQboIds = new Set<string>();

		// Match pool for this page. A proposed link drops its target out via
		// linkedLocalIds so two customers can't propose the same client.
		const candidatePool: Array<{ _id: Id<"clients">; companyName: string }> =
			clients.map((client) => ({
				_id: client._id,
				companyName: client.companyName,
			}));

		const counters = {
			totalFetched: 0,
			autoLinked: 0,
			ambiguous: 0,
			proposedLink: 0,
			proposedImport: 0,
			proposedSkip: 0,
			proposedProperty: 0,
		};

		for (const customer of args.customers as ImportCustomer[]) {
			if (rowedQboIds.has(customer.qboId)) continue;
			const alreadyRowed = await ctx.db
				.query("quickbooksImportRows")
				.withIndex("by_run_qbo", (q) =>
					q.eq("runId", args.runId).eq("qboId", customer.qboId)
				)
				.first();
			if (alreadyRowed) {
				rowedQboIds.add(customer.qboId);
				continue;
			}
			rowedQboIds.add(customer.qboId);
			counters.totalFetched += 1;

			const rowBase = {
				orgId: args.orgId,
				runId: args.runId,
				qboId: customer.qboId,
				qboDisplayName: customer.displayName,
				qboEmail: customer.email,
				qboCompanyName: customer.companyName,
				qboSnapshot: {
					phone: customer.phone,
					givenName: customer.givenName,
					familyName: customer.familyName,
					billAddr: customer.billAddr,
				},
			};

			// Sub-customers (jobs) are QBO's job-site construct, not a client. One
			// carrying an address becomes a property on its parent's client; one
			// with nothing to place stays a plain, non-overridable skip.
			if (customer.isJob === true) {
				if (customer.parentQboId && hasUsableAddress(customer.billAddr)) {
					await ctx.db.insert("quickbooksImportRows", {
						...rowBase,
						outcome: "proposed_property",
						parentQboId: customer.parentQboId,
						parentDisplayName: customer.parentDisplayName,
					});
					counters.proposedProperty += 1;
					continue;
				}
				await ctx.db.insert("quickbooksImportRows", {
					...rowBase,
					outcome: "proposed_skip",
					skipReason: "sub_customer",
				});
				counters.proposedSkip += 1;
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

			if (candidates.length === 1) {
				// Proposal only — the link is written by the commit pass.
				const clientId = candidates[0]._id;
				linkedLocalIds.add(clientId);
				await ctx.db.insert("quickbooksImportRows", {
					...rowBase,
					outcome: "proposed_link",
					linkedClientId: clientId,
				});
				counters.proposedLink += 1;
				continue;
			}

			// No match — propose bringing the customer in as a new client. The
			// client does not exist yet, so it cannot join the candidate pool:
			// two same-name unmatched customers each propose their own import.
			await ctx.db.insert("quickbooksImportRows", {
				...rowBase,
				outcome: "proposed_import",
			});
			counters.proposedImport += 1;
		}

		const latest = await ctx.db.get(args.runId);
		if (latest) {
			await ctx.db.patch(args.runId, {
				totalFetched: latest.totalFetched + counters.totalFetched,
				// autoLinked counts pre-existing links only until the commit pass.
				autoLinked: latest.autoLinked + counters.autoLinked,
				ambiguous: latest.ambiguous + counters.ambiguous,
				proposedLink: (latest.proposedLink ?? 0) + counters.proposedLink,
				proposedImport: (latest.proposedImport ?? 0) + counters.proposedImport,
				proposedSkip: (latest.proposedSkip ?? 0) + counters.proposedSkip,
				proposedProperty:
					(latest.proposedProperty ?? 0) + counters.proposedProperty,
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
	customer: ImportedClientSource
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
	await createPropertyFromQboAddress(ctx, {
		orgId,
		clientId,
		addr: customer.billAddr,
	});

	return clientId;
}

/**
 * Create a clientProperties row from a QBO address. Shared by the imported
 * client's billing address and by sub-customer job sites so both get the same
 * field mapping — and the same follow-up geocode, which the import path is the
 * only way to get coordinates (manual entry gets them from address autofill).
 */
async function createPropertyFromQboAddress(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		clientId: Id<"clients">;
		addr:
			| {
					line1?: string;
					city?: string;
					state?: string;
					postalCode?: string;
					country?: string;
			  }
			| undefined;
		propertyName?: string;
	}
): Promise<Id<"clientProperties"> | null> {
	const addr = args.addr;
	if (!hasUsableAddress(addr)) return null;

	// A linked (rather than imported) parent may already have a primary.
	const existingPrimary = await ctx.db
		.query("clientProperties")
		.withIndex("by_primary", (q) =>
			q.eq("clientId", args.clientId).eq("isPrimary", true)
		)
		.first();

	const propertyId = await ctx.db.insert("clientProperties", {
		clientId: args.clientId,
		orgId: args.orgId,
		propertyName: args.propertyName,
		streetAddress: addr.line1 ?? "",
		city: addr.city ?? "",
		state: addr.state ?? "",
		zipCode: addr.postalCode ?? "",
		country: addr.country,
		isPrimary: !existingPrimary,
	});
	await scheduleGeocode(ctx, propertyId);
	return propertyId;
}

/**
 * Imported addresses arrive without coordinates; backfill them out of band.
 * Routed through the shared externalIoPool rather than a raw scheduler kick: a
 * commit batch creates up to 100 properties, and an unbounded Mapbox burst
 * earns 429s whose lost coordinates are never retried.
 */
async function scheduleGeocode(
	ctx: MutationCtx,
	propertyId: Id<"clientProperties">
): Promise<void> {
	await externalIoPool.enqueueAction(
		ctx,
		internal.geocodeActions.geocodeClientProperty,
		{ propertyId }
	);
}

/**
 * Close the fetch pass out. Every non-empty run lands in `reviewing`: nothing
 * has been written to client data yet, and the reviewer commits explicitly.
 * A run that fetched nothing has nothing to review, so it completes directly
 * rather than parking the wizard on an empty table.
 */
export const finishRun = internalMutation({
	args: { runId: v.id("quickbooksImportRuns") },
	handler: async (ctx, args): Promise<null> => {
		const run = await ctx.db.get(args.runId);
		if (!run) return null;
		// Same reclaim race as processCustomerPage: a zombie action's finishRun
		// must not walk a failed run back to reviewing.
		if (run.status !== "running") return null;

		if (run.totalFetched === 0) {
			await ctx.db.patch(args.runId, {
				status: "completed",
				completedAt: Date.now(),
			});
			return null;
		}
		await ctx.db.patch(args.runId, { status: "reviewing" });
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
// Internal API — commit pass
// ============================================================================

/**
 * Outcomes a commit batch still has to apply.
 *
 * ORDER IS LOAD-BEARING: `proposed_property` is LAST. A property row needs its
 * parent customer's client link to exist, and the drain is outcome-by-outcome —
 * `pending` is filled in this array's order and applied in that same order, so
 * every parent row (link or import) is finalized before the first property row
 * of the same batch runs, and earlier batches drain parents entirely before a
 * batch ever reaches properties.
 */
const PROPOSAL_OUTCOMES = [
	"proposed_link",
	"proposed_import",
	"proposed_skip",
	"ambiguous",
	"proposed_property",
] as const;

type EffectiveDecision = "link" | "import" | "skip";

/**
 * A row's decision: the reviewer's override when set, otherwise the proposal.
 * `proposed_skip` (sub-customers) is never overridable, so it ignores decision.
 */
function effectiveDecision(
	row: Doc<"quickbooksImportRows">
): EffectiveDecision | null {
	if (row.outcome === "proposed_skip") return "skip";
	if (row.decision) return row.decision;
	if (row.outcome === "proposed_link") return "link";
	if (row.outcome === "proposed_import") return "import";
	return null; // undecided ambiguous — commitImportRun refuses to start
}

/** Delete a run's rows in batches; used by discard and by supersede. */
export const deleteRunRowsPage = internalMutation({
	args: { runId: v.id("quickbooksImportRuns") },
	handler: async (ctx, args): Promise<null> => {
		const rows = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_run", (q) => q.eq("runId", args.runId))
			.take(DELETE_BATCH);
		for (const row of rows) {
			await ctx.db.delete(row._id);
		}
		if (rows.length === DELETE_BATCH) {
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksImport.deleteRunRowsPage,
				{ runId: args.runId }
			);
		}
		return null;
	},
});

/**
 * Apply one batch of decisions, then reschedule itself. Re-entrant by design:
 * a batch only ever reads rows still in a proposal outcome, so a re-kicked or
 * crashed loop can never create the same client or link twice.
 */
export const commitPage = internalMutation({
	args: { runId: v.id("quickbooksImportRuns") },
	handler: async (ctx, args): Promise<null> => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.status !== "committing") return null;

		const pending: Doc<"quickbooksImportRows">[] = [];
		for (const outcome of PROPOSAL_OUTCOMES) {
			if (pending.length >= COMMIT_BATCH) break;
			const rows = await ctx.db
				.query("quickbooksImportRows")
				.withIndex("by_run_outcome", (q) =>
					q.eq("runId", args.runId).eq("outcome", outcome)
				)
				.take(COMMIT_BATCH - pending.length);
			pending.push(...rows);
		}

		if (pending.length === 0) {
			await ctx.db.patch(args.runId, {
				status: "completed",
				completedAt: Date.now(),
			});
			return null;
		}

		const counters = {
			autoLinked: 0,
			imported: 0,
			skipped: 0,
			properties: 0,
			ambiguousCleared: 0,
		};

		for (const row of pending) {
			// Sub-customer job sites: land on the parent's client, or skip. The
			// only override a reviewer can set here is "skip".
			if (row.outcome === "proposed_property") {
				if (row.decision === "skip") {
					await ctx.db.patch(row._id, {
						outcome: "skipped",
						skipReason: "user_skipped",
					});
					counters.skipped += 1;
					continue;
				}

				const parentLink = row.parentQboId
					? await ctx.db
							.query("quickbooksEntityLinks")
							.withIndex("by_org_qbo", (q) =>
								q
									.eq("orgId", run.orgId)
									.eq("entityType", "client")
									.eq("qboId", row.parentQboId!)
							)
							.first()
					: null;
				const parentClientId = parentLink
					? ctx.db.normalizeId("clients", parentLink.localId)
					: null;
				const parentClient = parentClientId
					? await ctx.db.get(parentClientId)
					: null;
				if (!parentClient || parentClient.orgId !== run.orgId) {
					await ctx.db.patch(row._id, {
						outcome: "skipped",
						skipReason: "parent_not_imported",
					});
					counters.skipped += 1;
					continue;
				}

				// Idempotent: a re-commit (or a second run over the same QBO data)
				// must not stack duplicate job sites on the client.
				const addr = row.qboSnapshot?.billAddr;
				const existing = await ctx.db
					.query("clientProperties")
					.withIndex("by_client", (q) => q.eq("clientId", parentClient._id))
					.collect();
				const duplicate = existing.find(
					(property) =>
						property.streetAddress === (addr?.line1 ?? "") &&
						property.city === (addr?.city ?? "")
				);
				if (duplicate) {
					// Still worth a geocode pass: the action no-ops when the row
					// already has coordinates, and backfills it when it doesn't.
					await scheduleGeocode(ctx, duplicate._id);
				} else {
					await createPropertyFromQboAddress(ctx, {
						orgId: run.orgId,
						clientId: parentClient._id,
						addr,
						propertyName: row.qboDisplayName,
					});
				}
				await ctx.db.patch(row._id, {
					outcome: "property_created",
					linkedClientId: parentClient._id,
				});
				counters.properties += 1;
				continue;
			}

			const decision = effectiveDecision(row);
			if (row.outcome === "ambiguous") counters.ambiguousCleared += 1;

			// Guarded upstream; must still leave the proposal outcome, or this
			// row would be refetched by every batch and the loop never ends.
			if (decision === null || decision === "skip") {
				await ctx.db.patch(row._id, {
					outcome: "skipped",
					skipReason: row.skipReason ?? "user_skipped",
					candidateClientIds: undefined,
				});
				counters.skipped += 1;
				continue;
			}

			// Whoever already owns this QBO customer locally, if anyone.
			const linkByQbo = await ctx.db
				.query("quickbooksEntityLinks")
				.withIndex("by_org_qbo", (q) =>
					q
						.eq("orgId", run.orgId)
						.eq("entityType", "client")
						.eq("qboId", row.qboId)
				)
				.first();

			if (decision === "link") {
				const clientId = row.decisionClientId ?? row.linkedClientId;
				const client = clientId ? await ctx.db.get(clientId) : null;
				if (!clientId || !client || client.orgId !== run.orgId) {
					await ctx.db.patch(row._id, {
						outcome: "skipped",
						skipReason: "missing_client",
						candidateClientIds: undefined,
					});
					counters.skipped += 1;
					continue;
				}

				const linkByClient = await ctx.db
					.query("quickbooksEntityLinks")
					.withIndex("by_org_entity", (q) =>
						q
							.eq("orgId", run.orgId)
							.eq("entityType", "client")
							.eq("localId", clientId)
					)
					.first();

				// Either side already spoken for by a different partner: skip
				// rather than clobber an existing mapping.
				const mismatched =
					(linkByClient && linkByClient.qboId !== row.qboId) ||
					(linkByQbo && linkByQbo.localId !== clientId);
				if (mismatched) {
					await ctx.db.patch(row._id, {
						outcome: "skipped",
						skipReason: "already_linked",
						linkedClientId: clientId,
						candidateClientIds: undefined,
					});
					counters.skipped += 1;
					continue;
				}

				if (!linkByClient) {
					// The row carries no SyncToken; the sync worker re-GETs on a
					// 5010 stale token, so "0" is safe as a seed.
					await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
						orgId: run.orgId,
						entityType: "client",
						localId: clientId,
						qboId: row.qboId,
						qboSyncToken: "0",
					});
				}
				await ctx.db.patch(row._id, {
					outcome: "auto_linked",
					linkedClientId: clientId,
					candidateClientIds: undefined,
				});
				counters.autoLinked += 1;
				continue;
			}

			// import — unless a previous (partial) commit already created it.
			if (linkByQbo) {
				const existingClientId = ctx.db.normalizeId(
					"clients",
					linkByQbo.localId
				);
				await ctx.db.patch(row._id, {
					outcome: "imported",
					linkedClientId: existingClientId ?? undefined,
					candidateClientIds: undefined,
				});
				counters.imported += 1;
				continue;
			}

			const newClientId = await createImportedClient(
				ctx,
				run.orgId,
				run.startedByUserId,
				{
					displayName: row.qboDisplayName,
					email: row.qboEmail,
					phone: row.qboSnapshot?.phone,
					givenName: row.qboSnapshot?.givenName,
					familyName: row.qboSnapshot?.familyName,
					billAddr: row.qboSnapshot?.billAddr,
				}
			);
			await ctx.runMutation(internal.quickbooks.upsertEntityLink, {
				orgId: run.orgId,
				entityType: "client",
				localId: newClientId,
				qboId: row.qboId,
				qboSyncToken: "0",
			});
			await ctx.db.patch(row._id, {
				outcome: "imported",
				linkedClientId: newClientId,
				candidateClientIds: undefined,
			});
			counters.imported += 1;
		}

		const latest = await ctx.db.get(args.runId);
		if (latest) {
			await ctx.db.patch(args.runId, {
				autoLinked: latest.autoLinked + counters.autoLinked,
				imported: latest.imported + counters.imported,
				skipped: latest.skipped + counters.skipped,
				properties: (latest.properties ?? 0) + counters.properties,
				ambiguous: Math.max(0, latest.ambiguous - counters.ambiguousCleared),
				committedRows: (latest.committedRows ?? 0) + pending.length,
			});
		}

		await ctx.scheduler.runAfter(0, internal.quickbooksImport.commitPage, {
			runId: args.runId,
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
	// Legacy surface: pre-rework runs parked in awaiting_review resolved rows
	// one at a time. Reviewing runs decide via setRowDecision + commitImportRun.
	const run = await ctx.db.get(row.runId);
	if (!run || run.status !== "awaiting_review") {
		throw new ConvexError("This import run is reviewed before it is applied");
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
// Public API — review surface (propose → review → commit)
// ============================================================================

/** The org's latest run, which must still be open for review. */
async function loadReviewingRun(
	ctx: UserMutationCtx
): Promise<Doc<"quickbooksImportRuns">> {
	const run = await ctx.db
		.query("quickbooksImportRuns")
		.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
		.order("desc")
		.first();
	if (!run) {
		throw new ConvexError("Import run not found");
	}
	if (run.status !== "reviewing") {
		throw new ConvexError("run_not_reviewing");
	}
	return run;
}

/**
 * Record (or clear back to) a decision for one proposal row. Writes nothing to
 * client data — the commit pass applies decisions. Ambiguous rows deliberately
 * accept ANY org client, not just the stored candidates: the review picker is
 * the point of the surface, and the candidate list is only a suggestion.
 */
export const setRowDecision = userMutation({
	args: {
		rowId: v.id("quickbooksImportRows"),
		decision: v.union(
			v.literal("link"),
			v.literal("import"),
			v.literal("skip")
		),
		clientId: v.optional(v.id("clients")),
	},
	handler: async (ctx, args): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const row = await ctx.db.get(args.rowId);
		if (!row || row.orgId !== ctx.orgId) {
			throw new ConvexError("Import row not found");
		}
		const run = await ctx.db.get(row.runId);
		if (!run || run.orgId !== ctx.orgId || run.status !== "reviewing") {
			throw new ConvexError("run_not_reviewing");
		}
		if (
			row.outcome !== "proposed_link" &&
			row.outcome !== "proposed_import" &&
			row.outcome !== "ambiguous" &&
			row.outcome !== "proposed_property"
		) {
			throw new ConvexError("This import row cannot be changed");
		}
		// A job site is never a client of its own, so "link" has no meaning for
		// it. "skip" drops it; "import" restores a skipped one to the proposal
		// (commitPage creates the property for any non-skip decision).
		if (row.outcome === "proposed_property" && args.decision === "link") {
			throw new ConvexError("This import row cannot link to a client");
		}

		if (args.decision !== "link") {
			await ctx.db.patch(row._id, {
				decision: args.decision,
				decisionClientId: undefined,
			});
			return null;
		}

		if (!args.clientId) {
			throw new ConvexError("Pick a client to link this customer to");
		}
		await ctx.orgEntity("clients", args.clientId);

		const existingLink = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", ctx.orgId)
					.eq("entityType", "client")
					.eq("localId", args.clientId!)
			)
			.first();
		// Re-picking the same QBO customer is a no-op, not a conflict.
		if (existingLink && existingLink.qboId !== row.qboId) {
			throw new ConvexError("That client is already linked to QuickBooks");
		}

		await ctx.db.patch(row._id, {
			decision: "link",
			decisionClientId: args.clientId,
		});
		return null;
	},
});

/** Apply the reviewed plan. Every ambiguous row must have an explicit pick. */
export const commitImportRun = userMutation({
	args: {},
	handler: async (ctx): Promise<{ runId: Id<"quickbooksImportRuns"> }> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const run = await loadReviewingRun(ctx);

		// Ambiguous rows are rare by construction (same-name collisions only).
		const ambiguousRows = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_run_outcome", (q) =>
				q.eq("runId", run._id).eq("outcome", "ambiguous")
			)
			.collect();
		if (ambiguousRows.some((row) => !row.decision)) {
			throw new ConvexError("undecided_ambiguous_rows");
		}

		await ctx.db.patch(run._id, {
			status: "committing",
			committingAt: Date.now(),
			committedRows: 0,
		});
		await ctx.scheduler.runAfter(0, internal.quickbooksImport.commitPage, {
			runId: run._id,
		});
		return { runId: run._id };
	},
});

/**
 * Throw the plan away before anything is applied. The run is marked `failed`
 * to keep the status union small — the UI reads this lastError as a quiet
 * "discarded" state, not an error.
 */
export const discardImportRun = userMutation({
	args: {},
	handler: async (ctx): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const run = await loadReviewingRun(ctx);
		await ctx.db.patch(run._id, {
			status: "failed",
			lastError: "Discarded before import",
		});
		await ctx.scheduler.runAfter(
			0,
			internal.quickbooksImport.deleteRunRowsPage,
			{ runId: run._id }
		);
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
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
			return null;
		}
		return await ctx.db
			.query("quickbooksImportRuns")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.order("desc")
			.first();
	},
});

export type ImportRowView = Doc<"quickbooksImportRows"> & {
	proposedClient?: { clientId: Id<"clients">; companyName: string };
	candidates?: Array<{ clientId: Id<"clients">; companyName: string }>;
	/** proposed_property rows: the parent customer's name, captured at fetch. */
	parentName?: string;
};

/**
 * Every row of a run, paginated, hydrated with the company names the review
 * table renders. Counts come off the run doc — there is no separate query.
 */
export const listImportRows = userQuery({
	args: {
		runId: v.id("quickbooksImportRuns"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (
		ctx: UserQueryCtx,
		args
	): Promise<PaginationResult<ImportRowView>> => {
		const empty: PaginationResult<ImportRowView> = {
			page: [],
			isDone: true,
			continueCursor: "",
		};
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
			return empty;
		}
		const run = await ctx.db.get(args.runId);
		if (!run || run.orgId !== ctx.orgId) {
			return empty;
		}

		const result = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_run", (q) => q.eq("runId", args.runId))
			.paginate(args.paginationOpts);

		const names = new Map<Id<"clients">, string>();
		const nameOf = async (
			clientId: Id<"clients">
		): Promise<string | undefined> => {
			const cached = names.get(clientId);
			if (cached !== undefined) return cached;
			const client = await ctx.db.get(clientId);
			if (!client || client.orgId !== ctx.orgId) return undefined;
			names.set(clientId, client.companyName);
			return client.companyName;
		};

		const page: ImportRowView[] = [];
		for (const row of result.page) {
			const view: ImportRowView = { ...row };
			if (row.parentDisplayName) view.parentName = row.parentDisplayName;
			const proposedId = row.decisionClientId ?? row.linkedClientId;
			if (proposedId) {
				const companyName = await nameOf(proposedId);
				if (companyName !== undefined) {
					view.proposedClient = { clientId: proposedId, companyName };
				}
			}
			if (row.candidateClientIds?.length) {
				const candidates: NonNullable<ImportRowView["candidates"]> = [];
				for (const clientId of row.candidateClientIds) {
					const companyName = await nameOf(clientId);
					if (companyName !== undefined) {
						candidates.push({ clientId, companyName });
					}
				}
				view.candidates = candidates;
			}
			page.push(view);
		}
		return { ...result, page };
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
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
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
