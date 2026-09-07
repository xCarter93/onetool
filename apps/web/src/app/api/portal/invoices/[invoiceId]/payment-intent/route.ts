import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { readSessionCookie } from "@/lib/portal/cookie";
import { mapConvexError } from "@/lib/portal/quotes/map-convex-error";
import { isSameOrigin } from "@/lib/portal/origin";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ invoiceId: string }> },
) {
	if (
		!isSameOrigin(
			req.headers.get("origin"),
			req.headers.get("referer"),
			new URL(req.url).origin,
		)
	) {
		return NextResponse.json(
			{ error: "Forbidden", code: "csrf" },
			{ status: 403 },
		);
	}

	const token = await readSessionCookie();
	if (!token) {
		return NextResponse.json(
			{ error: "Unauthorized", code: "unauthenticated" },
			{ status: 401 },
		);
	}

	const { invoiceId } = await params;

	try {
		const result = await fetchAction(
			api.portal.invoicesActions.createPaymentIntent,
			{ invoiceId: invoiceId as Id<"invoices"> },
			{ token },
		);
		return NextResponse.json(result);
	} catch (err) {
		// Transient Stripe failure: nothing was charged, so invite a retry.
		if (
			err instanceof ConvexError &&
			(err.data as { code?: string })?.code === "STRIPE_UNAVAILABLE"
		) {
			return NextResponse.json(
				{
					error:
						"Stripe is temporarily unavailable. Nothing was charged, so please try again in a moment.",
					code: "stripe_unavailable",
				},
				{ status: 503 },
			);
		}
		if (
			err instanceof ConvexError &&
			(err.data as { code?: string })?.code === "PAYMENT_NEEDS_REVIEW"
		) {
			return NextResponse.json(
				{
					error:
						"A payment for this invoice is already being reviewed. Please contact the business before paying again.",
					code: "needs_review",
				},
				{ status: 409 },
			);
		}
		return mapConvexError(err);
	}
}
