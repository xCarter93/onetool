import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/factories";
import type { UserMutationCtx, UserQueryCtx } from "./lib/factories";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { hasPremiumAccess } from "./lib/permissions";
import { formatCurrency } from "./lib/money";
import { maybeEnqueueQboSync } from "./lib/quickbooksEnqueue";
import { createActivity } from "./lib/activities";
import { resolveMemberUserIds } from "./lib/automationExec/actions";
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
	if (!(await hasPremiumAccess(ctx))) {
		throw new ConvexError(
			"QuickBooks sync is available on the Business plan. Upgrade to use it."
		);
	}
}

// ============================================================================
// Public API
// ============================================================================

/** Connection status for the Integrations tab. Null when unconnected or not premium. */
export const getConnectionStatus = userQuery({
	args: {},
	handler: async (ctx): Promise<PublicQboConnection | null> => {
		if (!(await hasPremiumAccess(ctx))) {
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

		await ctx.db.patch(connection._id, { status: "disconnected" });

		// Pass only the orgId: the action reads the token from the doc (and
		// scrubs it afterwards), keeping the secret out of scheduler args.
		await ctx.scheduler.runAfter(
			0,
			internal.quickbooksActions.revokeConnection,
			{ orgId: ctx.orgId }
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

		const BATCH = 500;

		for (;;) {
			const links = await ctx.db
				.query("quickbooksEntityLinks")
				.withIndex("by_org_entity", (q) => q.eq("orgId", ctx.orgId))
				.take(BATCH);
			for (const link of links) await ctx.db.delete(link._id);
			if (links.length < BATCH) break;
		}

		for (;;) {
			const jobs = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) => q.eq("orgId", ctx.orgId))
				.take(BATCH);
			for (const job of jobs) await ctx.db.delete(job._id);
			if (jobs.length < BATCH) break;
		}

		for (;;) {
			const rows = await ctx.db
				.query("quickbooksImportRows")
				.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
				.take(BATCH);
			for (const row of rows) await ctx.db.delete(row._id);
			if (rows.length < BATCH) break;
		}

		for (;;) {
			const runs = await ctx.db
				.query("quickbooksImportRuns")
				.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
				.take(BATCH);
			for (const run of runs) await ctx.db.delete(run._id);
			if (runs.length < BATCH) break;
		}

		if (connection.status !== "disconnected") {
			// Explicit-token form: the doc is deleted in this transaction, so the
			// action cannot read it (same contract as the org-delete cascade).
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksActions.revokeConnection,
				{ refreshToken: connection.refreshToken }
			);
		}
		await ctx.db.delete(connection._id);
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
		if (!(await hasPremiumAccess(ctx))) {
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

/** Cron sweep input: every live connection. Small table — a full scan is fine. */
export const listConnectionsForHealthCheck = internalQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"quickbooksConnections">[]> => {
		const all = await ctx.db.query("quickbooksConnections").take(1000);
		return all.filter((c) => c.status === "connected");
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
		if (!(await hasPremiumAccess(ctx))) {
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

/** Persist a refreshed token pair. Intuit rotates the refresh token — store both. */
export const updateTokens = internalMutation({
	args: {
		orgId: v.id("organizations"),
		accessToken: v.string(),
		accessTokenExpiresAt: v.number(),
		refreshToken: v.string(),
		refreshTokenExpiresAt: v.number(),
	},
	handler: async (ctx, args): Promise<null> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		// An in-flight refresh must not revive a connection disconnected meanwhile.
		if (!connection || connection.status === "disconnected") {
			return null;
		}
		await ctx.db.patch(connection._id, {
			accessToken: args.accessToken,
			accessTokenExpiresAt: args.accessTokenExpiresAt,
			refreshToken: args.refreshToken,
			refreshTokenExpiresAt: args.refreshTokenExpiresAt,
			status: "connected",
			lastHealthCheckAt: Date.now(),
		});
		return null;
	},
});

export const markNeedsReauth = internalMutation({
	args: {
		orgId: v.id("organizations"),
		// Refresh-race guard: only flip if the token that just failed is still
		// the stored one. A concurrent refresh that already rotated it wins.
		ifRefreshTokenMatches: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<null> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection || connection.status === "disconnected") {
			return null;
		}
		if (
			args.ifRefreshTokenMatches !== undefined &&
			connection.refreshToken !== args.ifRefreshTokenMatches
		) {
			return null;
		}
		await ctx.db.patch(connection._id, {
			status: "needs_reauth",
			lastHealthCheckAt: Date.now(),
		});
		return null;
	},
});

/** Post-revoke scrub: a disconnected row keeps no live secrets at rest. */
export const clearConnectionTokens = internalMutation({
	args: { orgId: v.id("organizations") },
	handler: async (ctx, args): Promise<null> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection || connection.status !== "disconnected") {
			return null;
		}
		await ctx.db.patch(connection._id, {
			accessToken: "",
			accessTokenExpiresAt: 0,
			refreshToken: "",
			refreshTokenExpiresAt: 0,
		});
		return null;
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
	v.literal("sku")
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
		for (const job of due) {
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
		if (!job) return null;
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
		if (!job) return null;
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
			const unread = await ctx.db
				.query("notifications")
				.withIndex("by_user_read", (q) =>
					q.eq("userId", userId).eq("isRead", false)
				)
				.filter((q) =>
					q.eq(q.field("notificationType"), "quickbooks_sync_failed")
				)
				.first();
			if (unread) continue;
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
	},
	/** `created` is true only on first link — the worker uses it to log activity once. */
	handler: async (ctx, args): Promise<{ created: boolean }> => {
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

/** Sweep (a): jobs stranded in "processing" by a dropped action. */
export const reclaimStuckJobs = internalMutation({
	args: { staleBeforeMs: v.number() },
	handler: async (ctx, args): Promise<{ reclaimed: number }> => {
		const stuck = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_status_due", (q) => q.eq("status", "processing"))
			.take(200);
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

/** Sweep (b): orgs with due pending work, so a lost kick still gets picked up. */
export const listOrgsWithDueJobs = internalQuery({
	args: {},
	handler: async (ctx): Promise<Id<"organizations">[]> => {
		const now = Date.now();
		const due = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_status_due", (q) =>
				q.eq("status", "pending").lte("runAfter", now)
			)
			.take(500);
		return Array.from(new Set(due.map((job) => job.orgId)));
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
		if (!(await hasPremiumAccess(ctx))) return null;
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
	entityType: "client" | "invoice" | "payment" | "sku";
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
	entityType: "client" | "invoice" | "payment" | "sku",
	localId: string
): Promise<string> {
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

/** Error center feed: the org's failed sync jobs, newest first. */
export const listSyncErrors = userQuery({
	args: {},
	handler: async (ctx): Promise<QboSyncErrorView[]> => {
		if (!(await hasPremiumAccess(ctx))) return [];

		const failed = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", ctx.orgId).eq("status", "failed")
			)
			.order("desc")
			.take(100);

		const rows: QboSyncErrorView[] = [];
		for (const job of failed) {
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

/** Error-center actions are member-accessible; only premium orgs have jobs. */
async function requirePremiumMember(ctx: UserMutationCtx): Promise<void> {
	if (!(await hasPremiumAccess(ctx))) {
		throw new ConvexError(
			"QuickBooks sync is available on the Business plan. Upgrade to use it."
		);
	}
}

export const retryJob = userMutation({
	args: { jobId: v.id("quickbooksSyncJobs") },
	handler: async (ctx, args): Promise<null> => {
		await requirePremiumMember(ctx);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.orgId !== ctx.orgId) {
			throw new ConvexError("Sync job not found");
		}
		if (job.status !== "failed") return null;

		await ctx.db.patch(job._id, {
			status: "pending",
			runAfter: Date.now(),
			attempts: 0,
			failedAt: undefined,
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
		await requirePremiumMember(ctx);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.orgId !== ctx.orgId) {
			throw new ConvexError("Sync job not found");
		}
		if (job.status !== "failed") return null;
		await ctx.db.patch(job._id, { status: "ignored" });
		return null;
	},
});

export const retryAllFailed = userMutation({
	args: {},
	handler: async (ctx): Promise<{ retried: number }> => {
		await requirePremiumMember(ctx);
		const failed = await ctx.db
			.query("quickbooksSyncJobs")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", ctx.orgId).eq("status", "failed")
			)
			.take(200);

		const now = Date.now();
		for (const job of failed) {
			await ctx.db.patch(job._id, {
				status: "pending",
				runAfter: now,
				attempts: 0,
				failedAt: undefined,
			});
		}
		if (failed.length > 0) {
			await ctx.scheduler.runAfter(
				0,
				internal.quickbooksActions.processOrgJobs,
				{ orgId: ctx.orgId }
			);
		}
		return { retried: failed.length };
	},
});
