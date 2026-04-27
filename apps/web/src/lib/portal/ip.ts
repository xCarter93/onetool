import "server-only";
import type { NextRequest } from "next/server";

/** SHA-256 hex digest of the client IP. Used as the rate-limit key + portalSessions.ipHash for audit without storing PII. */
export async function hashIp(ip: string): Promise<string> {
	const data = new TextEncoder().encode(ip);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Best-effort caller-IP extraction from forwarded headers. Returns "unknown" when no header is set (e.g., local dev). */
export function getRequestIp(req: NextRequest): string {
	const xff = req.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0]!.trim();
	return req.headers.get("x-real-ip") ?? "unknown";
}
