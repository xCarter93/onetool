import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { hashIp, getRequestIp } from "@/lib/portal/ip";

const bodySchema = z.object({
	clientPortalId: z.string().min(1),
	email: z.string().email(),
});

function convexHttpUrl(): string {
	const cloudUrl = env.NEXT_PUBLIC_CONVEX_URL;
	return cloudUrl.replace(/\.convex\.cloud(\/?$)/, ".convex.site$1");
}

export async function POST(req: NextRequest) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid request body." },
			{ status: 400 },
		);
	}

	let parsed;
	try {
		parsed = bodySchema.parse(body);
	} catch {
		return NextResponse.json(
			{ error: "Enter a valid email address." },
			{ status: 400 },
		);
	}

	const ipHash = await hashIp(getRequestIp(req));

	const upstream = await fetch(`${convexHttpUrl()}/portal/otp/request`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-portal-secret": env.PORTAL_OTP_REQUEST_SECRET,
		},
		body: JSON.stringify({
			clientPortalId: parsed.clientPortalId,
			email: parsed.email,
			ipHash,
		}),
		// Convex httpActions are not edge-cached; ensure no Next.js caching either.
		cache: "no-store",
	});

	const text = await upstream.text();
	return new NextResponse(text, {
		status: upstream.status,
		headers: { "Content-Type": "application/json" },
	});
}
