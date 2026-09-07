import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/factories";
import type { UserMutationCtx, UserQueryCtx } from "./lib/factories";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import {
	entitlementsFromIdentity,
	isFeatureAllowed,
	requireFeature,
} from "./lib/entitlements";
import { formatCurrency } from "./lib/money";
import {
	maybeEnqueueQboSync,
	mintQboOperationId,
	type QboEntityType,
} from "./lib/quickbooksEnqueue";
import { createActivity } from "./lib/activities";
import { resolveMemberUserIds } from "./lib/automationExec/actions";
import { isInvoiceInActorScope } from "./lib/invoiceGroups";
import type { PermissionObject } from "./lib/permissionKeys";
import type { MutationCtx } from "./_generated/server";

/**
 * QuickBooks Online connection + token lifecycle (PRD §6.2, §6.5).
 * Actions live in quickbooksActions.ts ("use node"); this module is db-only.
 */

/** Connection doc safe to ship to the browser — tokens are stripped (PRD §9). */
export type PublicQboConnection = Omit<
	Doc<"quickbooksConnections">,
	"accessToken" | "refreshToken"
>;

function stripTokens(
	connection: Doc<"quickbooksConnections">
): PublicQboConnection {
	const { accessToken: _a, refreshToken: _r, ...rest } = connection;
	return rest;
}

async function connectionForOrg(
	ctx: UserQueryCtx | UserMutationCtx,
	orgId: Id<"organizations">
): Promise<Doc<"quickbooksConnections"> | null> {
	return await ctx.db
		.query("quickbooksConnections")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.first();
}

/** Connection management is owner-only, mirroring organizations.ts. */
async function requireOrgOwner(ctx: UserMutationCtx): Promise<void> {
	const organization = await ctx.db.get(ctx.orgId);
	if (!organization) {
		throw new ConvexError("Organization not found");
	}
	if (organization.ownerUserId !== ctx.user._id) {
		throw new ConvexError(
			"Only the organization owner can manage the QuickBooks connection"
		);
	}
}

async function requirePremium(ctx: UserMutationCtx): Promise<void> {
	await requireFeature(ctx, "quickbooks");
}

// ============================================================================
// Public API
// ============================================================================

/** Connection status for the Integrations tab. Null when unconnected or not premium. */
export const getConnectionStatus = userQuery({
	args: {},
	handler: async (ctx): Promise<PublicQboConnection | null> => {
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
			return null;
		}
		const connection = await connectionForOrg(ctx, ctx.orgId);
		return connection ? stripTokens(connection) : null;
	},
});

export const updateSyncSettings = userMutation({
	args: {
		syncInvoicesOn: v.optional(
			v.union(v.literal("sent"), v.literal("created"))
		),
		syncPayments: v.optional(v.boolean()),
		autoDisambiguateNames: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const connection = await connectionForOrg(ctx, ctx.orgId);
		if (!connection) {
			throw new ConvexError("QuickBooks is not connected");
		}

		const patch: Partial<Doc<"quickbooksConnections">> = {};
		if (args.syncInvoicesOn !== undefined)
			patch.syncInvoicesOn = args.syncInvoicesOn;
		if (args.syncPayments !== undefined) patch.syncPayments = args.syncPayments;
		if (args.autoDisambiguateNames !== undefined)
			patch.autoDisambiguateNames = args.autoDisambiguateNames;

		if (Object.keys(patch).length > 0) {
			await ctx.db.patch(connection._id, patch);
		}
		return null;
	},
});

/**
 * Disconnect: flip status, cancel pending jobs, revoke the refresh token
 * out-of-band. Entity links are kept so reconnecting the same realm resumes.
 */
export const disconnect = userMutation({
	args: {},
	handler: async (ctx): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const connection = await connectionForOrg(ctx, ctx.orgId);
		if (!connection) {
			throw new ConvexError("QuickBooks is not connected");
		}

		const pendingJobs = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", ctx.orgId).eq("status", "pending")
			)
			.collect();
		for (const job of pendingJobs) {
			await ctx.db.patch(job._id, {
				status: "ignored",
				lastError: "Cancelled because QuickBooks was disconnected",
			});
		}

		await ctx.db.patch(connection._id, {
			status: "disconnected",
			accessToken: "",
			accessTokenExpiresAt: 0,
			refreshToken: "",
			refreshTokenExpiresAt: 0,
		});

		// Snapshot form: the revoke must never read the live row, or a reconnect
		// that lands before it runs would have its fresh grant revoked.
		await ctx.scheduler.runAfter(
			0,
			internal.quickbooksActions.revokeConnection,
			{ refreshToken: connection.refreshToken }
		);
		return null;
	},
});

/**
 * Reset: wipe every trace of QBO state so the org can connect a DIFFERENT
 * company. Without this, reconnecting to another realm dead-ends on
 * `realm_mismatch` in storeConnection.
 *
 * Deletes in bounded batches — these tables are small per-org (jobs are pruned,
 * links scale with clients), so one transaction is enough.
 */
export const resetConnection = userMutation({
	args: {},
	handler: async (ctx): Promise<null> => {
		await requirePremium(ctx);
		await requireOrgOwner(ctx);

		const connection = await connectionForOrg(ctx, ctx.orgId);
		if (!connection) {
			throw new ConvexError("QuickBooks is not connected");
		}

		if (connection.status !== "disconnected") {
			// Explicit-token form: the doc is deleted in this transaction, so the
			// action cannot read it (same contract as the org-delete cascade).
			// The stored value is ciphertext once the encryption key is set.
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksActions.revokeConnection,
				{ refreshToken: connection.refreshToken }
			);
		}
		// Cancel live jobs now rather than waiting for the purge: a stale worker
		// releasing a claimed job would make it claimable again, and a reconnect
		// inside the purge window would drain it into the new company.
		for (const status of ["pending", "processing"] as const) {
			const jobs = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) =>
					q.eq("orgId", ctx.orgId).eq("status", status)
				)
				.collect();
			for (const job of jobs) {
				await ctx.db.patch(job._id, {
					status: "ignored",
					lastError: "Cancelled because QuickBooks was reset",
					claimedAt: undefined,
				});
			}
		}
		// Deleting the connection first makes the org read as disconnected in
		// the same transaction (no new jobs enqueue); the sync data drains in
		// bounded pages behind it, fenced by the cutoff so a reconnect started
		// mid-purge keeps its new data.
		await ctx.db.delete(connection._id);
		// +1ms: _creationTime is a commit timestamp and can trail this
		// transaction's clock fractionally; anything a reconnect creates is
		// seconds away at minimum.
		await ctx.scheduler.runAfter(0, internal.quickbooks.purgeQboSyncDataPage, {
			orgId: ctx.orgId,
			cutoff: Date.now() + 1,
		});
		return null;
	},
});

