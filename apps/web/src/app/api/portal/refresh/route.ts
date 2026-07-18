import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	readSessionCookie,
	setSessionCookieOnResponse,
	COOKIE_TTL_SECONDS,
} from "@/lib/portal/cookie";
import { signSessionJwt, verifySessionJwt } from "@/lib/portal/jwt";
import { isSameOrigin } from "@/lib/portal/origin";

export async function POST(req: NextRequest) {
	if (
		!isSameOrigin(
			req.headers.get("origin"),
			req.headers.get("referer"),
			new URL(req.url).origin,
		)
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const token = await readSessionCookie();
	if (!token)
		return NextResponse.json({ error: "no session" }, { status: 401 });

	let payload;
	try {
		payload = (await verifySessionJwt(token)).payload;
	} catch {
		return NextResponse.json({ error: "invalid session" }, { status: 401 });
	}

	// Preserve jti across refresh so the cookie remains attached to the same
	// DB-backed session row.
	const existingJti = payload.jti as string | undefined;
	if (!existingJti) {
		return NextResponse.json({ error: "invalid session" }, { status: 401 });
	}

	const {
		token: newToken,
		jti,
		expiresAt,
	} = await signSessionJwt(
		{
			clientContactId: payload.clientContactId,
			orgId: payload.orgId,
			clientPortalId: payload.clientPortalId,
			jti: existingJti,
		},
		COOKIE_TTL_SECONDS,
	);

	if (jti !== existingJti) {
		return NextResponse.json(
			{ error: "refresh integrity error" },
			{ status: 500 },
		);
	}

	await fetchMutation(
		api.portal.sessions.touchSession,
		{
			tokenJti: existingJti,
			newExpiresAt: expiresAt,
		},
		{ token },
	);

	const response = NextResponse.json({ ok: true, jti });
	setSessionCookieOnResponse(newToken, response);
	return response;
}
