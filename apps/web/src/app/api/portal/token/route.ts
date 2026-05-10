import "server-only";
import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { readSessionCookie } from "@/lib/portal/cookie";
import { verifySessionJwt, signConvexAccessToken } from "@/lib/portal/jwt";

// Called by ConvexPortalProvider. Mints a short-lived browser token while the
// long-lived portal session stays in the httpOnly cookie.
export async function GET() {
	const cookieToken = await readSessionCookie();
	if (!cookieToken)
		return NextResponse.json({ error: "no session" }, { status: 401 });

	let payload;
	try {
		payload = (await verifySessionJwt(cookieToken)).payload;
	} catch {
		return NextResponse.json({ error: "expired" }, { status: 401 });
	}

	const sessionJti = payload.jti as string | undefined;
	if (
		!sessionJti ||
		!payload.clientContactId ||
		!payload.orgId ||
		!payload.clientPortalId
	) {
		return NextResponse.json({ error: "expired" }, { status: 401 });
	}

	const session = await fetchQuery(api.portal.sessions.getActiveSessionByJti, {
		tokenJti: sessionJti,
	});
	if (
		!session ||
		session.clientContactId !== payload.clientContactId ||
		session.orgId !== payload.orgId ||
		session.clientPortalId !== payload.clientPortalId
	) {
		return NextResponse.json({ error: "expired" }, { status: 401 });
	}

	const { token: accessToken, expiresAt } = await signConvexAccessToken({
		clientContactId: payload.clientContactId as string,
		orgId: payload.orgId as string,
		clientPortalId: payload.clientPortalId as string,
		sessionJti,
	});

	return NextResponse.json({ token: accessToken, expiresAt });
}
