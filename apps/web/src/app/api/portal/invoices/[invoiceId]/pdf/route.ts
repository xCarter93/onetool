import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { readSessionCookie } from "@/lib/portal/cookie";
import { mapConvexError } from "@/lib/portal/quotes/map-convex-error";

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ invoiceId: string }> },
) {
	const { invoiceId } = await params;
	const token = await readSessionCookie();
	if (!token) {
		return NextResponse.json(
			{
				code: "unauthenticated",
				message: "Portal session missing or expired",
				retryAfterSeconds: null,
			},
			{ status: 401 },
		);
	}
	try {
		const result = await fetchQuery(
			api.portal.invoices.getDownloadUrl,
			{ invoiceId: invoiceId as Id<"invoices"> },
			{ token },
		);
		if (!result) {
			return NextResponse.json(
				{ error: "PDF is not yet available for this invoice." },
				{ status: 404 },
			);
		}
		return NextResponse.json({ url: result.url });
	} catch (err) {
		return mapConvexError(err);
	}
}
