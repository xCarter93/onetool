import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { redirect, notFound } from "next/navigation";
import { readSessionCookie } from "@/lib/portal/cookie";
import { verifySessionJwt } from "@/lib/portal/jwt";
import { PortalShell } from "@/components/portal/portal-shell";
import type { ReactNode } from "react";

export default async function AuthenticatedPortalLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ clientPortalId: string }>;
}) {
	const { clientPortalId } = await params;

	// Belt-and-suspenders: middleware should have redirected if no/invalid cookie,
	// but verify here too so server-rendered authenticated content cannot leak past
	// a misconfigured middleware matcher.
	const token = await readSessionCookie();
	if (!token) {
		redirect(`/portal/c/${clientPortalId}/verify`);
		return null;
	}
	try {
		const { payload } = await verifySessionJwt(token);
		if (payload.clientPortalId !== clientPortalId) {
			redirect(`/portal/c/${clientPortalId}/verify`);
		}
	} catch {
		redirect(`/portal/c/${clientPortalId}/verify`);
	}

	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	if (!branding) {
		notFound();
		return null;
	}

	return (
		<PortalShell
			clientPortalId={clientPortalId}
			logoUrl={branding.logoUrl}
			businessName={branding.name}
			logoInvertInDarkMode={branding.logoInvertInDarkMode}
		>
			{children}
		</PortalShell>
	);
}
