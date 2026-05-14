"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";

import { formatDate, formatMoney } from "@/lib/portal/format";

// Mirror of PortalInvoiceListItemPublic in portal/invoices.ts. Kept locally
// because the backend module export only flows through Convex codegen at the
// validator level; this gives the component a typed surface without importing
// from server-only code.
export interface PortalInvoiceListItem {
	_id: string;
	invoiceNumber: string;
	status: "sent" | "paid" | "overdue";
	issuedDate: number;
	dueDate: number;
	total: number;
	clientName: string;
	paymentSummary: {
		totalPaid: number;
		totalRemaining: number;
		displayStatus: "awaiting" | "partial" | "paid" | "overdue";
		isLegacy: boolean;
		installmentCount: number;
	};
}

type Filter = "all" | "outstanding" | "paid";

const FILTERS: Array<{ value: Filter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "outstanding", label: "Outstanding" },
	{ value: "paid", label: "Paid" },
];

function pillClassFor(
	status: PortalInvoiceListItem["paymentSummary"]["displayStatus"],
): string {
	switch (status) {
		case "paid":
			return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
		case "overdue":
			return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900";
		case "partial":
			return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900";
		case "awaiting":
		default:
			return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
	}
}

function pillLabelFor(
	status: PortalInvoiceListItem["paymentSummary"]["displayStatus"],
): string {
	switch (status) {
		case "paid":
			return "Paid";
		case "overdue":
			return "Overdue";
		case "partial":
			return "Partially paid";
		case "awaiting":
		default:
			return "Awaiting payment";
	}
}

export interface InvoiceListProps {
	invoices: PortalInvoiceListItem[];
	clientPortalId: string;
	businessName: string;
}

