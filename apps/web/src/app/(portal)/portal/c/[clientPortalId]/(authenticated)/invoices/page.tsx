import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound, redirect } from "next/navigation";

import { PortalContainer } from "@/components/portal/portal-container";
import { InvoiceList } from "@/components/portal/invoices/invoice-list";
import { readSessionCookie } from "@/lib/portal/cookie";
import { isPortalAuthError } from "@/lib/portal/errors";

export default async function InvoicesPage({
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

	let invoices: Awaited<
		ReturnType<typeof fetchQuery<typeof api.portal.invoices.list>>
	> = [];
	try {
		invoices = await fetchQuery(api.portal.invoices.list, {}, { token });
	} catch (err) {
		if (isPortalAuthError(err)) {
			redirect(`/portal/c/${clientPortalId}/verify`);
		}
		throw err;
	}

	return (
		<PortalContainer width="list">
			<InvoiceList
				invoices={invoices}
				clientPortalId={clientPortalId}
				businessName={branding.name}
			/>
		</PortalContainer>
	);
}
