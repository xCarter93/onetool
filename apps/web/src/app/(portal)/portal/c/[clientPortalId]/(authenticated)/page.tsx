import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";

import { PortalContainer } from "@/components/portal/portal-container";
import { WelcomeContent } from "@/components/portal/welcome-content";

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

	return (
		<PortalContainer width="prose">
			<WelcomeContent
				clientPortalId={clientPortalId}
				businessName={branding.name}
				logoUrl={branding.logoUrl}
				logoInvertInDarkMode={branding.logoInvertInDarkMode}
			/>
		</PortalContainer>
	);
}