/**
 * Bounded reset cleanup: one page of QBO sync data per invocation,
 * rescheduling itself until everything at or before the cutoff is gone. Child
 * tables drain before their parents (rows before runs). The import tables
 * bound on _creationTime in the index; jobs and links bound in JS because
 * their indexes lead with other columns — post-cutoff docs there can only
 * come from a concurrent reconnect and are left alone. Those two walk with a
 * pagination cursor: .take() always restarts at the index head, so a page of
 * post-cutoff docs would delete nothing and stall the purge for good.
 */
export const purgeQboSyncDataPage = internalMutation({
	args: {
		orgId: v.id("organizations"),
		cutoff: v.number(),
		jobsCursor: v.optional(v.union(v.string(), v.null())),
		jobsDone: v.optional(v.boolean()),
		linksCursor: v.optional(v.union(v.string(), v.null())),
		linksDone: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<null> => {
		const BATCH = 200;
		let deleted = 0;
		let jobsCursor = args.jobsCursor ?? null;
		let jobsDone = args.jobsDone ?? false;
		let linksCursor = args.linksCursor ?? null;
		let linksDone = args.linksDone ?? false;

		const rows = await ctx.db
			.query("quickbooksImportRows")
			.withIndex("by_org", (q) =>
				q.eq("orgId", args.orgId).lte("_creationTime", args.cutoff)
			)
			.take(BATCH);
		for (const doc of rows) await ctx.db.delete(doc._id);
		deleted = rows.length;

		if (deleted === 0) {
			const runs = await ctx.db
				.query("quickbooksImportRuns")
				.withIndex("by_org", (q) =>
					q.eq("orgId", args.orgId).lte("_creationTime", args.cutoff)
				)
				.take(BATCH);
			for (const doc of runs) await ctx.db.delete(doc._id);
			deleted = runs.length;
		}

		// One paginated table per invocation, jobs before links.
		if (deleted === 0 && !jobsDone) {
			const page = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) => q.eq("orgId", args.orgId))
				.paginate({ cursor: jobsCursor, numItems: BATCH });
			for (const doc of page.page) {
				if (doc._creationTime <= args.cutoff) await ctx.db.delete(doc._id);
			}
			jobsCursor = page.continueCursor;
			jobsDone = page.isDone;
		} else if (deleted === 0 && !linksDone) {
			const page = await ctx.db
				.query("quickbooksEntityLinks")
				.withIndex("by_org_entity", (q) => q.eq("orgId", args.orgId))
				.paginate({ cursor: linksCursor, numItems: BATCH });
			for (const doc of page.page) {
				if (doc._creationTime <= args.cutoff) await ctx.db.delete(doc._id);
			}
			linksCursor = page.continueCursor;
			linksDone = page.isDone;
		}

		if (deleted > 0 || !jobsDone || !linksDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooks.purgeQboSyncDataPage,
				{
					orgId: args.orgId,
					cutoff: args.cutoff,
					jobsCursor,
					jobsDone,
					linksCursor,
					linksDone,
				}
			);
		}
		return null;
	},
});

// ============================================================================
// Internal API
// ============================================================================

/**
 * Pre-flight gate for completeConnection: the OAuth code is single-use, so the
 * caller is authorized BEFORE it is exchanged. storeConnection re-checks.
 */
export const authorizeConnectionSetup = internalQuery({
	args: {},
	handler: async (ctx): Promise<{ orgId: Id<"organizations"> }> => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		const organization = await ctx.db.get(orgId);
		if (!organization) {
			throw new ConvexError("Organization not found");
		}
		if (organization.ownerUserId !== user._id) {
			throw new ConvexError("not_owner");
		}
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
			throw new ConvexError("not_premium");
		}
		return { orgId };
	},
});

export const getConnection = internalQuery({
	args: { orgId: v.id("organizations") },
	handler: async (ctx, args): Promise<Doc<"quickbooksConnections"> | null> => {
		return await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
	},
});

const HEALTH_CHECK_SCAN_LIMIT = 1000;
// Mirrors quickbooksActions.HEALTH_CHECK_STALE_MS ("use node" modules can't be imported here).
const HEALTH_CHECK_STALE_MS = 12 * 60 * 60 * 1000;

/**
 * Cron sweep input: live connections whose last health check is stale,
 * oldest first. Refreshing bumps lastHealthCheckAt, so each sweep works
 * through a different slice instead of re-reading the same index prefix.
 */
export const listConnectionsForHealthCheck = internalQuery({
	args: { staleBefore: v.optional(v.number()) },
	handler: async (ctx, args): Promise<Doc<"quickbooksConnections">[]> => {
		const staleBefore = args.staleBefore ?? Date.now() - HEALTH_CHECK_STALE_MS;
		return await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_status_health", (q) =>
				q.eq("status", "connected").lte("lastHealthCheckAt", staleBefore)
			)
			.take(HEALTH_CHECK_SCAN_LIMIT);
	},
});

/**
 * Upsert the org's connection after a successful OAuth exchange.
 * The caller's identity propagates from the action, so owner/premium are
 * re-checked here rather than trusting anything the action passed in.
 */
