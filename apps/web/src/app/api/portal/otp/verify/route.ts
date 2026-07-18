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
import { isSameOrigin } from "@/lib/portal/quotes/map-convex-error";

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
	if (
		next.startsWith(`/portal/c/${clientPortalId}/`) ||
		next === `/portal/c/${clientPortalId}`
	) {
		return next;
	}
	return fallback;
}

export async function POST(req: NextRequest) {
	// PUB-02: this is the one portal route that mints a session and sets the
	// portal_session cookie. Without an origin check it is vulnerable to login
	// CSRF / session fixation (SameSite=Lax does not block a cross-site POST
	// from setting a cookie). Match the guard the five sibling routes use.
	if (
		!isSameOrigin(
			req.headers.get("origin"),
			req.headers.get("referer"),
			new URL(req.url).origin,
		)
	) {
		return NextResponse.json(
			{
				error: "Invalid origin",
				code: "INVALID_ORIGIN",
				remainingAttempts: null,
			},
			{ status: 403 },
		);
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{
				error: "Invalid request format.",
				code: "INVALID_REQUEST",
				remainingAttempts: null,
			},
			{ status: 400 },
		);
	}

	let parsed;
	try {
		parsed = bodySchema.parse(body);
	} catch {
		return NextResponse.json(
			{
				error: "Invalid request format.",
				code: "INVALID_REQUEST",
				remainingAttempts: null,
			},
			{ status: 400 },
		);
	}

	const jti = randomUUID();
	const ipHash = await hashIp(getRequestIp(req));
	const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 256);

	let session;
	try {
		session = await fetchAction(api.portal.otp.verifyOtp, {
			clientPortalId: parsed.clientPortalId,
			email: parsed.email,
			code: parsed.code,
			tokenJti: jti,
			userAgent: userAgent || undefined,
			ipHash,
		});
	} catch (err) {
		if (err instanceof ConvexError) {
			const data = err.data as {
				code?: string;
				remainingAttempts?: number | null;
				message?: string;
				retryAfter?: number;
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
						retryAfter: data.retryAfter,
					},
					{ status: 429 },
				);
			}
			if (
				data.code === "OTP_INVALID" ||
				data.code === "OTP_EXPIRED" ||
				data.code === "OTP_CROSS_PORTAL"
			) {
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

	const { token } = await signSessionJwt(
		{
			clientContactId: session.clientContactId,
			orgId: session.orgId,
			clientPortalId: session.clientPortalId,
			jti,
		},
		COOKIE_TTL_SECONDS,
	);

	await setSessionCookieOnRequest(token);

	const redirectTo = safeRedirect(parsed.next, parsed.clientPortalId);
	return NextResponse.json({ ok: true, redirectTo });
}
