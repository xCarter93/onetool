import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default async function ClientPortalLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ clientPortalId: string }>;
}) {
	const { clientPortalId } = await params;
	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	if (!branding) {
		notFound(); // generic 404, no enumeration leak
		return null; // unreachable — appease TS narrowing
	}

	return (
		<div data-portal-branding data-business-name={branding.name}>
			{children}
		</div>
	);
}
