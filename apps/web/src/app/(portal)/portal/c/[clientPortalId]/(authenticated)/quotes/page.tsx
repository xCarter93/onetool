import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";

import { QuoteList } from "@/components/portal/quotes/quote-list";

export default async function QuotesPage({
	params,
}: {
	params: Promise<{ clientPortalId: string }>;
}) {
	const { clientPortalId } = await params;
	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	if (!branding) {
		notFound();
		return null;
	}

	return <QuoteList businessName={branding.name} />;
}
