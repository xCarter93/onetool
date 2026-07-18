import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound, redirect } from "next/navigation";

import { PortalContainer } from "@/components/portal/portal-container";
import {
	QuoteList,
	type QuoteListRow,
} from "@/components/portal/quotes/quote-list";
import { readSessionCookie } from "@/lib/portal/cookie";
import { isPortalAuthError } from "@/lib/portal/errors";

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

	const token = (await readSessionCookie()) ?? undefined;
	if (!token) {
		redirect(`/portal/c/${clientPortalId}/verify`);
	}

	let quotes: QuoteListRow[] = [];
	try {
		quotes = (await fetchQuery(
			api.portal.quotes.list,
			{},
			{ token },
		)) as QuoteListRow[];
	} catch (err) {
		if (isPortalAuthError(err)) {
			redirect(`/portal/c/${clientPortalId}/verify`);
		}
		throw err;
	}

	return (
		<PortalContainer width="list">
			<QuoteList businessName={branding.name} quotes={quotes} />
		</PortalContainer>
	);
}
