import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getPortalSessionOrThrow } from "./helpers";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * [Review fix #5] internalMutation — only callable from Convex internal
 * references. Plan 03's verifyOtp action invokes this via
 * `ctx.runMutation(internal.portal.sessions.createSession, ...)` after
 * validating OTP correctness. The Next.js route handler never invokes
 * createSession directly; instead it invokes verifyOtp (an action), which
 * atomically validates the code AND creates the session.
 */
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
 * Public-friendly query — used by getPortalSessionOrThrow and (when needed)
 * by other code paths. Read-only and bounded to a single jti, so exposing it
 * publicly does not enable enumeration.
 */
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

/**
 * [Blocker 3 Option A] PUBLIC mutation — invoked by the Next.js refresh route
 * handler via `fetchMutation(api.portal.sessions.touchSession, ...)`.
 * `fetchMutation` cannot invoke an `internalMutation`, so this MUST be public.
 * Capability is enforced inside the handler: the caller's JWT identity is
 * validated by `getPortalSessionOrThrow` (which checks issuer, audience, and
 * the DB row), then we assert `session.tokenJti === args.tokenJti` before
 * patching. A leaked jti from a network log alone is insufficient — the
 * attacker would also need the cookie/JWT.
 */
export const touchSession = mutation({
	args: { tokenJti: v.string(), newExpiresAt: v.number() },
	handler: async (ctx, { tokenJti, newExpiresAt }) => {
		const session = await getPortalSessionOrThrow(ctx);
		if (session.tokenJti !== tokenJti) {
			throw new Error("Cannot touch another session");
		}
		const row = await ctx.db
			.query("portalSessions")
			.withIndex("by_jti", (q) => q.eq("tokenJti", tokenJti))
			.unique();
		if (!row) return null;
		await ctx.db.patch(row._id, {
			lastActivityAt: Date.now(),
			expiresAt: newExpiresAt,
		});
		return row._id;
	},
});

/**
 * [Review fix #5] PUBLIC mutation — capability-gated. The caller MUST possess
 * the cookie JWT whose jti matches the target. Convex evaluates ctx.auth
 * before the handler runs, then `getPortalSessionOrThrow` validates
 * issuer/audience/DB-row, and the assert below enforces jti-equality.
 * A leaked jti is insufficient: state changes require possessing the cookie.
 */
export const revokeSessionByJti = mutation({
	args: { tokenJti: v.string() },
	handler: async (ctx, { tokenJti }) => {
		const session = await getPortalSessionOrThrow(ctx);
		if (session.tokenJti !== tokenJti) {
			throw new Error("Cannot revoke another session");
		}
		const row = await ctx.db
			.query("portalSessions")
			.withIndex("by_jti", (q) => q.eq("tokenJti", tokenJti))
			.unique();
		if (row) await ctx.db.delete(row._id);
		return { ok: true };
	},
});
