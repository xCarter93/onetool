"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	ArrowRight,
	CircleAlert,
	CircleCheck,
	FileText,
	Receipt,
} from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { formatDate, formatMoney } from "@/lib/portal/format";

import { PortalContactPanel } from "./portal-contact-panel";
import type { PortalInvoiceListItem } from "./invoices/invoice-list";

type Quote = FunctionReturnType<typeof api.portal.quotes.list>[number];

function isOutstanding(inv: PortalInvoiceListItem): boolean {
	return !inv.paymentSummary.isLegacy && inv.paymentSummary.displayStatus !== "paid";
}

export function WelcomeContent({
	clientPortalId,
	businessName,
	logoUrl,
	logoInvertInDarkMode,
	invoices,
}: {
	clientPortalId: string;
	businessName: string;
	logoUrl: string | null;
	logoInvertInDarkMode?: boolean;
	invoices: PortalInvoiceListItem[];
}) {
	const quotes = useQuery(api.portal.quotes.list, {}) ?? [];

	const awaitingQuotes = quotes.filter((q) => q.status === "sent");
	const outstandingInvoices = invoices.filter(isOutstanding);
	const outstandingTotal = outstandingInvoices.reduce(
		(sum, inv) => sum + inv.paymentSummary.totalRemaining,
		0,
	);

	const base = `/portal/c/${clientPortalId}`;
	const firstOutstanding = outstandingInvoices[0];
	const firstAwaitingQuote = awaitingQuotes[0];

	const invoiceHref = firstOutstanding
		? `${base}/invoices/${firstOutstanding._id}`
		: `${base}/invoices`;
	const quoteHref = firstAwaitingQuote
		? `${base}/quotes/${firstAwaitingQuote._id}`
		: `${base}/quotes`;

	const hasAttention = outstandingInvoices.length > 0 || awaitingQuotes.length > 0;

	const today = new Date();
	const greetingDate = today.toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
	const activity = buildActivityFeed(quotes, invoices).slice(0, 6);

	// "View all" routes to the list that matches the most-recent activity kind
	// — so a portal user with only quote activity doesn't land on an empty
	// invoices page.
	const viewAllHref = (() => {
		const first = activity[0];
		if (first?.kind === "quote") return `${base}/quotes`;
		return `${base}/invoices`;
	})();

	return (
		<div className="-mx-6 -my-6 md:-mx-9 md:-my-6">
			{/* Greeting strip */}
			<div className="relative overflow-hidden border-b border-border bg-card px-6 pt-8 pb-6 md:px-9 md:pt-10 md:pb-7">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 opacity-[0.35]"
					style={{
						backgroundImage:
							"radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--primary) 25%, transparent) 1px, transparent 0)",
						backgroundSize: "14px 14px",
					}}
				/>
				<div className="relative flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
							{greetingDate}
						</p>
						<h1 className="mt-1 text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[34px]">
							Welcome back <span aria-hidden="true">👋</span>
						</h1>
						<p className="mt-2 text-[15px] text-muted-foreground">
							Here&apos;s what&apos;s happening with your{" "}
							<span className="inline-block rounded-md border border-dashed border-primary/60 bg-primary/10 px-1.5 py-0.5 text-foreground">
								{businessName}
							</span>{" "}
							service.
						</p>
					</div>
				</div>
			</div>

			{/* Main */}
			<div className="px-6 py-6 md:px-9 md:py-7 flex flex-col gap-5">
				{hasAttention && (
					<AttentionCard
						outstandingCount={outstandingInvoices.length}
						awaitingQuotesCount={awaitingQuotes.length}
						outstandingTotal={outstandingTotal}
						firstOutstanding={firstOutstanding}
						firstAwaitingQuote={firstAwaitingQuote}
						invoiceHref={invoiceHref}
						quoteHref={quoteHref}
					/>
				)}

				<div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:items-start">
					{/* Recent activity */}
					<section className="rounded-2xl border border-border bg-card overflow-hidden">
						<header className="flex items-center justify-between border-b border-border px-5 py-4">
							<div>
								<h2 className="text-[15px] font-semibold">Recent activity</h2>
								<p className="text-[12px] text-muted-foreground mt-0.5">
									Latest from {businessName}
								</p>
							</div>
							<Link
								href={viewAllHref}
								className="text-[13px] font-medium text-primary hover:text-primary/80"
							>
								View all →
							</Link>
						</header>
						{activity.length === 0 ? (
							<div className="px-5 py-10 text-center">
								<p className="text-[13px] text-muted-foreground">
									Nothing here yet. When {businessName} sends you a quote or
									invoice, it&apos;ll show up here.
								</p>
							</div>
						) : (
							<ul className="divide-y divide-border">
								{activity.map((a) => (
									<li
										key={a.key}
										className="flex items-center gap-4 px-5 py-4"
									>
										<span
											className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${a.tintBg} ${a.tintFg}`}
										>
											<a.icon className="h-[18px] w-[18px]" aria-hidden="true" />
										</span>
										<div className="min-w-0 flex-1">
											<div className="text-[14px] font-medium truncate">
												{a.title}
											</div>
											<div className="text-[12px] text-muted-foreground truncate mt-0.5">
												{a.meta}
											</div>
										</div>
										{a.pillLabel && (
											<span
												className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${a.pillClass}`}
											>
												<span className="h-1.5 w-1.5 rounded-full bg-current" />
												{a.pillLabel}
											</span>
										)}
										<div className="text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
											{a.time}
										</div>
									</li>
								))}
							</ul>
						)}
					</section>

					{/* Right rail */}
					<aside className="rounded-2xl border border-border bg-card p-5">
						<PortalContactPanel
							logoUrl={logoUrl}
							businessName={businessName}
							logoInvertInDarkMode={logoInvertInDarkMode}
						/>
					</aside>
				</div>
			</div>
		</div>
	);
}

