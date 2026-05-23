import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getPortalSessionOrThrow } from "./helpers";

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

/** Read-only session lookup by jti. */
export const getActiveSessionByJti = query({
	args: { tokenJti: v.string() },
	handler: async (ctx, { tokenJti }) => {
		const row = await ctx.db
			.query("portalSessions")
			.withIndex("by_jti", (q) => q.eq("tokenJti", tokenJti))
			.unique();
		if (!row) return null;
		if (row.expiresAt < Date.now()) return null;
		return row;
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
