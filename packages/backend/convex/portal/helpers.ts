import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Validated portal session — what `getPortalSessionOrThrow` resolves a JWT
 * identity into after passing all four guards (issuer, audience, custom
 * claims, DB row).
 */
export type PortalSession = {
	orgId: Id<"organizations">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
	tokenJti: string;
};

// [Review fix #4] Audience guard set — accept BOTH the long-lived cookie JWT
// audience and the short-lived realtime token audience. Both are RS256-signed
// by the same private key and discriminated only by claim, not by signing key.
const ACCEPTED_AUDIENCES = new Set([
	"convex-portal",
	"convex-portal-access",
]);

type IdentityWithPortalClaims = {
	issuer?: string;
	aud?: string | string[];
	orgId?: string;
	clientContactId?: string;
	clientPortalId?: string;
	jti?: string;
	sessionJti?: string;
};

/**
 * Portal-only authentication boundary — mirrors `lib/auth.ts.getCurrentUserOrThrow`
 * for the second auth provider. Validates the JWT identity through four
 * independent gates before returning a typed session payload:
 *
 * 1. Issuer must equal `process.env.PORTAL_JWT_ISSUER` — Clerk JWTs are rejected.
 * 2. Audience must be one of {convex-portal, convex-portal-access} (Review fix #4).
 * 3. Required custom claims (orgId, clientContactId, clientPortalId, jti)
 *    must be present.
 * 4. The corresponding `portalSessions` row must exist, must not be expired,
 *    and its claims must match the JWT's claims (Review fix #2 — JWT signature
 *    is NOT the source of truth for revocation; the DB row is).
 *
 * Throws generic messages on failure to avoid enumeration leaks.
 */
export async function getPortalSessionOrThrow(
	ctx: QueryCtx | MutationCtx
): Promise<PortalSession> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error("Portal not authenticated");

	const claims = identity as unknown as IdentityWithPortalClaims;

	const expectedIssuer = process.env.PORTAL_JWT_ISSUER;
	if (!expectedIssuer || claims.issuer !== expectedIssuer) {
		throw new Error("Wrong auth domain — this function is portal-only");
	}

	// [Review fix #4] Audience guard.
	const aud = claims.aud;
	const audValues = Array.isArray(aud) ? aud : aud ? [aud] : [];
	if (!audValues.some((a) => ACCEPTED_AUDIENCES.has(a))) {
		throw new Error("Wrong audience — token not minted for portal");
	}

	const orgId = claims.orgId;
	const clientContactId = claims.clientContactId;
	const clientPortalId = claims.clientPortalId;
	// For short-lived realtime tokens, the cookie's jti is carried in
	// `sessionJti` (per signConvexAccessToken). For the long-lived cookie JWT,
	// the jti is the standard `jti` claim. Prefer sessionJti when present.
	const tokenJti = claims.sessionJti ?? claims.jti;

	if (!orgId || !clientContactId || !clientPortalId || !tokenJti) {
		throw new Error("Malformed portal session");
	}

	// [Review fix #2] DB-side revocation check. Look up the portalSessions row
	// by jti and verify (a) it exists, (b) it is NOT expired, (c) its claims
	// match the JWT claims (defense against jti reuse / cross-portal collision).
	const row = await ctx.db
		.query("portalSessions")
		.withIndex("by_jti", (q) => q.eq("tokenJti", tokenJti))
		.unique();
	if (!row) {
		throw new Error("Session revoked or expired");
	}
	if (row.expiresAt < Date.now()) {
		throw new Error("Session revoked or expired");
	}
	if (
		row.orgId !== (orgId as Id<"organizations">) ||
		row.clientContactId !== (clientContactId as Id<"clientContacts">) ||
		row.clientPortalId !== clientPortalId
	) {
		// Mismatched JWT claims vs DB row — possible token forgery or
		// cross-portal jti collision.
		throw new Error("Session integrity check failed");
	}

	return {
		orgId: orgId as Id<"organizations">,
		clientContactId: clientContactId as Id<"clientContacts">,
		clientPortalId,
		tokenJti,
	};
}
