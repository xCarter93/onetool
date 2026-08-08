import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/factories";
import type { UserMutationCtx, UserQueryCtx } from "./lib/factories";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { hasPremiumAccess } from "./lib/permissions";

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

		await ctx.scheduler.runAfter(
			0,
			internal.quickbooksActions.revokeConnection,
			{ refreshToken: connection.refreshToken }
		);
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
	args: { orgId: v.id("organizations") },
	handler: async (ctx, args): Promise<null> => {
		const connection = await ctx.db
			.query("quickbooksConnections")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.first();
		if (!connection || connection.status === "disconnected") {
			return null;
		}
		await ctx.db.patch(connection._id, {
			status: "needs_reauth",
			lastHealthCheckAt: Date.now(),
		});
		return null;
	},
});
