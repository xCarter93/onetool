import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { getRequestIp } from "@/lib/portal/ip";
import { readSessionCookie } from "@/lib/portal/cookie";
import { approveBodySchema } from "@/lib/portal/quotes/normalize-signature-payload";
import {
	mapConvexError,
	isSameOrigin,
} from "@/lib/portal/quotes/map-convex-error";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ quoteId: string }> },
) {
	const host = req.headers.get("host");
	if (
		!isSameOrigin(
			req.headers.get("origin"),
			req.headers.get("referer"),
			host,
		)
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const { quoteId } = await params;
	const json = await req.json().catch(() => null);
	const parsed = approveBodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
	if (
		parsed.data.signatureMode === "typed" &&
		parsed.data.intentAffirmed !== true
	) {
		return NextResponse.json(
			{ error: "Intent affirmation is required for typed signatures." },
			{ status: 400 },
		);
	}

	const ip = getRequestIp(req);
	const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 512);
	const token = await readSessionCookie();
	if (!token) {
		return NextResponse.json(
			{ error: "Unauthorized", code: "unauthenticated" },
			{ status: 401 },
		);
	}

	try {
		// SINGLE action call — Plan 14-02 collapsed upload+approve into one
		// transactional flow with orphan-blob cleanup on failure.
		const receipt = await fetchAction(
			api.portal.quotes.approve,
			{
				quoteId: quoteId as Id<"quotes">,
				expectedDocumentId: parsed.data.expectedDocumentId as Id<"documents">,
				signatureBase64: parsed.data.signatureBase64,
				signatureMode: parsed.data.signatureMode,
				signatureRawData: parsed.data.signatureRawData,
				ipAddress: ip,
				userAgent,
				termsAccepted: true,
			},
			{ token },
		);
		return NextResponse.json({ ok: true, receipt });
	} catch (err) {
		return mapConvexError(err);
	}
}