export const storeConnection = internalMutation({
	args: {
		realmId: v.string(),
		environment: v.union(v.literal("sandbox"), v.literal("production")),
		accessToken: v.string(),
		accessTokenExpiresAt: v.number(),
		refreshToken: v.string(),
		refreshTokenExpiresAt: v.number(),
		refreshTokenHardExpiresAt: v.optional(v.number()),
		companyName: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<{ orgId: Id<"organizations"> }> => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);

		const organization = await ctx.db.get(orgId);
		if (!organization) {
			throw new ConvexError("Organization not found");
		}
		if (organization.ownerUserId !== user._id) {
			throw new ConvexError("not_owner");
		}
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) {
			throw new ConvexError("not_premium");
		}

		// One realm ↔ one org.
		const realmOwner = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_realm", (q) => q.eq("realmId", args.realmId))
			.first();
		if (realmOwner && realmOwner.orgId !== orgId) {
			throw new ConvexError("realm_in_use");
		}

		const existing = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.first();

		if (existing) {
			// Switching realms wipes the entity links — Phase 3 adds that reset flow.
			if (existing.realmId !== args.realmId) {
				throw new ConvexError("realm_mismatch");
			}
			await ctx.db.patch(existing._id, {
				environment: args.environment,
				accessToken: args.accessToken,
				accessTokenExpiresAt: args.accessTokenExpiresAt,
				refreshToken: args.refreshToken,
				refreshTokenExpiresAt: args.refreshTokenExpiresAt,
				refreshTokenHardExpiresAt: args.refreshTokenHardExpiresAt,
				status: "connected",
				connectedByUserId: user._id,
				companyName: args.companyName,
				lastHealthCheckAt: Date.now(),
			});
			// Drain anything queued while the connection needed reauth.
			const pendingJob = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) =>
					q.eq("orgId", orgId).eq("status", "pending")
				)
				.first();
			if (pendingJob) {
				await ctx.scheduler.runAfter(
					0,
					internal.quickbooksActions.processOrgJobs,
					{ orgId }
				);
			}
			return { orgId };
		}

		await ctx.db.insert("quickbooksConnections", {
			orgId,
			realmId: args.realmId,
			environment: args.environment,
			accessToken: args.accessToken,
			accessTokenExpiresAt: args.accessTokenExpiresAt,
			refreshToken: args.refreshToken,
			refreshTokenExpiresAt: args.refreshTokenExpiresAt,
			refreshTokenHardExpiresAt: args.refreshTokenHardExpiresAt,
			status: "connected",
			connectedByUserId: user._id,
			companyName: args.companyName,
			lastHealthCheckAt: Date.now(),
			syncInvoicesOn: "sent",
			syncPayments: true,
			autoDisambiguateNames: true,
		});
		return { orgId };
	},
});

/**
 * Persist a refreshed token pair. Intuit rotates the refresh token — store both.
 * Returns whether the write landed. `connectionId` fences a refresh started
 * before a reset out of the replacement connection; `previousRefreshToken` is
 * a compare-and-swap on the STORED string, so a stale rotation cannot
 * overwrite a newer grant.
 */
export const updateTokens = internalMutation({
	args: {
		orgId: v.id("organizations"),
		accessToken: v.string(),
		accessTokenExpiresAt: v.number(),
		refreshToken: v.string(),
		refreshTokenExpiresAt: v.number(),
		refreshTokenHardExpiresAt: v.optional(v.number()),
		connectionId: v.optional(v.id("quickbooksConnections")),
		previousRefreshToken: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<boolean> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		// An in-flight refresh must not revive a connection disconnected meanwhile.
		if (!connection || connection.status === "disconnected") {
			return false;
		}
		if (args.connectionId !== undefined && connection._id !== args.connectionId) {
			return false;
		}
		if (
			args.previousRefreshToken !== undefined &&
			connection.refreshToken !== args.previousRefreshToken
		) {
			return false;
		}
		await ctx.db.patch(connection._id, {
			accessToken: args.accessToken,
			accessTokenExpiresAt: args.accessTokenExpiresAt,
			refreshToken: args.refreshToken,
			refreshTokenExpiresAt: args.refreshTokenExpiresAt,
			// Absent from a response means "unchanged", never "cleared".
			...(args.refreshTokenHardExpiresAt !== undefined
				? { refreshTokenHardExpiresAt: args.refreshTokenHardExpiresAt }
				: {}),
			status: "connected",
			lastHealthCheckAt: Date.now(),
		});
		return true;
	},
});

export const markNeedsReauth = internalMutation({
	args: {
		orgId: v.id("organizations"),
		// Race guards, compared against the STORED (possibly encrypted) token
		// strings: only flip if the token that just failed is still the stored
		// one. A concurrent refresh that already rotated it wins. Returns
		// whether the connection was flipped.
		ifRefreshTokenMatches: v.optional(v.string()),
		ifAccessTokenMatches: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<boolean> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection || connection.status === "disconnected") {
			return false;
		}
		if (
			args.ifRefreshTokenMatches !== undefined &&
			connection.refreshToken !== args.ifRefreshTokenMatches
		) {
			return false;
		}
		if (
			args.ifAccessTokenMatches !== undefined &&
			connection.accessToken !== args.ifAccessTokenMatches
		) {
			return false;
		}
		await ctx.db.patch(connection._id, {
			status: "needs_reauth",
			lastHealthCheckAt: Date.now(),
		});
		return true;
	},
});

/** Late deposit-account resolution (worker self-heal when setup ran without one). */
export const saveDepositAccount = internalMutation({
	args: {
		orgId: v.id("organizations"),
		depositAccountQboId: v.string(),
	},
	handler: async (ctx, args): Promise<null> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection) return null;
		await ctx.db.patch(connection._id, {
			depositAccountQboId: args.depositAccountQboId,
		});
		return null;
	},
});

