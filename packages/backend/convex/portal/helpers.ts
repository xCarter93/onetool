import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Validated portal session — what `getPortalSessionOrThrow` resolves a JWT
 * identity into after passing all four guards (issuer, audience, custom
 * claims, DB row).
 */
export type PortalSession = {
	_id: Id<"portalSessions">;
	orgId: Id<"organizations">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
	tokenJti: string;
};

const ACCEPTED_AUDIENCES = new Set([
	"convex-portal",
	"convex-portal-access",
]);

// PUB-07: portal sessions previously slid indefinitely — touchSession and the
// 20h background ping re-anchored expiry to `now` on every request, so a stolen
// cookie could be kept alive forever. Bound sessions two ways, enforced from the
// DB row (never a JWT claim): an absolute ceiling from createdAt, and an idle
// timeout from lastActivityAt.
export const ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const IDLE_MAX_MS = 60 * 60 * 1000; // 60 minutes

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

	// PUB-08: require the aud claim. Convex's customJwt provider enforces
	// issuer/algorithm/signature but NOT audience, so this ad-hoc check is the
	// only audience binding — a signed token that simply omitted `aud` would
	// otherwise bypass it entirely (fail-open).
	const aud = claims.aud;
	if (aud === undefined || aud === null) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}
	const audValues = Array.isArray(aud) ? aud : [aud];
	if (!audValues.some((a) => ACCEPTED_AUDIENCES.has(a))) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
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
	const now = Date.now();
	if (row.expiresAt < now) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}
	// PUB-07: absolute ceiling and idle timeout, both anchored to durable row
	// fields rather than the sliding expiresAt.
	if (row.createdAt + ABSOLUTE_MAX_MS < now) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}
	if (row.lastActivityAt + IDLE_MAX_MS < now) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}
	if (
		row.orgId !== (orgId as Id<"organizations">) ||
		row.clientContactId !== (clientContactId as Id<"clientContacts">) ||
		row.clientPortalId !== clientPortalId
	) {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}

	// PUB-10: an archived client's existing sessions must stop working
	// immediately, not just be blocked from creating new ones.
	const client = await ctx.db.get(row.clientId);
	if (!client || client.status === "archived") {
		throw new ConvexError({ code: "UNAUTHENTICATED" });
	}

	return {
		_id: row._id,
		orgId: orgId as Id<"organizations">,
		clientContactId: clientContactId as Id<"clientContacts">,
		clientPortalId,
		tokenJti,
	};
}
