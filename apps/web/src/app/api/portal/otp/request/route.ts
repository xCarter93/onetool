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
		await fetchMutation(api.portal.otp.requestOtp, {
			clientPortalId: parsed.clientPortalId,
			email: parsed.email,
			ipHash,
		});
		return NextResponse.json({ ok: true });
	} catch (err) {
		// [Review fix #6] Read structured ConvexError data — NEVER regex-parse .message
		if (err instanceof ConvexError) {
			const data = err.data as { code?: string };
			if (data.code === "OTP_RATE_LIMITED") {
				return NextResponse.json(
					{
						error: "Too many requests. Try again in a few minutes.",
						code: data.code,
					},
					{ status: 429 },
				);
			}
		}
		// Uniform success on any other error — never leak whether the email is on file (Pitfall 1)
		return NextResponse.json({ ok: true });
	}
}
