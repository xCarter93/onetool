import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";
import OtpForm from "@/components/portal/otp-form";
import { BrandHeader } from "@/components/portal/brand-header";
import { PoweredByOneTool } from "@/components/portal/powered-by-onetool";

export default async function VerifyPage({
	params,
	searchParams,
}: {
	params: Promise<{ clientPortalId: string }>;
	searchParams: Promise<{ next?: string }>;
}) {
	const { clientPortalId } = await params;
	const { next } = await searchParams;
	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	if (!branding) {
		notFound();
		return null;
	}

	return (
		<div className="grid min-h-screen md:grid-cols-[1.05fr_460px]">
			{/* Left brand panel — desktop only */}
			<aside className="hidden md:flex flex-col justify-between p-12 bg-linear-to-br from-background to-card">
				<div className="flex items-center gap-2 text-sm font-semibold">
					OneTool
				</div>
				<div className="flex items-center justify-center">
					<BrandHeader
						logoUrl={branding.logoUrl}
						businessName={branding.name}
						logoInvertInDarkMode={branding.logoInvertInDarkMode}
					/>
				</div>
				<PoweredByOneTool />
			</aside>

			{/* Right form panel — full width on mobile */}
			<main className="flex flex-col px-6 py-8 md:px-14 md:py-12 bg-card">
				<div className="md:hidden mb-8 flex flex-col gap-6">
					<BrandHeader
						logoUrl={branding.logoUrl}
						businessName={branding.name}
						logoInvertInDarkMode={branding.logoInvertInDarkMode}
					/>
				</div>
				<p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground mb-2">
					SIGN IN
				</p>
				<OtpForm
					businessName={branding.name}
					clientPortalId={clientPortalId}
					nextPath={next}
				/>
				<div className="mt-auto pt-12 md:hidden">
					<PoweredByOneTool />
				</div>
			</main>
		</div>
	);
}