/** Account/item ids resolved by the setup flow (PRD §7.1). */
export const saveAccountMappings = internalMutation({
	args: {
		orgId: v.id("organizations"),
		incomeAccountQboId: v.string(),
		incomeAccountName: v.string(),
		depositAccountQboId: v.optional(v.string()),
		defaultServiceItemQboId: v.string(),
	},
	handler: async (ctx, args): Promise<null> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection) {
			throw new ConvexError("QuickBooks is not connected");
		}
		await ctx.db.patch(connection._id, {
			incomeAccountQboId: args.incomeAccountQboId,
			incomeAccountName: args.incomeAccountName,
			depositAccountQboId: args.depositAccountQboId,
			defaultServiceItemQboId: args.defaultServiceItemQboId,
		});
		return null;
	},
});

// ============================================================================
// Sync job state machine (worker support)
// ============================================================================

const QBO_ENTITY_TYPE = v.union(
	v.literal("client"),
	v.literal("invoice"),
	v.literal("payment"),
	v.literal("sku"),
	v.literal("refund")
);

/**
 * Dependency order within a claimed batch. Items are independent and cheap, so
 * they go first; the rest keeps the client → invoice → payment chain that lets
 * a batch resolve its own dependencies in one pass.
 */
const JOB_TYPE_RANK: Record<string, number> = {
	sku: 0,
	client: 1,
	invoice: 2,
	payment: 3,
	refund: 4,
};

/**
 * Flip due pending jobs to "processing" and hand them to the caller. This is
 * the mutual-exclusion point: two concurrent processOrgJobs kicks cannot claim
 * the same job because the whole scan-and-patch runs in one transaction.
 */
export const claimDueJobs = internalMutation({
	args: { orgId: v.id("organizations"), limit: v.number() },
	handler: async (ctx, args): Promise<Doc<"quickbooksSyncJobs">[]> => {
		const now = Date.now();
		const due = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status_due", (q) =>
				q.eq("orgId", args.orgId).eq("status", "pending").lte("runAfter", now)
			)
			.take(Math.max(0, args.limit));

		const claimed: Doc<"quickbooksSyncJobs">[] = [];
		const claimedKeys = new Set<string>();
		for (const job of due) {
			// Per-entity serialization: a job whose entity is already in flight
			// (claimed by a concurrent worker, or earlier in this batch) stays
			// pending for the next pass — two workers must never both create the
			// same QBO record.
			if (claimedKeys.has(job.dedupeKey)) continue;
			const inFlight = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_dedupe", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("dedupeKey", job.dedupeKey)
						.eq("status", "processing")
				)
				.first();
			if (inFlight) continue;
			claimedKeys.add(job.dedupeKey);
			await ctx.db.patch(job._id, { status: "processing", claimedAt: now });
			claimed.push({ ...job, status: "processing", claimedAt: now });
		}
		// Stable sort: dependency order within the batch, insertion order within a type.
		claimed.sort(
			(a, b) =>
				(JOB_TYPE_RANK[a.entityType] ?? 9) - (JOB_TYPE_RANK[b.entityType] ?? 9)
		);
		return claimed;
	},
});

export const markJobSucceeded = internalMutation({
	args: { jobId: v.id("quickbooksSyncJobs") },
	handler: async (ctx, args): Promise<null> => {
		const job = await ctx.db.get(args.jobId);
		// Same fence as markJobIgnored/releaseJob: a job that was ignored or
		// released mid-flight must not be revived as succeeded.
		if (!job || job.status !== "processing") return null;
		await ctx.db.patch(args.jobId, {
			status: "succeeded",
			attempts: job.attempts + 1,
			lastError: undefined,
			lastErrorCode: undefined,
			claimedAt: undefined,
		});
		return null;
	},
});

/**
 * Record an attempt that failed. `terminal` parks the job in the error center;
 * otherwise it goes back to pending behind the supplied backoff gate.
 */
export const markJobFailed = internalMutation({
	args: {
		jobId: v.id("quickbooksSyncJobs"),
		terminal: v.boolean(),
		runAfter: v.optional(v.number()),
		lastError: v.string(),
		lastErrorCode: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<null> => {
		const job = await ctx.db.get(args.jobId);
		// Same fence as markJobSucceeded: a job ignored by a mid-batch disconnect
		// must not resurrect as failed (and false-alarm the failure alert).
		if (!job || job.status !== "processing") return null;
		const now = Date.now();
		// Debounce read happens before the patch: another failed job on the org
		// means the alert for this failure streak already went out.
		const firstFailure =
			args.terminal &&
			(await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status_due", (q) =>
					q.eq("orgId", job.orgId).eq("status", "failed")
				)
				.first()) === null;
		await ctx.db.patch(args.jobId, {
			status: args.terminal ? "failed" : "pending",
			attempts: job.attempts + 1,
			runAfter: args.terminal ? job.runAfter : (args.runAfter ?? now),
			failedAt: args.terminal ? now : undefined,
			lastError: args.lastError,
			lastErrorCode: args.lastErrorCode,
			claimedAt: undefined,
		});
		if (firstFailure) {
			await notifySyncFailure(ctx, job.orgId);
		}
		return null;
	},
});

/**
 * One in-app alert per failure streak, to each org admin: fires only when the
 * org transitions from zero terminally failed jobs to one (a QuickBooks outage
 * can fail dozens of jobs in minutes, and per-job alerts would bury the bell),
 * and an admin who still has the last alert unread is not sent another. In-app
 * only (not in PUSHABLE_TYPES), mirroring automation_failed. Never throws: an
 * alert hiccup must not roll back the job's failure patch.
 */