function AttentionCard({
	outstandingCount,
	awaitingQuotesCount,
	outstandingTotal,
	firstOutstanding,
	firstAwaitingQuote,
	invoiceHref,
	quoteHref,
}: {
	outstandingCount: number;
	awaitingQuotesCount: number;
	outstandingTotal: number;
	firstOutstanding?: PortalInvoiceListItem;
	firstAwaitingQuote?: Quote;
	invoiceHref: string;
	quoteHref: string;
}) {
	const lines: string[] = [];
	if (outstandingCount > 0) {
		lines.push(
			outstandingCount === 1
				? `${formatMoney(outstandingTotal)} due${
						firstOutstanding?.dueDate
							? ` ${formatDate(firstOutstanding.dueDate)}`
							: ""
					}`
				: `${formatMoney(outstandingTotal)} across ${outstandingCount} invoices`,
		);
	}
	if (awaitingQuotesCount > 0 && firstAwaitingQuote) {
		const titleish =
			firstAwaitingQuote.title ?? firstAwaitingQuote.quoteNumber ?? "Quote";
		lines.push(
			awaitingQuotesCount === 1
				? `${titleish} (${formatMoney(firstAwaitingQuote.total)}) sent ${formatDate(firstAwaitingQuote.sentAt)}`
				: `${awaitingQuotesCount} quotes awaiting your decision`,
		);
	}

	const headline = (() => {
		const parts: string[] = [];
		if (outstandingCount > 0) {
			parts.push(
				outstandingCount === 1
					? "1 invoice due"
					: `${outstandingCount} invoices due`,
			);
		}
		if (awaitingQuotesCount > 0) {
			parts.push(
				awaitingQuotesCount === 1
					? "1 quote awaiting your decision"
					: `${awaitingQuotesCount} quotes awaiting your decision`,
			);
		}
		return `You have ${parts.join(" and ")}.`;
	})();

	return (
		<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 dark:bg-amber-600">
					<CircleAlert
						className="h-[22px] w-[22px] text-white"
						aria-hidden="true"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[15px] font-semibold leading-snug text-amber-900 dark:text-amber-100">
						{headline}
					</div>
					{lines.length > 0 && (
						<div className="mt-1 text-[13px] text-amber-800 dark:text-amber-300">
							{lines.join(" · ")}
						</div>
					)}
				</div>
				<div className="flex flex-wrap gap-2 sm:flex-nowrap">
					{awaitingQuotesCount > 0 && (
						<Link
							href={quoteHref}
							className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-xs hover:bg-muted"
						>
							{awaitingQuotesCount === 1 ? "Review quote" : "Review quotes"}
						</Link>
					)}
					{outstandingCount > 0 && (
						<Link
							href={invoiceHref}
							className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
						>
							Pay {formatMoney(outstandingTotal)}
							<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
						</Link>
					)}
				</div>
			</div>
		</div>
	);
}

