"use client";

/**
 * QuoteList — portal-facing quote index. Search + filter chips + table.
 * Renders the four UI-SPEC filter chips: All / Awaiting decision / Accepted /
 * Declined / Expired. Row click navigates to the detail page; action button
 * uses stopPropagation so it does not double-fire navigation.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowRight, Search } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";

type Filter = "all" | "sent" | "approved" | "declined" | "expired";

const FILTERS: Array<{ value: Filter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "sent", label: "Awaiting decision" },
	{ value: "approved", label: "Accepted" },
	{ value: "declined", label: "Declined" },
	{ value: "expired", label: "Expired" },
];

function formatMoney(cents: number): string {
	const dollars = cents / 100;
	return dollars.toLocaleString("en-US", {
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

function pillClassFor(status: string): string {
	switch (status) {
		case "approved":
			return "bg-emerald-50 text-emerald-700 border-emerald-200";
		case "declined":
			return "bg-muted text-muted-foreground border-border";
		case "expired":
			return "bg-muted/70 text-muted-foreground border-border opacity-90";
		case "sent":
		default:
			return "bg-sky-50 text-sky-700 border-sky-200";
	}
}

function pillLabelFor(status: string): string {
	switch (status) {
		case "approved":
			return "Accepted";
		case "declined":
			return "Declined";
		case "expired":
			return "Expired";
		case "sent":
		default:
			return "Awaiting decision";
	}
}

export interface QuoteListProps {
	businessName: string;
}

export function QuoteList({ businessName }: QuoteListProps) {
	const params = useParams<{ clientPortalId: string }>();
	const router = useRouter();
	const clientPortalId = params?.clientPortalId ?? "";

	const quotes = useQuery(api.portal.quotes.list, {});

	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<Filter>("all");

	const filtered = useMemo(() => {
		if (!quotes) return [];
		const q = search.trim().toLowerCase();
		return quotes.filter((row) => {
			if (filter !== "all" && row.status !== filter) return false;
			if (!q) return true;
			const haystack = [
				row.title ?? "",
				row.quoteNumber ?? "",
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [quotes, search, filter]);

	const isLoading = quotes === undefined;
	const isEmpty = !isLoading && (quotes?.length ?? 0) === 0;
	const isFilterEmpty = !isLoading && !isEmpty && filtered.length === 0;

	return (
		<div className="max-w-5xl">
			<header className="flex flex-col gap-1">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
					{businessName}
				</p>
				<h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">
					Quotes
				</h1>
				<p className="text-sm text-muted-foreground">
					Estimates from {businessName} — review, accept, or decline.
				</p>
			</header>

			<div className="mt-6 rounded-xl border border-border bg-card overflow-hidden">
				<div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
					<div className="relative flex-1 max-w-[280px]">
						<Search
							className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
							aria-hidden="true"
						/>
						<input
							type="search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search quotes…"
							aria-label="Search quotes"
							className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						{FILTERS.map((f) => {
							const active = filter === f.value;
							return (
								<button
									key={f.value}
									type="button"
									onClick={() => setFilter(f.value)}
									aria-pressed={active}
									className={`rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors ${
										active
											? "bg-primary text-primary-foreground border-primary"
											: "bg-card text-muted-foreground border-border hover:bg-muted"
									}`}
								>
									{f.label}
								</button>
							);
						})}
					</div>
				</div>

				{isLoading ? (
					<div className="divide-y divide-border">
						{Array.from({ length: 4 }).map((_, i) => (
							<div
								key={i}
								className="flex items-center gap-4 p-4 animate-pulse"
							>
								<div className="h-4 w-16 bg-muted rounded" />
								<div className="h-4 w-24 bg-muted rounded" />
								<div className="h-4 flex-1 bg-muted rounded" />
								<div className="h-5 w-28 bg-muted rounded-full" />
								<div className="h-4 w-20 bg-muted rounded" />
								<div className="h-8 w-24 bg-muted rounded-md" />
							</div>
						))}
					</div>
				) : isEmpty ? (
					<div className="px-6 py-16 text-center">
						<h2 className="text-[17px] font-semibold text-foreground">
							No quotes yet
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							When {businessName} sends you a quote, it will show up here.
						</p>
					</div>
				) : isFilterEmpty ? (
					<div className="px-6 py-16 text-center">
						<h2 className="text-[17px] font-semibold text-foreground">
							Nothing here right now
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							Try a different filter, or clear the search.
						</p>
					</div>
				) : (
					<table className="w-full">
						<thead>
							<tr className="border-b border-border">
								<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4">
									Quote
								</th>
								<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4">
									Sent
								</th>
								<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4">
									For
								</th>
								<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4">
									Status
								</th>
								<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-3 px-4">
									Total
								</th>
								<th className="py-3 px-4 w-[140px]" />
							</tr>
						</thead>
						<tbody>
							{filtered.map((q) => {
								const href = `/portal/c/${clientPortalId}/quotes/${q._id}`;
								const isPending = q.status === "sent";
								const expiryLine = (() => {
									if (q.status === "sent" && q.validUntil)
										return `Expires ${formatDate(q.validUntil)}`;
									if (q.status === "approved")
										return `Approved ${formatDate(q.sentAt)}`;
									if (q.status === "declined")
										return `Declined ${formatDate(q.sentAt)}`;
									if (q.status === "expired")
										return `Expired ${formatDate(q.validUntil)}`;
									return "";
								})();
								return (
									<tr
										key={q._id}
										onClick={() => router.push(href)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												router.push(href);
											}
										}}
										role="button"
										tabIndex={0}
										className="border-b border-border last:border-b-0 hover:bg-muted/60 cursor-pointer transition-colors"
									>
										<td className="py-4 px-4 font-semibold text-primary">
											{q.quoteNumber ?? "—"}
										</td>
										<td className="py-4 px-4 text-[14px]">
											{formatDate(q.sentAt)}
										</td>
										<td className="py-4 px-4 text-[14px]">
											<div className="font-medium">{q.title ?? "Quote"}</div>
										</td>
										<td className="py-4 px-4">
											<span
												className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${pillClassFor(q.status)}`}
											>
												<span className="h-1.5 w-1.5 rounded-full bg-current" />
												{pillLabelFor(q.status)}
											</span>
											{expiryLine && (
												<div className="text-[11px] text-muted-foreground mt-1">
													{expiryLine}
												</div>
											)}
										</td>
										<td className="py-4 px-4 text-right font-semibold tabular-nums">
											{formatMoney(q.total)}
										</td>
										<td className="py-4 px-4 text-right">
											<Link
												href={href}
												onClick={(e) => e.stopPropagation()}
												onKeyDown={(e) => e.stopPropagation()}
												className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
													isPending
														? "bg-primary text-primary-foreground hover:bg-primary/90"
														: "text-muted-foreground hover:bg-muted"
												}`}
											>
												{isPending ? "Review quote" : "View quote"}
												{isPending && (
													<ArrowRight
														className="h-3.5 w-3.5"
														aria-hidden="true"
													/>
												)}
											</Link>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