async function notifySyncFailure(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<void> {
	try {
		const adminIds = await resolveMemberUserIds(ctx, orgId, true);
		for (const userId of adminIds) {
			// Only the newest row can be unread: this is the sole inserter, it
			// inserts only when none is unread, and nothing marks one unread again.
			const latest = await ctx.db
				.query("notifications")
				.withIndex("by_user_type", (q) =>
					q.eq("userId", userId).eq("notificationType", "quickbooks_sync_failed")
				)
				.order("desc")
				.first();
			if (latest && !latest.isRead) continue;
			await ctx.db.insert("notifications", {
				orgId,
				userId,
				notificationType: "quickbooks_sync_failed",
				title: "QuickBooks sync needs attention",
				message:
					"Something failed to sync to QuickBooks. Review and retry it from Settings.",
				actionUrl: "/organization/profile?tab=integrations",
				isRead: false,
				sentVia: "in_app",
				sentAt: Date.now(),
				priority: "high",
			});
		}
	} catch (err) {
		console.error(`[QuickBooks] notifySyncFailure failed for org ${orgId}`, err);
	}
}

/**
 * Disconnect fence: a job claimed before the disconnect sweep ran is cancelled
 * rather than released, so it can't linger pending and surprise-sync on
 * reconnect.
 */
export const markJobIgnored = internalMutation({
	args: { jobId: v.id("quickbooksSyncJobs"), lastError: v.string() },
	handler: async (ctx, args): Promise<null> => {
		const job = await ctx.db.get(args.jobId);
		if (!job || job.status !== "processing") return null;
		await ctx.db.patch(args.jobId, {
			status: "ignored",
			lastError: args.lastError,
			claimedAt: undefined,
		});
		return null;
	},
});

/**
 * Worker backstop for the payment→invoice dependency: a payment can settle on
 * an invoice that was never queued (created before QuickBooks was connected
 * and still only partially paid, so no invoice mutation ever fired). Without
 * this, syncPayment would hold forever waiting for a job nothing will create.
 * Skips when the invoice already failed terminally (retry is the user's call
 * from the error center) or is mid-sync in another batch.
 */
export const ensureInvoiceSyncQueued = internalMutation({
	args: { orgId: v.id("organizations"), invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<null> => {
		const dedupeKey = `invoice:${args.invoiceId}`;
		for (const status of ["failed", "processing"] as const) {
			const existing = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_dedupe", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("dedupeKey", dedupeKey)
						.eq("status", status)
				)
				.first();
			if (existing) return null;
		}
		await maybeEnqueueQboSync(ctx, args.orgId, "invoice", args.invoiceId);
		return null;
	},
});

/**
 * Payment dependency check: did the invoice's sync job fail terminally?
 * ensureInvoiceSyncQueued deliberately leaves those alone, so a payment held
 * behind one would hold forever.
 */
export const hasFailedSyncJob = internalQuery({
	args: {
		orgId: v.id("organizations"),
		entityType: QBO_ENTITY_TYPE,
		localId: v.string(),
	},
	handler: async (ctx, args): Promise<boolean> => {
		const failed = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_dedupe", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("dedupeKey", `${args.entityType}:${args.localId}`)
					.eq("status", "failed")
			)
			.first();
		return failed !== null;
	},
});

/**
 * Put a claimed job back without burning an attempt. Used when the job could
 * not even be tried: setup incomplete, dependency missing, connection paused.
 */
export const releaseJob = internalMutation({
	args: {
		jobId: v.id("quickbooksSyncJobs"),
		runAfter: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<null> => {
		const job = await ctx.db.get(args.jobId);
		if (!job || job.status !== "processing") return null;
		await ctx.db.patch(args.jobId, {
			status: "pending",
			runAfter: args.runAfter ?? Date.now(),
			claimedAt: undefined,
		});
		return null;
	},
});

export const upsertEntityLink = internalMutation({
	args: {
		orgId: v.id("organizations"),
		entityType: QBO_ENTITY_TYPE,
		localId: v.string(),
		qboId: v.string(),
		qboSyncToken: v.string(),
		syncWarning: v.optional(v.string()),
		/** Generation fence: the connection the QBO id was minted under. */
		connectionId: v.optional(v.id("quickbooksConnections")),
	},
	/** `created` is true only on first link — the worker uses it to log activity once. */
	handler: async (ctx, args): Promise<{ created: boolean }> => {
		if (args.connectionId !== undefined) {
			const connection = await ctx.db
				.query("quickbooksConnections")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.first();
			// QBO ids are per-realm: a result from a reset connection must not be
			// linked under whatever company the org connected next.
			if (!connection || connection._id !== args.connectionId) {
				throw new ConvexError("stale_connection");
			}
		}
		const existing = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("localId", args.localId)
			)
			.first();

		const fields = {
			qboId: args.qboId,
			qboSyncToken: args.qboSyncToken,
			lastSyncedAt: Date.now(),
			// Absent warning clears a stale one from an earlier sync.
			syncWarning: args.syncWarning,
		};

		if (existing) {
			await ctx.db.patch(existing._id, fields);
			return { created: false };
		}
		await ctx.db.insert("quickbooksEntityLinks", {
			orgId: args.orgId,
			entityType: args.entityType,
			localId: args.localId,
			...fields,
		});
		return { created: true };
	},
});

/**
 * Activity-feed entry for the client record, written once when the client first
 * lands in QuickBooks (created or adopted). Renames never emit — that would
 * spam the feed. The activityType union has no QuickBooks member, so this
 * reuses `client_updated` with a distinct description.
 */
export const recordClientSyncActivity = internalMutation({
	args: {
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		qboDisplayName: v.string(),
		qboId: v.string(),
	},
	handler: async (ctx, args): Promise<null> => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.orgId !== args.orgId) return null;
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection) return null;

		// The worker has no ambient user: attribute to whoever connected QBO.
		await createActivity(ctx, {
			activityType: "client_updated",
			entityType: "client",
			entityId: client._id,
			entityName: client.companyName,
			description: `Synced to QuickBooks as ${args.qboDisplayName}`,
			metadata: { quickbooks: { qboId: args.qboId } },
			actor: { userId: connection.connectedByUserId, orgId: args.orgId },
		});
		return null;
	},
});

