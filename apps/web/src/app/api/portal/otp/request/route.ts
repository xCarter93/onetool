import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchMutation } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";
import { hashIp, getRequestIp } from "@/lib/portal/ip";

const bodySchema = z.object({
	clientPortalId: z.string().min(1),
	email: z.string().email(),
});

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

	try {
		// requestOtp is a public mutation — `fetchMutation` from convex/nextjs
		// only calls public functions. The route-handler-derived ipHash is
		// trusted; deeper hardening (httpAction or shared-secret) tracked
		// separately.
		await fetchMutation(api.portal.otp.requestOtp, {
			clientPortalId: parsed.clientPortalId,
			email: parsed.email,
			ipHash,
		});
		return NextResponse.json({ ok: true });
	} catch (err) {
		// [Review fix #6] Read structured ConvexError data — NEVER regex-parse .message
		if (err instanceof ConvexError) {
			const data = err.data as { code?: string; retryAfter?: number };
			if (data.code === "OTP_RATE_LIMITED") {
				// [Review fix WR-11] Forward retryAfter (seconds) so the UI
				// formats the actual wait time instead of hardcoding 5 min.
				return NextResponse.json(
					{
						error: "Too many requests. Try again in a few minutes.",
						code: data.code,
						retryAfter: data.retryAfter,
					},
					{ status: 429 },
				);
			}
		}
		// Uniform success on any other error — never leak whether the email is on file (Pitfall 1)
		return NextResponse.json({ ok: true });
	}
}
