import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getPortalSessionOrThrow, ABSOLUTE_MAX_MS, IDLE_MAX_MS } from "./helpers";
import { rateLimiter } from "../rateLimits";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const createSession = internalMutation({
	args: {
		orgId: v.id("organizations"),
		clientId: v.id("clients"),
		clientContactId: v.id("clientContacts"),
		clientPortalId: v.string(),
		tokenJti: v.string(),
		userAgent: v.optional(v.string()),
		ipHash: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const id = await ctx.db.insert("portalSessions", {
			orgId: args.orgId,
			clientId: args.clientId,
			clientContactId: args.clientContactId,
			clientPortalId: args.clientPortalId,
			tokenJti: args.tokenJti,
			createdAt: now,
			lastActivityAt: now,
			expiresAt: now + SESSION_TTL_MS,
			userAgent: args.userAgent,
			ipHash: args.ipHash,
		});
		return { sessionId: id, expiresAt: now + SESSION_TTL_MS };
	},
});

/**
 * Read-only session liveness check by jti.
 * PUB-14: returns ONLY the fields the /api/portal/token route cross-checks
 * against its already-verified session JWT — never the full row (userAgent,
 * ipHash, clientId, etc.). Also applies the same absolute/idle ceilings as
 * getPortalSessionOrThrow so we never mint a browser token for a session that
 * would immediately be rejected by the real auth boundary.
 */
export const getActiveSessionByJti = query({
	args: { tokenJti: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			orgId: v.id("organizations"),
			clientContactId: v.id("clientContacts"),
			clientPortalId: v.string(),
		})
	),
	handler: async (ctx, { tokenJti }) => {
		const row = await ctx.db
			.query("portalSessions")
			.withIndex("by_jti", (q) => q.eq("tokenJti", tokenJti))
			.unique();
		if (!row) return null;
		const now = Date.now();
		if (row.expiresAt < now) return null;
		if (row.createdAt + ABSOLUTE_MAX_MS < now) return null;
		if (row.lastActivityAt + IDLE_MAX_MS < now) return null;
		// PUB-10 parity with getPortalSessionOrThrow: an archived client's
		// sessions must not mint browser tokens.
		const client = await ctx.db.get(row.clientId);
		if (!client || client.status === "archived") return null;
		return {
			orgId: row.orgId,
			clientContactId: row.clientContactId,
			clientPortalId: row.clientPortalId,
		};
	},
});

/** Capability-gated refresh for the current portal session row. */
export const touchSession = mutation({
	args: { tokenJti: v.string(), newExpiresAt: v.number() },
	handler: async (ctx, { tokenJti, newExpiresAt }) => {
		const session = await getPortalSessionOrThrow(ctx);
		if (session.tokenJti !== tokenJti) {
			throw new Error("Cannot touch another session");
		}
		// PUB-28: bound refresh-driven writes per session row; a skipped touch
		// only means the row expiry is not extended this round.
		const rl = await rateLimiter.limit(ctx, "portalSessionTouch", {
			key: tokenJti,
		});
		if (!rl.ok) return session._id;
		// Use the session row returned by getPortalSessionOrThrow rather than
		// re-querying by jti — the second lookup was a TOCTOU window for a
		// revocation racing with the touch (and a redundant index read).
		const cappedExpiresAt = Math.min(
			newExpiresAt,
			Date.now() + SESSION_TTL_MS,
		);
		await ctx.db.patch(session._id, {
			lastActivityAt: Date.now(),
			expiresAt: cappedExpiresAt,
		});
		return session._id;
	},
});

/** Capability-gated revocation for the current portal session row. */
export const revokeSessionByJti = mutation({
	args: { tokenJti: v.string() },
	handler: async (ctx, { tokenJti }) => {
		const session = await getPortalSessionOrThrow(ctx);
		if (session.tokenJti !== tokenJti) {
			throw new Error("Cannot revoke another session");
		}
		await ctx.db.delete(session._id);
		return { ok: true };
	},
});
