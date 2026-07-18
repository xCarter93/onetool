import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp, hashIp } from "@/lib/portal/ip";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string }> }
) {
	try {
		const { slug } = await params;

		if (!slug) {
			return NextResponse.json({ error: "Missing slug" }, { status: 400 });
		}

		const client = getConvexClient();

		// PUB-16: distributed per-IP throttle on the uncached read path.
		const ipHash = await hashIp(getRequestIp(request));
		const rateLimit = await client.mutation(
			api.communityPages.checkPublicReadRateLimit,
			{ ipHash }
		);
		if (!rateLimit.ok) {
			return NextResponse.json(
				{ error: "Too many requests. Please try again shortly." },
				{ status: 429 }
			);
		}

		const data = await client.query(api.communityPages.getBySlug, { slug });

		if (!data) {
			return NextResponse.json({ error: "Page not found" }, { status: 404 });
		}

		// PUB-16: public near-static data — CDN-cache for 60s
		return NextResponse.json(data, {
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load page";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
