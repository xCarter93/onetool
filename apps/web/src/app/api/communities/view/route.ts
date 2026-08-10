import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isbot } from "isbot";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp, hashIp } from "@/lib/portal/ip";

/** Bounded pass-through: the fixed enum check happens in recordView. */
function cleanString(value: unknown, maxLength: number): string | undefined {
	return typeof value === "string" && value.length > 0 && value.length <= maxLength
		? value
		: undefined;
}

// Counts one view of a public community page. Mirrors the interest route: the
// real throttle lives in Convex, and this route's only job is to hand it a
// trusted server-derived IP hash. Always answers 200 — a visitor must never
// see an error because a counter was busy.
export async function POST(request: NextRequest) {
	try {
		// Self-identifying crawlers, preview fetchers and scrapers are not
		// visitors; their beacons are dropped silently, like a throttled one.
		if (isbot(request.headers.get("user-agent"))) {
			return NextResponse.json({ success: true });
		}

		const body = await request.json();
		const { slug } = body;

		if (!slug || typeof slug !== "string" || slug.length > 50) {
			return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
		}

		const ipHash = await hashIp(getRequestIp(request));

		// The beacon rides the visitor's own cookies, so a signed-in owner is
		// identifiable here; recordView skips views from the page's own org.
		const { orgId: viewerClerkOrgId } = await auth();

		const client = getConvexClient();
		await client.mutation(api.communityAnalytics.recordView, {
			slug: slug.trim(),
			ipHash,
			viewerClerkOrgId: viewerClerkOrgId ?? undefined,
			src: cleanString(body.src, 32),
			referrer: cleanString(body.referrer, 600),
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Community page view beacon error:", error);
		return NextResponse.json({ success: true });
	}
}