/** Void guard: does any payment on this invoice already exist in QuickBooks? */
export const hasSyncedPaymentForInvoice = internalQuery({
	args: { orgId: v.id("organizations"), invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<boolean> => {
		const payments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.take(200);
		for (const payment of payments) {
			if (payment.orgId !== args.orgId) continue;
			const link = await ctx.db
				.query("quickbooksEntityLinks")
				.withIndex("by_org_entity", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("entityType", "payment")
						.eq("localId", payment._id)
				)
				.first();
			if (link) return true;
		}
		return false;
	},
});

export const getEntityLinkInternal = internalQuery({
	args: {
		orgId: v.id("organizations"),
		entityType: QBO_ENTITY_TYPE,
		localId: v.string(),
	},
	handler: async (ctx, args): Promise<Doc<"quickbooksEntityLinks"> | null> => {
		return await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("localId", args.localId)
			)
			.first();
	},
});

/** Everything the worker needs to build a payload, org-checked in one read. */
export type QboSyncPayload =
	| {
			kind: "client";
			client: Doc<"clients">;
			primaryContact: Doc<"clientContacts"> | null;
			billingAddress: Doc<"clientProperties"> | null;
	  }
	| {
			kind: "invoice";
			invoice: Doc<"invoices">;
			lineItems: Doc<"invoiceLineItems">[];
			clientId: Id<"clients">;
			/** Distinct in-org SKUs referenced by the lines, keyed by skuId. */
			skus: Record<string, Doc<"skus">>;
			/**
			 * Where the work happened, for the QBO ShipAddr: the project's
			 * property when the invoice has one, else the client's primary.
			 * QBO's Automated Sales Tax computes off the ship-to address.
			 */
			jobSite: Doc<"clientProperties"> | null;
	  }
	| { kind: "sku"; sku: Doc<"skus"> }
	| {
			kind: "payment";
			payment: Doc<"payments">;
			invoiceId: Id<"invoices">;
			clientId: Id<"clients">;
	  }
	| {
			kind: "refund";
			refund: Doc<"stripeRefunds">;
			payment: Doc<"payments">;
			invoice: Doc<"invoices">;
			clientId: Id<"clients">;
	  };

export const getSyncJobPayload = internalQuery({
	args: {
		orgId: v.id("organizations"),
		entityType: QBO_ENTITY_TYPE,
		localId: v.string(),
	},
	handler: async (ctx, args): Promise<QboSyncPayload | null> => {
		if (args.entityType === "client") {
			const clientId = ctx.db.normalizeId("clients", args.localId);
			if (!clientId) return null;
			const client = await ctx.db.get(clientId);
			if (!client || client.orgId !== args.orgId) return null;
			const primaryContact = await ctx.db
				.query("clientContacts")
				.withIndex("by_primary", (q) =>
					q.eq("clientId", clientId).eq("isPrimary", true)
				)
				.first();
			const billingAddress = await ctx.db
				.query("clientProperties")
				.withIndex("by_primary", (q) =>
					q.eq("clientId", clientId).eq("isPrimary", true)
				)
				.first();
			return { kind: "client", client, primaryContact, billingAddress };
		}

		if (args.entityType === "invoice") {
			const invoiceId = ctx.db.normalizeId("invoices", args.localId);
			if (!invoiceId) return null;
			const invoice = await ctx.db.get(invoiceId);
			if (!invoice || invoice.orgId !== args.orgId) return null;
			const lineItems = await ctx.db
				.query("invoiceLineItems")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.collect();
			lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

			// Resolve the lines' SKUs here so the worker needs no per-line query.
			// A missing / cross-org sku is simply absent: the line falls back to
			// the generic service item.
			const skus: Record<string, Doc<"skus">> = {};
			for (const item of lineItems) {
				if (!item.skuId || skus[item.skuId]) continue;
				const sku = await ctx.db.get(item.skuId);
				if (sku && sku.orgId === args.orgId) skus[item.skuId] = sku;
			}

			// Ship-to resolution: project job site first, client primary fallback.
			let jobSite: Doc<"clientProperties"> | null = null;
			if (invoice.projectId) {
				const project = await ctx.db.get(invoice.projectId);
				if (project && project.orgId === args.orgId && project.propertyId) {
					const property = await ctx.db.get(project.propertyId);
					if (property && property.orgId === args.orgId) jobSite = property;
				}
			}
			if (!jobSite) {
				jobSite =
					(await ctx.db
						.query("clientProperties")
						.withIndex("by_primary", (q) =>
							q.eq("clientId", invoice.clientId).eq("isPrimary", true)
						)
						.first()) ?? null;
			}

			return {
				kind: "invoice",
				invoice,
				lineItems,
				clientId: invoice.clientId,
				skus,
				jobSite,
			};
		}

		if (args.entityType === "sku") {
			const skuId = ctx.db.normalizeId("skus", args.localId);
			if (!skuId) return null;
			const sku = await ctx.db.get(skuId);
			if (!sku || sku.orgId !== args.orgId) return null;
			return { kind: "sku", sku };
		}

		if (args.entityType === "refund") {
			const refund = await ctx.db
				.query("stripeRefunds")
				.withIndex("by_org_refund", (q) =>
					q.eq("orgId", args.orgId).eq("refundId", args.localId)
				)
				.unique();
			if (!refund) return null;
			const payment = await ctx.db.get(refund.paymentId);
			if (!payment || payment.orgId !== args.orgId) return null;
			const invoice = await ctx.db.get(payment.invoiceId);
			if (!invoice || invoice.orgId !== args.orgId) return null;
			return { kind: "refund", refund, payment, invoice, clientId: invoice.clientId };
		}

		const paymentId = ctx.db.normalizeId("payments", args.localId);
		if (!paymentId) return null;
		const payment = await ctx.db.get(paymentId);
		if (!payment || payment.orgId !== args.orgId) return null;
		const invoice = await ctx.db.get(payment.invoiceId);
		if (!invoice || invoice.orgId !== args.orgId) return null;
		return {
			kind: "payment",
			payment,
			invoiceId: invoice._id,
			clientId: invoice.clientId,
		};
	},
});

const STUCK_JOB_SCAN_LIMIT = 500;
const DUE_JOB_CONNECTION_SCAN_LIMIT = 2000;
const DUE_JOB_CONNECTION_PAGE = 200;

