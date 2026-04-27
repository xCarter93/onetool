import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchAction } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";
import { signSessionJwt } from "@/lib/portal/jwt";
import {
	setSessionCookieOnRequest,
	COOKIE_TTL_SECONDS,
} from "@/lib/portal/cookie";
import { hashIp, getRequestIp } from "@/lib/portal/ip";

// Edge-safe randomUUID (Web Crypto, available in both Node 19+ and Edge runtime)
function randomUUID(): string {
	return crypto.randomUUID();
}

const bodySchema = z.object({
	clientPortalId: z.string().min(1),
	email: z.string().email(),
	code: z.string().regex(/^\d{6}$/),
	next: z.string().optional(),
});

function safeRedirect(
	next: string | undefined,
	clientPortalId: string,
): string {
	const fallback = `/portal/c/${clientPortalId}`;
	if (!next) return fallback;
	// Open-redirect guard: only allow same-portal paths
	if (
		next.startsWith(`/portal/c/${clientPortalId}/`) ||
		next === `/portal/c/${clientPortalId}`
	) {
		return next;
	}
	return fallback;
}

export async function POST(req: NextRequest) {
	let parsed;
	try {
		parsed = bodySchema.parse(await req.json());
	} catch {
		return NextResponse.json(
			{
				error: "That code didn't match.",
				code: "OTP_INVALID",
				remainingAttempts: null,
			},
			{ status: 400 },
		);
	}

	// [Review fix #5] Generate jti UP-FRONT. The action returns the same jti so the JWT and the
	// portalSessions row stay tightly coupled. createSession is internalMutation — this is the only path.
	const jti = randomUUID();
	const ipHash = await hashIp(getRequestIp(req));
	const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 256);

	let session;
	try {
		// [Review fix #5] verifyOtp is an action (Plan 03) that atomically validates code + creates session row.
		session = await fetchAction(api.portal.otp.verifyOtp, {
			clientPortalId: parsed.clientPortalId,
			email: parsed.email,
			code: parsed.code,
			tokenJti: jti,
			userAgent: userAgent || undefined,
			ipHash,
		});
	} catch (err) {
		// [Review fix #6] Read structured ConvexError data — NEVER regex-parse .message
		if (err instanceof ConvexError) {
			const data = err.data as {
				code?: string;
				remainingAttempts?: number | null;
				message?: string;
			};
			if (data.code === "OTP_EXHAUSTED") {
				return NextResponse.json(
					{
						error: "Too many attempts. Request a new code to continue.",
						code: "OTP_EXHAUSTED",
						remainingAttempts: 0,
					},
					{ status: 429 },
				);
			}
			if (data.code === "OTP_RATE_LIMITED") {
				return NextResponse.json(
					{
						error: "Too many attempts. Please try again in a few minutes.",
						code: "OTP_RATE_LIMITED",
						remainingAttempts: null,
					},
					{ status: 429 },
				);
			}
			if (
				data.code === "OTP_INVALID" ||
				data.code === "OTP_EXPIRED" ||
				data.code === "OTP_CROSS_PORTAL"
			) {
				// Uniform user-facing copy regardless of internal taxonomy (Pitfall 1)
				return NextResponse.json(
					{
						error: "That code didn't match. Please try again.",
						code: data.code,
						remainingAttempts: data.remainingAttempts ?? null,
					},
					{ status: 401 },
				);
			}
		}
		return NextResponse.json(
			{
				error: "Something went wrong. Please try again.",
				code: "GENERIC",
				remainingAttempts: null,
			},
			{ status: 500 },
		);
	}

	// The action created the portalSessions row keyed by jti. Now sign the cookie JWT with the SAME jti.
	const { token } = await signSessionJwt(
		{
			clientContactId: session.clientContactId,
			orgId: session.orgId,
			clientPortalId: session.clientPortalId,
			jti, // pin
		},
		COOKIE_TTL_SECONDS,
	);

	await setSessionCookieOnRequest(token);

	const redirectTo = safeRedirect(parsed.next, parsed.clientPortalId);
	return NextResponse.json({ ok: true, redirectTo });
}
