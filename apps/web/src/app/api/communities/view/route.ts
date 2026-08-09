import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp, hashIp } from "@/lib/portal/ip";

// Counts one view of a public community page. Mirrors the interest route: the
// real throttle lives in Convex, and this route's only job is to hand it a
// trusted server-derived IP hash. Always answers 200 — a visitor must never
// see an error because a counter was busy.
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { slug } = body;

		if (!slug || typeof slug !== "string" || slug.length > 50) {
			return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
		}

		const ipHash = await hashIp(getRequestIp(request));

		const client = getConvexClient();
		await client.mutation(api.communityAnalytics.recordView, {
			slug: slug.trim(),
			ipHash,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Community page view beacon error:", error);
		return NextResponse.json({ success: true });
	}
}
