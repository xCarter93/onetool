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

// Clear at BOTH "/" (current) and "/portal" (legacy from before [CR-01]) — browsers
// treat cookies at different paths as independent records, so a single clear leaves
// any stale path-scoped cookie behind and middleware happily reads it.
//
// IMPORTANT: NextResponse.cookies.set() / next/headers cookies().set() are keyed by
// cookie NAME — calling .set twice with the same name overwrites the prior call and
// only one Set-Cookie header is emitted. Emit raw Set-Cookie headers via
// response.headers.append (or the cookie-jar's underlying Set-Cookie store) so both
// path-scoped clears actually reach the browser.
const CLEAR_PATHS = ["/", "/portal"] as const;

function clearCookieHeader(path: string): string {
	const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
	return `${PORTAL_COOKIE}=; Path=${path}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`;
}

export async function clearSessionCookieOnRequest(): Promise<void> {
	// next/headers cookies() in route handlers serializes via the response Set-Cookie
	// store; calling .set twice with the same name still overwrites, so use .delete
	// to emit a "delete" hint and rely on clearSessionCookieOnResponse for legacy
	// path coverage where possible.
	const jar = await cookies();
	jar.delete(PORTAL_COOKIE);
}

export function clearSessionCookieOnResponse(response: NextResponse): void {
	for (const path of CLEAR_PATHS) {
		response.headers.append("Set-Cookie", clearCookieHeader(path));
	}
}

export async function readSessionCookie(): Promise<string | null> {
	return (await cookies()).get(PORTAL_COOKIE)?.value ?? null;
}
