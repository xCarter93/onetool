import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { readSessionCookie } from "@/lib/portal/cookie";
import { mapConvexError } from "@/lib/portal/quotes/map-convex-error";

/**
 * Plan 14.1-03: portal-session-scoped PDF download endpoint.
 *
 * Returns 200 { url } where `url` is a short-lived Convex storage URL the
 * client opens in a new tab via window.open(url, "_blank", "noopener,noreferrer")
 * (user decision D-1 2026-05-10). The URL is consumed once per click — no
 * caching, no DB writes. CONTEXT-locked: source is latestDocument.storageId
 * (never the BoldSign-signed variant — different audit trail).
 *
 * No same-origin check: GET is read-only and SameSite=Lax cookie is the
 * secondary CSRF control.
 *
 * Defense-in-depth: middleware (Plan 14.1-01) should 401 missing-cookie
 * requests before this handler runs.
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ quoteId: string }> },
) {
	const { quoteId } = await params;
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
			api.portal.quotes.getDownloadUrl,
			{ quoteId: quoteId as Id<"quotes"> },
			{ token },
		);
		if (!result) {
			return NextResponse.json(
				{ error: "PDF is not yet available for this quote." },
				{ status: 404 },
			);
		}
		return NextResponse.json({ url: result.url });
	} catch (err) {
		return mapConvexError(err);
	}
}
