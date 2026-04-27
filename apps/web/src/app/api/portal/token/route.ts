import "server-only";
import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/portal/cookie";
import { verifySessionJwt, signConvexAccessToken } from "@/lib/portal/jwt";

// GET — called by ConvexPortalProvider's setAuth callback. Mints a SHORT-LIVED access token
// (5min TTL, aud="convex-portal-access") that is distinct from the cookie JWT. The cookie
// (aud="convex-portal", 24h TTL) is NEVER returned to JS — its existence is the proof that
// we are entitled to mint access tokens on the user's behalf. See Review fix #4 + Blocker 2.
export async function GET() {
	const cookieToken = await readSessionCookie();
	if (!cookieToken)
		return NextResponse.json({ error: "no session" }, { status: 401 });

	let payload;
	try {
		payload = (await verifySessionJwt(cookieToken)).payload; // confirms cookie is signed + not expired
	} catch {
		return NextResponse.json({ error: "expired" }, { status: 401 });
	}

	// Extract the cookie's jti — backend's getPortalSessionOrThrow uses sessionJti to look up the
	// portalSessions row and re-validate (revocation, expiry, claims-match). See 13-02 Review fix #2.
	const sessionJti = payload.jti as string | undefined;
	if (
		!sessionJti ||
		!payload.clientContactId ||
		!payload.orgId ||
		!payload.clientPortalId
	) {
		return NextResponse.json({ error: "expired" }, { status: 401 });
	}

	// Mint the short-lived access token. Carries sessionJti so the backend can re-check the row.
	const { token: accessToken, expiresAt } = await signConvexAccessToken({
		clientContactId: payload.clientContactId as string,
		orgId: payload.orgId as string,
		clientPortalId: payload.clientPortalId as string,
		sessionJti,
	});

	// [Review fix #4 / Blocker 2] Return the freshly-minted access token — NEVER the cookie JWT.
	return NextResponse.json({ token: accessToken, expiresAt });
}
