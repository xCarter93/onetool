import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	readSessionCookie,
	clearSessionCookieOnResponse,
} from "@/lib/portal/cookie";
import { verifySessionJwt } from "@/lib/portal/jwt";
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

	if (token) {
		try {
			const { payload } = await verifySessionJwt(token);
			const jti = payload.jti as string | undefined;
			if (jti) {
				await fetchMutation(
					api.portal.sessions.revokeSessionByJti,
					{ tokenJti: jti },
					{ token },
				);
			}
		} catch {
			// ignore — still clear cookie below
		}
	}

	const response = NextResponse.json({ ok: true });
	clearSessionCookieOnResponse(response);
	return response;
}
