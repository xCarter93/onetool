import { QuoteDetailIsland } from "@/components/portal/quotes/quote-detail-island";
import { quoteIdFromParam } from "@/lib/portal/quotes/ids";

export default async function QuoteDetailPage({
	params,
}: {
	params: Promise<{ clientPortalId: string; quoteId: string }>;
}) {
	const { quoteId } = await params;
	return <QuoteDetailIsland quoteId={quoteIdFromParam(quoteId)} />;
}