type ActivityKind = "quote" | "invoice";

type ActivityRow = {
	key: string;
	kind: ActivityKind;
	ts: number;
	title: string;
	meta: string;
	time: string;
	icon: typeof FileText;
	tintBg: string;
	tintFg: string;
	pillLabel?: string;
	pillClass?: string;
};

function buildActivityFeed(
	quotes: Quote[],
	invoices: PortalInvoiceListItem[],
): ActivityRow[] {
	const rows: ActivityRow[] = [];

	for (const q of quotes) {
		if (q.sentAt) {
			rows.push({
				key: `quote-sent-${q._id}`,
				kind: "quote",
				ts: q.sentAt,
				title: `${q.quoteNumber ? `Quote ${q.quoteNumber}` : "Quote"} sent`,
				meta: `${q.title ?? "Quote"} · ${formatMoney(q.total)}`,
				time: formatShortDate(q.sentAt),
				icon: FileText,
				tintBg: "bg-sky-50 dark:bg-sky-950/40",
				tintFg: "text-sky-700 dark:text-sky-300",
				pillLabel:
					q.status === "sent"
						? "New"
						: q.status === "approved"
							? "Accepted"
							: q.status === "declined"
								? "Declined"
								: undefined,
				pillClass:
					q.status === "approved"
						? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
						: q.status === "declined"
							? "bg-muted text-muted-foreground border-border"
							: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
			});
		}
		if (q.status === "approved" && q.approvedAt) {
			rows.push({
				key: `quote-accepted-${q._id}`,
				kind: "quote",
				ts: q.approvedAt,
				title: `${q.quoteNumber ? `Quote ${q.quoteNumber}` : "Quote"} accepted`,
				meta: q.title ?? "Quote accepted",
				time: formatShortDate(q.approvedAt),
				icon: CircleCheck,
				tintBg: "bg-emerald-50 dark:bg-emerald-950/40",
				tintFg: "text-emerald-700 dark:text-emerald-300",
				pillLabel: "Accepted",
				pillClass:
					"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
			});
		}
	}

	// Single row per invoice — the pill conveys current status (Paid /
	// Overdue / Partial / Awaiting). A separate paid-row would need a real
	// paidAt timestamp; the list item only exposes dueDate, which would sort
	// incorrectly if the client paid early or late.
	for (const inv of invoices) {
		rows.push({
			key: `invoice-issued-${inv._id}`,
			kind: "invoice",
			ts: inv.issuedDate,
			title: `Invoice ${inv.invoiceNumber} sent`,
			meta: `${formatMoney(inv.total)}`,
			time: formatShortDate(inv.issuedDate),
			icon: Receipt,
			tintBg: "bg-amber-50 dark:bg-amber-950/40",
			tintFg: "text-amber-700 dark:text-amber-300",
			pillLabel:
				inv.paymentSummary.displayStatus === "paid"
					? "Paid"
					: inv.paymentSummary.displayStatus === "overdue"
						? "Overdue"
						: inv.paymentSummary.displayStatus === "partial"
							? "Partial"
							: "Awaiting payment",
			pillClass:
				inv.paymentSummary.displayStatus === "paid"
					? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
					: inv.paymentSummary.displayStatus === "overdue"
						? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
						: inv.paymentSummary.displayStatus === "partial"
							? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900"
							: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
		});
	}

	return rows.sort((a, b) => b.ts - a.ts);
}

function formatShortDate(ts: number): string {
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}
