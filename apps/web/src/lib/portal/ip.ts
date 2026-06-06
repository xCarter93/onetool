import "server-only";
import type { NextRequest } from "next/server";

/** SHA-256 hex digest used for rate limiting and audit without storing raw IPs. */
export async function hashIp(ip: string): Promise<string> {
	const data = new TextEncoder().encode(ip);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Best-effort caller-IP extraction. Deploy behind a trusted edge that replaces
 * forwarded headers; otherwise the fallback collapses to a shared bucket.
 */
export function getRequestIp(req: NextRequest): string {
	const cf = req.headers.get("cf-connecting-ip");
	if (cf) return cf.trim();
	const vercel = req.headers.get("x-vercel-forwarded-for");
	if (vercel) return vercel.split(",")[0]!.trim();
	const fly = req.headers.get("fly-client-ip");
	if (fly) return fly.trim();

	const xff = req.headers.get("x-forwarded-for");
	if (xff) {
		const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
		if (parts.length > 0) return parts[parts.length - 1]!;
	}
	return req.headers.get("x-real-ip") ?? "unknown";
}
