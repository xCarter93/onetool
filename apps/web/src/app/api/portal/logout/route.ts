import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	readSessionCookie,
	clearSessionCookieOnResponse,
} from "@/lib/portal/cookie";
import { verifySessionJwt } from "@/lib/portal/jwt";

export async function POST() {
	const token = await readSessionCookie();

	// Always clear the cookie even if token is malformed
	if (token) {
		try {
			const { payload } = await verifySessionJwt(token);
			const jti = payload.jti as string | undefined;
			if (jti) {
				// Forward the cookie JWT so Convex auth identifies the caller and
				// getPortalSessionOrThrow inside revokeSessionByJti succeeds.
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
