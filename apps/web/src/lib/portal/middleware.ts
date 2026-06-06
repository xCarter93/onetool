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

// Public portal paths are exact; authenticated portal paths must have a valid
// portal session cookie.
const PORTAL_VERIFY_RE = /^\/portal\/c\/[a-z0-9-]{8,}\/verify$/;
const PORTAL_SIGNED_OUT_RE = /^\/portal\/c\/[a-z0-9-]{8,}\/signed-out$/;
const PORTAL_EXPIRED_RE = /^\/portal\/expired$/;
const PORTAL_API_OTP_REQUEST_RE = /^\/api\/portal\/otp\/request$/;
const PORTAL_API_OTP_VERIFY_RE = /^\/api\/portal\/otp\/verify$/;
const PORTAL_JWKS_RE = /^\/\.well-known\/portal-jwks\.json$/;

// Source of truth for /api/portal/* paths that bypass the JSON 401. Any new
// public portal API path MUST be added here AND covered by a test in
// middleware.test.ts (Plan 14.1-01).
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

// Plan 14.1-01: API requests under /api/portal/* (excluding isPublicPortalPath
// members) receive a structured JSON envelope instead of an HTML redirect, so
// fetch consumers can show an inline re-verify banner without following a 307.
// Page routes (/portal/c/{id}/...) keep the existing redirectToVerify behavior.
const UNAUTHENTICATED_API_ENVELOPE = {
	code: "unauthenticated",
	message: "Portal session missing or expired",
	retryAfterSeconds: null,
} as const;

function rejectFromMissingOrInvalidSession(req: NextRequest): NextResponse {
	if (req.nextUrl.pathname.startsWith("/api/portal/")) {
		return NextResponse.json(UNAUTHENTICATED_API_ENVELOPE, { status: 401 });
	}
	return redirectToVerify(req);
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
	if (!token) return rejectFromMissingOrInvalidSession(req);

	let payload: Awaited<ReturnType<typeof verifySessionJwt>>["payload"];
	let remainingSeconds = 0;
	try {
		const verified = await verifySessionJwt(token);
		payload = verified.payload;
		remainingSeconds = verified.remainingSeconds;
	} catch {
		return rejectFromMissingOrInvalidSession(req);
	}

	const response = NextResponse.next();

	if (remainingSeconds < COOKIE_REFRESH_THRESHOLD_SECONDS) {
		// Preserve jti so the refreshed cookie remains attached to the existing
		// DB-backed session row. /api/portal/refresh separately extends that row.
		const existingJti = payload.jti as string | undefined;
		if (!existingJti) {
			return rejectFromMissingOrInvalidSession(req);
		}
		const claims: PortalJwtClaims = {
			clientContactId: payload.clientContactId,
			orgId: payload.orgId,
			clientPortalId: payload.clientPortalId,
			jti: existingJti,
		};
		const { token: newToken } = await signSessionJwt(
			claims,
			COOKIE_TTL_SECONDS,
		);
		setSessionCookieOnResponse(newToken, response);

	}

	return response;
}