/** Sweep (a): jobs stranded in "processing" by a dropped action. */
export const reclaimStuckJobs = internalMutation({
	args: { staleBeforeMs: v.number() },
	handler: async (ctx, args): Promise<{ reclaimed: number }> => {
		// Age-bounded in the index, so fresh claims never fill the page.
		const stuck = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_status_claimed", (q) =>
				q.eq("status", "processing").lte("claimedAt", args.staleBeforeMs)
			)
			.take(STUCK_JOB_SCAN_LIMIT);
		let reclaimed = 0;
		for (const job of stuck) {
			const claimedAt = job.claimedAt ?? job._creationTime;
			if (claimedAt > args.staleBeforeMs) continue;
			await ctx.db.patch(job._id, {
				status: "pending",
				runAfter: Date.now(),
				claimedAt: undefined,
			});
			reclaimed++;
		}
		return { reclaimed };
	},
});

/**
 * Sweep (b): connected orgs with due pending work, so a lost kick still gets
 * picked up. Walks connections rather than the due-job index: jobs parked
 * behind a needs_reauth org would otherwise sit at the head of that index
 * forever and starve every org behind them.
 */
export const listOrgsWithDueJobs = internalQuery({
	args: {},
	handler: async (ctx): Promise<Id<"organizations">[]> => {
		const now = Date.now();
		const orgIds: Id<"organizations">[] = [];
		let scanned = 0;
		let after = 0;
		while (scanned < DUE_JOB_CONNECTION_SCAN_LIMIT) {
			const page = await ctx.db
				.query("quickbooksConnections")
				.withIndex("by_status", (q) =>
					q.eq("status", "connected").gt("_creationTime", after)
				)
				.take(DUE_JOB_CONNECTION_PAGE);
			for (const connection of page) {
				const due = await ctx.db
					.query("quickbooksSyncJobs")
					.withIndex("by_org_status_due", (q) =>
						q
							.eq("orgId", connection.orgId)
							.eq("status", "pending")
							.lte("runAfter", now)
					)
					.first();
				if (due) orgIds.push(connection.orgId);
			}
			scanned += page.length;
			if (page.length < DUE_JOB_CONNECTION_PAGE) break;
			after = page[page.length - 1]._creationTime;
		}
		if (scanned >= DUE_JOB_CONNECTION_SCAN_LIMIT) {
			console.warn(
				"[QuickBooks] due-job sweep hit the connection scan limit — orgs beyond it were not kicked"
			);
		}
		return orgIds;
	},
});

// ============================================================================
// Sync status + error center (public)
// ============================================================================

export interface QboEntityLinkView {
	qboId: string;
	lastSyncedAt: number;
	syncWarning?: string;
}

/** Sync badge on a client/invoice/payment record page. */
export const getEntityLink = userQuery({
	args: { entityType: QBO_ENTITY_TYPE, localId: v.string() },
	handler: async (ctx, args): Promise<QboEntityLinkView | null> => {
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) return null;
		const connection = await connectionForOrg(ctx, ctx.orgId);
		if (!connection || connection.status === "disconnected") return null;

		const link = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q
					.eq("orgId", ctx.orgId)
					.eq("entityType", args.entityType)
					.eq("localId", args.localId)
			)
			.first();
		if (!link) return null;
		return {
			qboId: link.qboId,
			lastSyncedAt: link.lastSyncedAt,
			...(link.syncWarning ? { syncWarning: link.syncWarning } : {}),
		};
	},
});

export interface QboSyncErrorView {
	_id: Id<"quickbooksSyncJobs">;
	entityType: QboEntityType;
	localId: string;
	entityLabel: string;
	lastError?: string;
	lastErrorCode?: string;
	attempts: number;
	failedAt: number;
}

/** Human label for the error center. Deleted rows still need a readable row. */
async function describeEntity(
	ctx: UserQueryCtx,
	orgId: Id<"organizations">,
	entityType: QboEntityType,
	localId: string
): Promise<string> {
	if (entityType === "refund") {
		const refund = await refundByStripeId(ctx, orgId, localId);
		return refund ? `Refund ${formatCurrency(refund.amount)}` : "Deleted refund";
	}
	if (entityType === "sku") {
		const id = ctx.db.normalizeId("skus", localId);
		const sku = id ? await ctx.db.get(id) : null;
		if (!sku || sku.orgId !== orgId) return "Deleted line item";
		return sku.name;
	}
	if (entityType === "client") {
		const id = ctx.db.normalizeId("clients", localId);
		const client = id ? await ctx.db.get(id) : null;
		if (!client || client.orgId !== orgId) return "Deleted client";
		return client.companyName;
	}
	if (entityType === "invoice") {
		const id = ctx.db.normalizeId("invoices", localId);
		const invoice = id ? await ctx.db.get(id) : null;
		if (!invoice || invoice.orgId !== orgId) return "Deleted invoice";
		return invoice.invoiceNumber;
	}
	const id = ctx.db.normalizeId("payments", localId);
	const payment = id ? await ctx.db.get(id) : null;
	if (!payment || payment.orgId !== orgId) return "Deleted payment";
	return `${payment.description ?? "Payment"} ${formatCurrency(payment.paymentAmount)}`;
}

/** A sync job carries the permission object of the entity it exports. */
function jobPermissionObject(entityType: QboEntityType): PermissionObject {
	if (entityType === "client") return "clients";
	if (entityType === "sku") return "skus";
	return "invoices";
}

/**
 * Record-scope half of the error-center gate, evaluated only when the caller
 * lacks allRecords on the object: the job's entity must be in the actor's
 * scope, and a deleted entity is out of scope by definition.
 */
