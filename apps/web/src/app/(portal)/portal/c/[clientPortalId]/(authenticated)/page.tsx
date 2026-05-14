import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound, redirect } from "next/navigation";

import { PortalContainer } from "@/components/portal/portal-container";
import { WelcomeContent } from "@/components/portal/welcome-content";
import { readSessionCookie } from "@/lib/portal/cookie";

export default async function AuthenticatedPortalHome({
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
	} catch {
		redirect(`/portal/c/${clientPortalId}/verify`);
	}

	return (
		<PortalContainer width="detail">
			<WelcomeContent
				clientPortalId={clientPortalId}
				businessName={branding.name}
				logoUrl={branding.logoUrl}
				logoInvertInDarkMode={branding.logoInvertInDarkMode}
				invoices={invoices}
			/>
		</PortalContainer>
	);
}
