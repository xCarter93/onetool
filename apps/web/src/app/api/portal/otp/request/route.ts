import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { hashIp, getRequestIp } from "@/lib/portal/ip";

const bodySchema = z.object({
	clientPortalId: z.string().min(1),
	email: z.string().email(),
});

/**
 * [Review fix Greptile-P1] This route is a thin proxy to the Convex
 * httpAction at `/portal/otp/request`. The trust split is:
 *
 *  - The Next.js server (this file) reads the client IP using `getRequestIp`,
 *    which only honours CDN-set headers (CF-Connecting-IP, X-Vercel-Forwarded-
 *    For, etc.) — values the client cannot forge when the deployment sits
 *    behind a CDN that REPLACES X-Forwarded-For. It hashes that IP locally.
 *
 *  - The Convex httpAction does NOT re-derive the IP from headers; it would
 *    be reachable directly from the public internet with arbitrary forwarding
 *    headers. Instead it gates entry on the `x-portal-secret` header,
 *    accepts the precomputed `ipHash`, and runs `internal.portal.otp.requestOtp`.
 *
 * The previous implementation called `fetchMutation(api.portal.otp.requestOtp, ...)`
 * with a client-supplied `ipHash`; that path is structurally closed because
 * `requestOtp` is now `internalMutation` and unreachable from public Convex
 * clients.
 */

function convexHttpUrl(): string {
	// Convex serves httpActions from `<deployment>.convex.site`, while
	// queries/mutations live at `<deployment>.convex.cloud`.
	const cloudUrl = env.NEXT_PUBLIC_CONVEX_URL;
	return cloudUrl.replace(/\.convex\.cloud(\/?$)/, ".convex.site$1");
}

export async function POST(req: NextRequest) {
	let parsed;
	try {
		parsed = bodySchema.parse(await req.json());
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

	// Pass through the JSON body and status verbatim; the httpAction already
	// applies Pitfall #1 uniformity and structured 429 shape.
	const text = await upstream.text();
	return new NextResponse(text, {
		status: upstream.status,
		headers: { "Content-Type": "application/json" },
	});
}
