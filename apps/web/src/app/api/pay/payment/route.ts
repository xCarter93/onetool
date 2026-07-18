import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp } from "@/lib/portal/ip";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const token = searchParams.get("token");

		if (!token) {
			return NextResponse.json({ error: "Token is required" }, { status: 400 });
		}

		const client = getConvexClient();

		// PUB-11: per-IP throttle before the token lookup.
		const rateLimit = await client.mutation(
			api.payments.checkPayReadRateLimit,
			{ ip: getRequestIp(request) }
		);
		if (!rateLimit.ok) {
			return NextResponse.json(
				{ error: "Too many attempts. Please try again shortly." },
				{ status: 429 }
			);
		}

		const data = await client.query(api.payments.getByPublicToken, {
			publicToken: token,
		});

		if (!data) {
			return NextResponse.json({ error: "Payment not found" }, { status: 404 });
		}

		return NextResponse.json(data);
	} catch (error) {
		// PUB-15: never echo raw SDK errors to unauthenticated callers.
		console.error("[pay/payment] error:", error);
		return NextResponse.json(
			{ error: "Failed to load payment. Please try again." },
			{ status: 500 }
		);
	}
}
