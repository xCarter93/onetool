import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";
import { Check, Mail } from "lucide-react";

import { PortalContainer } from "@/components/portal/portal-container";
import { PortalContactPanel } from "@/components/portal/portal-contact-panel";

export default async function InvoicesPlaceholderPage({
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
	void clientPortalId;

	const features: Array<[string, string]> = [
		[
			"See what's due at a glance",
			"Outstanding balances, due dates, and payment history in one place.",
		],
		[
			"Pay online in seconds",
			"Card or bank transfer — no checks in the mail, no service calls.",
		],
		[
			"Keep your records",
			"Download a PDF copy of any invoice or receipt whenever you need it.",
		],
	];

	return (
		<PortalContainer width="prose">
			<div className="grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,1fr)_320px] md:gap-14">
				{/* Prose column */}
				<div className="max-w-xl">
					<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
						Coming soon
					</p>
					<h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">
						Invoices
					</h1>
					<p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
						{branding.name} will start sending invoices here so you can review
						and pay them without picking up the phone or printing a check.
					</p>

					<ul className="mt-10 flex flex-col gap-6">
						{features.map(([title, desc]) => (
							<li key={title} className="flex items-start gap-3">
								<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
									<Check
										className="h-3 w-3 text-primary"
										aria-hidden="true"
										strokeWidth={3}
									/>
								</span>
								<div>
									<p className="text-[14.5px] font-medium text-foreground">
										{title}
									</p>
									<p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
										{desc}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				{/* Right rail */}
				<div className="flex flex-col gap-10 md:gap-12">
					<section
						aria-label="What stays the same"
						className="flex flex-col gap-3"
					>
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
							While you wait
						</p>
						<div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
							<Mail
								className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<p>
								Until invoices land here,{" "}
								<span className="font-medium text-foreground">
									{branding.name}
								</span>{" "}
								will continue to send them via email — exactly as they do today.
							</p>
						</div>
					</section>

					<PortalContactPanel
						logoUrl={branding.logoUrl}
						businessName={branding.name}
						logoInvertInDarkMode={branding.logoInvertInDarkMode}
					/>
				</div>
			</div>
		</PortalContainer>
	);
}
