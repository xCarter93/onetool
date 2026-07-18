import { NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";

export async function GET() {
	try {
		const client = getConvexClient();
		const data = await client.query(api.communityPages.listPublic, {
			limit: 12,
		});

		// PUB-16: public near-static data — CDN-cache for 60s
		return NextResponse.json(data, {
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load showcase";
		console.error("Showcase fetch error:", error);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
