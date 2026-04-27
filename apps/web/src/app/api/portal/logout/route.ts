import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	readSessionCookie,
	clearSessionCookieOnRequest,
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
				await fetchMutation(api.portal.sessions.revokeSessionByJti, {
					tokenJti: jti,
				});
			}
		} catch {
			// ignore — still clear cookie below
		}
	}

	await clearSessionCookieOnRequest();
	return NextResponse.json({ ok: true });
}
