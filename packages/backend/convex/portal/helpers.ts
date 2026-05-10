import { ConvexError } from "convex/values";
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
 * Portal-only auth boundary. JWT claims must match an active portalSessions row;
 * the signed token alone is not the source of truth for revocation.
 */
export async function getPortalSessionOrThrow(
	ctx: QueryCtx | MutationCtx
): Promise<PortalSession> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED" });

	const claims = identity as unknown as IdentityWithPortalClaims;

	const expectedIssuer = process.env.PORTAL_JWT_ISSUER;
	if (!expectedIssuer || claims.issuer !== expectedIssuer) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}

	const aud = claims.aud;
	if (aud !== undefined && aud !== null) {
		const audValues = Array.isArray(aud) ? aud : [aud];
		if (!audValues.some((a) => ACCEPTED_AUDIENCES.has(a))) {
			throw new ConvexError({ code: "UNAUTHENTICATED" });
		}
	}

	const orgId = claims.orgId;
	const clientContactId = claims.clientContactId;
	const clientPortalId = claims.clientPortalId;
	const tokenJti = claims.sessionJti ?? claims.jti;

	if (!orgId || !clientContactId || !clientPortalId || !tokenJti) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}

	const row = await ctx.db
		.query("portalSessions")
		.withIndex("by_jti", (q) => q.eq("tokenJti", tokenJti))
		.unique();
	if (!row) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}
	if (row.expiresAt < Date.now()) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}
	if (
		row.orgId !== (orgId as Id<"organizations">) ||
		row.clientContactId !== (clientContactId as Id<"clientContacts">) ||
		row.clientPortalId !== clientPortalId
	) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}

	return {
		orgId: orgId as Id<"organizations">,
		clientContactId: clientContactId as Id<"clientContacts">,
		clientPortalId,
		tokenJti,
	};
}
