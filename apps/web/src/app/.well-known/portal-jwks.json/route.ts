import { createHash } from "node:crypto";
import { getJwksJson } from "@/lib/portal/jwt";

export const dynamic = "force-static";

export async function GET() {
	const body = getJwksJson();
	// ETag derived from JWKS content so rotating PORTAL_JWT_JWKS invalidates
	// CDN/browser caches immediately. Cache window stays short (5min) so a
	// manual rotation propagates within minutes even without ETag revalidation.
	const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;
	return new Response(body, {
		headers: {
			"content-type": "application/json",
			"cache-control": "public, max-age=300, s-maxage=300, must-revalidate",
			etag,
		},
	});
}
