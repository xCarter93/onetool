import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";
import { Check, Mail } from "lucide-react";

export default async function QuotesPlaceholderPage({
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

	const features: Array<[string, string]> = [
		[
			"Review line items",
			"See exactly what's included and what each piece costs.",
		],
		[
			"Ask before you commit",
			"Reply directly with anything you'd like clarified or adjusted.",
		],
		[
			"Approve in one tap",
			"Sign and lock in the work — no calls back and forth, no printing.",
		],
	];

	return (
		<div className="max-w-2xl">
			<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
				Coming soon
			</p>
			<h1 className="mt-3 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em]">
				Quotes
			</h1>
			<p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
				{branding.name} will start sending quotes here for review and approval.
				You'll get an email when a quote is ready, and you can sign it from the
				portal in seconds.
			</p>

			<ul className="mt-10 flex flex-col gap-5">
				{features.map(([title, desc]) => (
					<li key={title} className="flex items-start gap-3">
						<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
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

			<div className="mt-12 flex items-start gap-3 rounded-xl bg-muted/50 px-5 py-4">
				<Mail
					className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<p className="text-sm leading-relaxed text-muted-foreground">
					Until then, {branding.name} will continue to send quotes via email.
				</p>
			</div>
		</div>
	);
}
