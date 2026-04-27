import { NextRequest, NextResponse } from "next/server";
import {
	verifySessionJwt,
	signSessionJwt,
	type PortalJwtClaims,
} from "./jwt";
import {
	PORTAL_COOKIE,
	COOKIE_TTL_SECONDS,
	COOKIE_REFRESH_THRESHOLD_SECONDS,
	setSessionCookieOnResponse,
} from "./cookie";

// [Review fix #14] Use strict regex matchers, NOT path-suffix endsWith heuristics.
// Public-within-portal paths are exact: /portal/c/{uuid}/verify and /portal/c/{uuid}/signed-out.
// The clientPortalId segment matches Convex's UUID-like portalAccessId (lowercase alphanum + dash, 8+ chars).
const PORTAL_VERIFY_RE = /^\/portal\/c\/[a-z0-9-]{8,}\/verify$/;
const PORTAL_SIGNED_OUT_RE = /^\/portal\/c\/[a-z0-9-]{8,}\/signed-out$/;
const PORTAL_EXPIRED_RE = /^\/portal\/expired$/;
const PORTAL_API_OTP_REQUEST_RE = /^\/api\/portal\/otp\/request$/;
const PORTAL_API_OTP_VERIFY_RE = /^\/api\/portal\/otp\/verify$/;
const PORTAL_JWKS_RE = /^\/\.well-known\/portal-jwks\.json$/;

export function isPublicPortalPath(pathname: string): boolean {
	return (
		PORTAL_VERIFY_RE.test(pathname) ||
		PORTAL_SIGNED_OUT_RE.test(pathname) ||
		PORTAL_EXPIRED_RE.test(pathname) ||
		PORTAL_API_OTP_REQUEST_RE.test(pathname) ||
		PORTAL_API_OTP_VERIFY_RE.test(pathname) ||
		PORTAL_JWKS_RE.test(pathname)
	);
}

function redirectToVerify(req: NextRequest): NextResponse {
	const url = req.nextUrl.clone();
	const match = req.nextUrl.pathname.match(/^\/portal\/c\/([^/]+)/);
	if (!match) {
		url.pathname = "/portal/expired";
		url.search = "";
		return NextResponse.redirect(url);
	}
	url.pathname = `/portal/c/${match[1]}/verify`;
	url.searchParams.set("next", req.nextUrl.pathname);
	return NextResponse.redirect(url);
}

export async function portalMiddleware(
	req: NextRequest,
): Promise<NextResponse> {
	const pathname = req.nextUrl.pathname;
	if (isPublicPortalPath(pathname)) return NextResponse.next();

	const token = req.cookies.get(PORTAL_COOKIE)?.value;
	if (!token) return redirectToVerify(req);

	let payload: Awaited<ReturnType<typeof verifySessionJwt>>["payload"];
	let remainingSeconds = 0;
	try {
		const verified = await verifySessionJwt(token);
		payload = verified.payload;
		remainingSeconds = verified.remainingSeconds;
	} catch {
		return redirectToVerify(req);
	}

	const response = NextResponse.next();

	if (remainingSeconds < COOKIE_REFRESH_THRESHOLD_SECONDS) {
		// [Review fix #3, strategy A] Sliding refresh PRESERVES the original jti.
		// Only iat/exp change. The portalSessions row keyed by this jti gets its
		// expiresAt updated via touchSession. We do NOT mint a new jti here —
		// that would orphan the cookie's jti from the DB and break revocation.
		// Strategy A chosen over rotation for simplicity: a single source of
		// truth per device session — preserve jti.
		const existingJti = payload.jti as string | undefined;
		if (!existingJti) {
			// Defensive: a JWT without jti should never validate. If it does, force re-verify.
			return redirectToVerify(req);
		}
		const claims: PortalJwtClaims = {
			clientContactId: payload.clientContactId,
			orgId: payload.orgId,
			clientPortalId: payload.clientPortalId,
			jti: existingJti, // [Review fix #3] preserve jti — signSessionJwt accepts claims.jti and reuses it
		};
		const { token: newToken, expiresAt } = await signSessionJwt(
			claims,
			COOKIE_TTL_SECONDS,
		);
		setSessionCookieOnResponse(newToken, response);

		// [Review fix #3] The portalSessions.expiresAt update for the same jti is
		// performed by /api/portal/refresh in Plan 05; surface the jti and new
		// expiry on response headers so that route can read them and call
		// touchSession server-side. Edge runtime cannot fetchMutation directly.
		response.headers.set("x-portal-touch-jti", existingJti);
		response.headers.set("x-portal-touch-expires", String(expiresAt));
	}

	return response;
}
