import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const PORTAL_COOKIE = "portal_session";
export const COOKIE_TTL_SECONDS = 60 * 60 * 24; // 24h
export const COOKIE_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 23; // refresh when <23h remaining

const cookieAttrs = () => ({
	httpOnly: true as const,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	// Must be sent to both /portal/* pages and /api/portal/* route handlers.
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

// Clear both the current "/" cookie and the legacy "/portal" cookie. Next's
// cookie helper dedupes by name, so raw headers are required for both paths.
const CLEAR_PATHS = ["/", "/portal"] as const;

function clearCookieHeader(path: string): string {
	const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
	return `${PORTAL_COOKIE}=; Path=${path}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`;
}

export async function clearSessionCookieOnRequest(): Promise<void> {
	(await cookies()).set(PORTAL_COOKIE, "", {
		...cookieAttrs(),
		maxAge: 0,
		expires: new Date(0),
	});
}

export function clearSessionCookieOnResponse(response: NextResponse): void {
	for (const path of CLEAR_PATHS) {
		response.headers.append("Set-Cookie", clearCookieHeader(path));
	}
}

export async function readSessionCookie(): Promise<string | null> {
	return (await cookies()).get(PORTAL_COOKIE)?.value ?? null;
}
