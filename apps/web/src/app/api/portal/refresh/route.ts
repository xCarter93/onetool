import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	readSessionCookie,
	setSessionCookieOnRequest,
	COOKIE_TTL_SECONDS,
} from "@/lib/portal/cookie";
import { signSessionJwt, verifySessionJwt } from "@/lib/portal/jwt";

export async function POST() {
	const token = await readSessionCookie();
	if (!token)
		return NextResponse.json({ error: "no session" }, { status: 401 });

	let payload;
	try {
		payload = (await verifySessionJwt(token)).payload;
	} catch {
		return NextResponse.json({ error: "invalid session" }, { status: 401 });
	}

	// [Blocker 1 / Review fix #3] PRESERVE jti across refresh.
	// The portalSessions row in Convex is keyed by this jti; minting a new UUID would orphan the
	// existing row from the cookie and break revocation lookup in getPortalSessionOrThrow.
	// Only iat/exp change on refresh; the cookie's identity (jti) is stable for the lifetime
	// of the underlying session row. See Review fix #3 strategy A and 13-04 middleware which
	// applies the same invariant on the passive sliding-refresh path.
	const existingJti = payload.jti as string | undefined;
	if (!existingJti) {
		// Defensive: a JWT without jti should never validate. If it does, refuse to refresh
		// rather than silently mint a new identity that has no DB row.
		return NextResponse.json({ error: "invalid session" }, { status: 401 });
	}

	// PRESERVE jti: pass the existing jti into signSessionJwt so it is reused in the new token.
	const {
		token: newToken,
		jti,
		expiresAt,
	} = await signSessionJwt(
		{
			clientContactId: payload.clientContactId,
			orgId: payload.orgId,
			clientPortalId: payload.clientPortalId,
			jti: existingJti, // PRESERVE jti — see Review fix #3
		},
		COOKIE_TTL_SECONDS,
	);

	// Sanity: the helper MUST echo back the same jti we passed in.
	if (jti !== existingJti) {
		return NextResponse.json(
			{ error: "refresh integrity error" },
			{ status: 500 },
		);
	}

	// Update the EXISTING portalSessions row's expiresAt — keyed by the SAME jti.
	// touchSession is a PUBLIC capability-gated mutation per Plan 02 Blocker 3 Option A.
	await fetchMutation(api.portal.sessions.touchSession, {
		tokenJti: existingJti, // PRESERVE jti — same row, just push expiresAt out
		newExpiresAt: expiresAt,
	});

	await setSessionCookieOnRequest(newToken);
	return NextResponse.json({ ok: true, jti });
}
