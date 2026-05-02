"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, FileText, ReceiptText } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";

import { PortalContactPanel } from "./portal-contact-panel";

function formatMoney(amount: number): string {
	return amount.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

function formatDate(ts?: number): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function WelcomeContent({
	clientPortalId,
	businessName,
	logoUrl,
	logoInvertInDarkMode,
}: {
	clientPortalId: string;
	businessName: string;
	logoUrl: string | null;
	logoInvertInDarkMode?: boolean;
}) {
	const quotes = useQuery(api.portal.quotes.list, {});
	const awaiting = (quotes ?? []).filter((q) => q.status === "sent");
	const awaitingTotal = awaiting.reduce((sum, q) => sum + (q.total ?? 0), 0);

	const statusHref =
		awaiting.length === 1
			? `/portal/c/${clientPortalId}/quotes/${awaiting[0]._id}`
			: `/portal/c/${clientPortalId}/quotes`;

	return (
		<div className="grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,1fr)_320px] md:gap-14">
			{/* Prose column */}
			<div className="max-w-xl">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
					Welcome
				</p>
				<h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">
					Your portal with {businessName}
				</h1>
				<p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
					Quotes and invoices from {businessName} land here automatically. No
					apps to install, nothing to set up — just open the link from your
					email whenever you need to.
				</p>

				<div className="mt-12 flex flex-col gap-10 md:gap-9">
					<section className="border-l-2 border-primary pl-5">
						<div className="flex items-center gap-2.5">
							<FileText
								className="h-[18px] w-[18px] text-primary"
								aria-hidden="true"
							/>
							<h2 className="text-[15px] font-semibold tracking-tight">
								Quotes
							</h2>
							<span className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
								Live
							</span>
						</div>
						<p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
							Review the work, costs, and timeline. Reply with questions or
							approve in a single tap — no PDFs to print.
						</p>
					</section>

					<section className="border-l-2 border-primary/30 pl-5">
						<div className="flex items-center gap-2.5">
							<ReceiptText
								className="h-[18px] w-[18px] text-primary/70"
								aria-hidden="true"
							/>
							<h2 className="text-[15px] font-semibold tracking-tight">
								Invoices
							</h2>
							<span className="ml-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Coming soon
							</span>
						</div>
						<p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
							See what&apos;s due, download a copy for your records, and pay
							online — no calls, no checks in the mail.
						</p>
					</section>
				</div>
			</div>

			{/* Right rail */}
			<div className="flex flex-col gap-10 md:gap-12 md:pt-0">
				{awaiting.length > 0 && (
					<section aria-label="Quote status" className="flex flex-col gap-3">
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
							Status
						</p>
						<div className="flex flex-col gap-1">
							<div className="text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
								{formatMoney(awaitingTotal)}
							</div>
							<p className="text-[13px] text-muted-foreground">
								{awaiting.length === 1
									? `1 quote awaiting your decision${
											awaiting[0].validUntil
												? ` · Expires ${formatDate(awaiting[0].validUntil)}`
												: ""
										}`
									: `${awaiting.length} quotes awaiting your decision`}
							</p>
						</div>
						<Link
							href={statusHref}
							className="group inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-primary hover:text-primary/80"
						>
							{awaiting.length === 1 ? "Review quote" : "Review quotes"}
							<ArrowRight
								className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</Link>
					</section>
				)}

				<PortalContactPanel
					logoUrl={logoUrl}
					businessName={businessName}
					logoInvertInDarkMode={logoInvertInDarkMode}
				/>
			</div>
		</div>
	);
}
