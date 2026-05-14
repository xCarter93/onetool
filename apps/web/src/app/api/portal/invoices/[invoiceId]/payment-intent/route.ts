import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { readSessionCookie } from "@/lib/portal/cookie";
import {
	mapConvexError,
	isSameOrigin,
} from "@/lib/portal/quotes/map-convex-error";

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
		return mapConvexError(err);
	}
}