export function InvoiceList({
	invoices,
	clientPortalId,
	businessName,
}: InvoiceListProps) {
	const [search, setSearch] = useState("");
	const [filterStatus, setFilterStatus] = useState<Filter>("all");

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return invoices.filter((row) => {
			if (filterStatus === "outstanding") {
				if (row.paymentSummary.displayStatus === "paid") return false;
			} else if (filterStatus === "paid") {
				if (row.paymentSummary.displayStatus !== "paid") return false;
			}
			if (!q) return true;
			const haystack = [row.invoiceNumber, row.clientName]
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [invoices, search, filterStatus]);

	const isEmpty = invoices.length === 0;
	const isFilterEmpty = !isEmpty && filtered.length === 0;

	return (
		<div>
			<header className="flex flex-col gap-1">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
					{businessName}
				</p>
				<h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">
					Invoices
				</h1>
				<p className="text-sm text-muted-foreground">
					All your invoices — paid and outstanding.
				</p>
			</header>

			<div className="mt-6 md:rounded-2xl md:border md:border-border md:bg-card md:overflow-hidden md:shadow-xs">
				<div className="hidden md:flex flex-wrap items-center gap-2 border-b border-border p-3">
					<div className="relative flex-1 max-w-[280px]">
						<Search
							className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
							aria-hidden="true"
						/>
						<input
							type="search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search invoices…"
							aria-label="Search invoices"
							className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-[13px] transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
						/>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{FILTERS.map((f) => {
							const active = filterStatus === f.value;
							return (
								<button
									key={f.value}
									type="button"
									onClick={() => setFilterStatus(f.value)}
									aria-pressed={active}
									className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
										active
											? "bg-primary text-primary-foreground border-primary"
											: "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
									}`}
								>
									{f.label}
								</button>
							);
						})}
					</div>
				</div>

				{/* Mobile filter row */}
				<div className="md:hidden flex flex-wrap items-center gap-2 mb-3">
					<div className="relative flex-1 min-w-[160px]">
						<Search
							className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
							aria-hidden="true"
						/>
						<input
							type="search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search invoices…"
							aria-label="Search invoices"
							className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
						/>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{FILTERS.map((f) => {
							const active = filterStatus === f.value;
							return (
								<button
									key={f.value}
									type="button"
									onClick={() => setFilterStatus(f.value)}
									aria-pressed={active}
									className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
										active
											? "bg-primary text-primary-foreground border-primary"
											: "bg-background text-muted-foreground border-border"
									}`}
								>
									{f.label}
								</button>
							);
						})}
					</div>
				</div>

				{isEmpty ? (
					<div className="px-6 py-20 text-center">
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
							No invoices yet
						</p>
						<h2 className="mt-3 text-[18px] font-semibold text-foreground">
							No invoices yet
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							When {businessName} sends you an invoice, you&rsquo;ll see it
							here.
						</p>
					</div>
				) : isFilterEmpty ? (
					<div className="px-6 py-20 text-center">
						<h2 className="text-[18px] font-semibold text-foreground">
							Nothing here right now
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							Try a different filter, or clear the search.
						</p>
					</div>
				) : (
					<>
						{/* Desktop table (>=768px) */}
						<table className="hidden md:table w-full">
							<thead>
								<tr className="bg-muted/40">
									<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4 border-b border-border">
										Invoice
									</th>
									<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4 border-b border-border">
										Issued
									</th>
									<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4 border-b border-border">
										For
									</th>
									<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4 border-b border-border">
										Due
									</th>
									<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4 border-b border-border">
										Status
									</th>
									<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4 border-b border-border">
										Total
									</th>
									<th className="py-3 px-4 w-[130px] border-b border-border" />
								</tr>
							</thead>
							<tbody>
								{filtered.map((inv, i) => {
									const href = `/portal/c/${clientPortalId}/invoices/${inv._id}`;
									const isLegacy = inv.paymentSummary.isLegacy;
									const displayStatus = inv.paymentSummary.displayStatus;
									const showPayNow = !isLegacy && displayStatus !== "paid";
									const isLast = i === filtered.length - 1;
									return (
										<tr
											key={inv._id}
											className={`hover:bg-muted/50 transition-colors ${
												isLast ? "" : "border-b border-border"
											}`}
										>
											<td className="py-3.5 px-4">
												<Link
													href={href}
													className="font-semibold text-primary tabular-nums hover:underline"
												>
													#{inv.invoiceNumber}
												</Link>
											</td>
											<td className="py-3.5 px-4 text-[14px] text-foreground">
												{formatDate(inv.issuedDate)}
											</td>
											<td className="py-3.5 px-4 text-[14px] font-medium text-foreground">
												{inv.clientName}
											</td>
											<td className="py-3.5 px-4 text-[14px] text-muted-foreground">
												{formatDate(inv.dueDate)}
											</td>
											<td className="py-3.5 px-4">
												<span
													className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${pillClassFor(
														displayStatus,
													)}`}
												>
													<span className="h-1.5 w-1.5 rounded-full bg-current" />
													{pillLabelFor(displayStatus)}
												</span>
											</td>
											<td className="py-3.5 px-4 text-right font-semibold tabular-nums">
												{formatMoney(inv.total)}
											</td>
											<td className="py-3.5 px-4 text-right">
												<div className="inline-flex items-center gap-1.5">
													{showPayNow ? (
														<Link
															href={href}
															className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
														>
															Pay now
														</Link>
													) : (
														<Link
															href={href}
															className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
														>
															<Download
																className="h-3.5 w-3.5"
																aria-hidden="true"
															/>
															PDF
														</Link>
													)}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>

					{/* Mobile card stack (<768px) */}
					<ul className="md:hidden flex flex-col gap-3 mt-2">
						{filtered.map((inv) => {
							const href = `/portal/c/${clientPortalId}/invoices/${inv._id}`;
							const isLegacy = inv.paymentSummary.isLegacy;
							const displayStatus = inv.paymentSummary.displayStatus;
							const showPayNow =
								!isLegacy && displayStatus !== "paid";
							return (
								<li
									key={inv._id}
									className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-border bg-card p-4"
								>
									<Link
										href={href}
										className="flex flex-col gap-1 min-w-0"
									>
										<span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
											{formatDate(inv.issuedDate)}
										</span>
										<span className="text-[15px] font-semibold text-primary">
											{inv.invoiceNumber}
										</span>
										<span className="text-[13px] text-muted-foreground truncate">
											{inv.clientName}
										</span>
										<div className="mt-1 flex items-center gap-2">
											<span
												className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${pillClassFor(
													displayStatus,
												)}`}
											>
												<span className="h-1.5 w-1.5 rounded-full bg-current" />
												{pillLabelFor(displayStatus)}
											</span>
											<span className="text-[13px] font-semibold tabular-nums">
												{formatMoney(inv.total)}
											</span>
										</div>
									</Link>
									<div className="flex items-end justify-end">
										{showPayNow ? (
											<Link
												href={href}
												className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground"
												aria-label={`Pay invoice ${inv.invoiceNumber}`}
											>
												<Download
													className="h-3.5 w-3.5 -rotate-90"
													aria-hidden="true"
												/>
											</Link>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				</>
			)}
			</div>
		</div>
	);
}
