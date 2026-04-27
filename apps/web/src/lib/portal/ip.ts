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

/**
 * Best-effort caller-IP extraction from forwarded headers.
 *
 * [Review fix WR-01] Trust assumption: the portal MUST be deployed behind a
 * CDN/proxy that REPLACES (not appends to) X-Forwarded-For. We prefer
 * CDN-specific headers when available (CF-Connecting-IP, X-Vercel-
 * Forwarded-For, Fly-Client-IP) which cannot be spoofed by the client and
 * are set authoritatively by the edge. Fall back to the LAST entry of XFF
 * (closer to the trusted edge than the leftmost) and then to x-real-ip.
 *
 * In self-hosted / non-CDN deployments where no trusted header is set, we
 * return "unknown" so the rate-limit key is constant and the per-IP cap is
 * applied as one shared bucket — better than letting the attacker rotate
 * the key by setting their own XFF.
 */
export function getRequestIp(req: NextRequest): string {
	// CDN-specific headers — trust these first; they are set by the edge.
	const cf = req.headers.get("cf-connecting-ip");
	if (cf) return cf.trim();
	const vercel = req.headers.get("x-vercel-forwarded-for");
	if (vercel) return vercel.split(",")[0]!.trim();
	const fly = req.headers.get("fly-client-ip");
	if (fly) return fly.trim();

	const xff = req.headers.get("x-forwarded-for");
	if (xff) {
		// Prefer the LAST entry (closest to the trusted edge proxy) over the
		// leftmost (which is client-controlled in non-CDN environments).
		const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
		if (parts.length > 0) return parts[parts.length - 1]!;
	}
	return req.headers.get("x-real-ip") ?? "unknown";
}
