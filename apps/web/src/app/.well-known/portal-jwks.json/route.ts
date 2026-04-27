import { getJwksJson } from "@/lib/portal/jwt";

export const dynamic = "force-static";

export async function GET() {
	return new Response(getJwksJson(), {
		headers: {
			"content-type": "application/json",
			"cache-control": "public, max-age=3600, s-maxage=86400",
		},
	});
}