async function isJobInActorScope(
	ctx: UserQueryCtx | UserMutationCtx,
	job: Doc<"quickbooksSyncJobs">
): Promise<boolean> {
	const scope = await ctx.actorScope();
	if (job.entityType === "client") {
		const id = ctx.db.normalizeId("clients", job.localId);
		const client = id ? await ctx.db.get(id) : null;
		return !!client && client.orgId === job.orgId && scope.clientIds.has(client._id);
	}
	if (job.entityType === "invoice") {
		const id = ctx.db.normalizeId("invoices", job.localId);
		const invoice = id ? await ctx.db.get(id) : null;
		if (!invoice || invoice.orgId !== job.orgId) return false;
		return await isInvoiceInActorScope(ctx, invoice, scope);
	}
	if (job.entityType === "payment") {
		const id = ctx.db.normalizeId("payments", job.localId);
		const payment = id ? await ctx.db.get(id) : null;
		if (!payment || payment.orgId !== job.orgId) return false;
		const invoice = await ctx.db.get(payment.invoiceId);
		if (!invoice || invoice.orgId !== job.orgId) return false;
		return await isInvoiceInActorScope(ctx, invoice, scope);
	}
	if (job.entityType === "refund") {
		const refund = await refundByStripeId(ctx, job.orgId, job.localId);
		const invoice = refund ? await ctx.db.get(refund.invoiceId) : null;
		if (!invoice || invoice.orgId !== job.orgId) return false;
		return await isInvoiceInActorScope(ctx, invoice, scope);
	}
	return false;
}

async function refundByStripeId(
	ctx: UserQueryCtx | UserMutationCtx,
	orgId: Id<"organizations">,
	refundId: string
): Promise<Doc<"stripeRefunds"> | null> {
	return await ctx.db
		.query("stripeRefunds")
		.withIndex("by_org_refund", (q) =>
			q.eq("orgId", orgId).eq("refundId", refundId)
		)
		.unique();
}

/** Same verdict as `requireLevel` + `requireRecordScope`, without throwing. */
async function canActOnJob(
	ctx: UserQueryCtx | UserMutationCtx,
	job: Doc<"quickbooksSyncJobs">,
	level: "view" | "modify"
): Promise<boolean> {
	const object = jobPermissionObject(job.entityType);
	if (!(await ctx.can(object, level))) return false;
	if (await ctx.hasAllRecords(object)) return true;
	return await isJobInActorScope(ctx, job);
}

/**
 * Error center feed: the org's failed sync jobs, newest first. Rows follow
 * the permissions of the entity they sync — a member who cannot see an
 * invoice must not see its number or amount here either.
 */
export const listSyncErrors = userQuery({
	args: {},
	handler: async (ctx): Promise<QboSyncErrorView[]> => {
		if (!isFeatureAllowed((await entitlementsFromIdentity(ctx)).plan, "quickbooks")) return [];

		const failed = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", ctx.orgId).eq("status", "failed")
			)
			.order("desc")
			.take(100);

		const rows: QboSyncErrorView[] = [];
		for (const job of failed) {
			if (!(await canActOnJob(ctx, job, "view"))) continue;
			rows.push({
				_id: job._id,
				entityType: job.entityType,
				localId: job.localId,
				entityLabel: await describeEntity(
					ctx,
					ctx.orgId,
					job.entityType,
					job.localId
				),
				lastError: job.lastError,
				lastErrorCode: job.lastErrorCode,
				attempts: job.attempts,
				failedAt: job.failedAt ?? job._creationTime,
			});
		}
		// The index orders by creation time; the UI promises newest failure first.
		rows.sort((a, b) => b.failedAt - a.failedAt);
		return rows;
	},
});

/**
 * Error-center actions: premium org, then the same modify + record-scope gate
 * the entity's own mutations apply (invoices.remove, payments.*).
 */
async function requireJobModify(
	ctx: UserMutationCtx,
	jobId: Id<"quickbooksSyncJobs">
): Promise<Doc<"quickbooksSyncJobs">> {
	await requireFeature(ctx, "quickbooks");
	const job = await ctx.db.get(jobId);
	if (!job || job.orgId !== ctx.orgId) {
		throw new ConvexError("Sync job not found");
	}
	const object = jobPermissionObject(job.entityType);
	await ctx.requireLevel(object, "modify");
	await ctx.requireRecordScope(object, () => isJobInActorScope(ctx, job));
	return job;
}

export const retryJob = userMutation({
	args: { jobId: v.id("quickbooksSyncJobs") },
	handler: async (ctx, args): Promise<null> => {
		const job = await requireJobModify(ctx, args.jobId);
		if (job.status !== "failed") return null;

		// A user retry is a new Intuit operation: the old requestid would replay
		// the cached failed response.
		await ctx.db.patch(job._id, {
			status: "pending",
			runAfter: Date.now(),
			attempts: 0,
			failedAt: undefined,
			operationId: mintQboOperationId(),
		});
		await ctx.scheduler.runAfter(
			0,
			internal.quickbooksActions.processOrgJobs,
			{ orgId: ctx.orgId }
		);
		return null;
	},
});

export const ignoreJob = userMutation({
	args: { jobId: v.id("quickbooksSyncJobs") },
	handler: async (ctx, args): Promise<null> => {
		const job = await requireJobModify(ctx, args.jobId);
		if (job.status !== "failed") return null;
		await ctx.db.patch(job._id, { status: "ignored" });
		return null;
	},
});

/** Retries only the failed jobs the caller could retry one by one. */
export const retryAllFailed = userMutation({
	args: {},
	handler: async (ctx): Promise<{ retried: number }> => {
		await requireFeature(ctx, "quickbooks");
		const failed = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", ctx.orgId).eq("status", "failed")
			)
			.take(200);

		const now = Date.now();
		let retried = 0;
		for (const job of failed) {
			if (!(await canActOnJob(ctx, job, "modify"))) continue;
			await ctx.db.patch(job._id, {
				status: "pending",
				runAfter: now,
				attempts: 0,
				failedAt: undefined,
				operationId: mintQboOperationId(),
			});
			retried++;
		}
		if (retried > 0) {
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksActions.processOrgJobs,
				{ orgId: ctx.orgId }
			);
		}
		return { retried };
	},
});
