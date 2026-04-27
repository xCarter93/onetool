import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const PORTAL_COOKIE = "portal_session";
export const COOKIE_TTL_SECONDS = 60 * 60 * 24; // 24h
export const COOKIE_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 23; // refresh when <23h remaining

const cookieAttrs = () => ({
	httpOnly: true as const,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	// [Review fix CR-01] path="/" so the cookie is sent to BOTH /portal/* pages
	// and /api/portal/* route handlers (token, refresh, logout, otp/verify).
	// A path-scoped cookie at "/portal" was never sent on /api/portal/* — every
	// authenticated API call 401'd. The cookie name `portal_session` is unique
	// enough that path scoping is not needed for collision avoidance.
	path: "/",
	maxAge: COOKIE_TTL_SECONDS,
});

export async function setSessionCookieOnRequest(jwt: string): Promise<void> {
	(await cookies()).set(PORTAL_COOKIE, jwt, cookieAttrs());
}

export function setSessionCookieOnResponse(
	jwt: string,
	response: NextResponse,
): void {
	response.cookies.set(PORTAL_COOKIE, jwt, cookieAttrs());
}

export async function clearSessionCookieOnRequest(): Promise<void> {
	(await cookies()).set(PORTAL_COOKIE, "", { ...cookieAttrs(), maxAge: 0 });
}

export function clearSessionCookieOnResponse(response: NextResponse): void {
	response.cookies.set(PORTAL_COOKIE, "", { ...cookieAttrs(), maxAge: 0 });
}

export async function readSessionCookie(): Promise<string | null> {
	return (await cookies()).get(PORTAL_COOKIE)?.value ?? null;
}
