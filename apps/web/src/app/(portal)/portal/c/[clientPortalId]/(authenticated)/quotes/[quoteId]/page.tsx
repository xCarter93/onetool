import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound, redirect } from "next/navigation";

import { readSessionCookie } from "@/lib/portal/cookie";
import { quoteIdFromParam } from "@/lib/portal/quotes/ids";
import { QuoteDetailIsland } from "@/components/portal/quotes/quote-detail-island";

export default async function QuoteDetailPage({
	params,
}: {
	params: Promise<{ clientPortalId: string; quoteId: string }>;
}) {
	const { clientPortalId, quoteId: rawId } = await params;
	const quoteId = quoteIdFromParam(rawId);

	const token = (await readSessionCookie()) ?? undefined;
	if (!token) {
		redirect(`/portal/c/${clientPortalId}/verify`);
	}

	// Server-fetch mirrors the invoice detail page: the island renders from
	// this data immediately and layers the reactive useQuery on top, so a
	// pending/stalled client query can never strand the loading skeleton.
	let data;
	try {
		data = await fetchQuery(api.portal.quotes.get, { quoteId }, { token });
	} catch {
		// NOT_FOUND, FORBIDDEN, draft masquerade — all collapse to 404.
		notFound();
		return null;
	}

	if (!data) {
		notFound();
		return null;
	}

	return <QuoteDetailIsland quoteId={quoteId} initialData={data} />;
}
