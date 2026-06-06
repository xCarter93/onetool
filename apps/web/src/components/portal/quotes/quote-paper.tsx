"use client";

/**
 * QuotePaper — pure presentational left-column quote rendering. Header /
 * eyebrow / title, line-item table, totals block, terms block.
 */

import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

export interface QuotePaperLineItem {
	description: string;
	quantity: number;
	unit?: string;
	rate: number;
	amount: number;
	sortOrder: number;
}

export interface QuotePaperProps {
	quote: Pick<
		Doc<"quotes">,
		| "quoteNumber"
		| "title"
		| "subtotal"
		| "taxAmount"
		| "total"
		| "terms"
	>;
	lineItems: QuotePaperLineItem[];
	businessName: string;
}

function formatMoney(amount: number): string {
	return amount.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

export function QuotePaper({ quote, lineItems, businessName }: QuotePaperProps) {
	const subtotal = quote.subtotal ?? 0;
	const tax = quote.taxAmount ?? 0;
	const total = quote.total ?? 0;

	return (
		<div className="mx-auto max-w-[760px] rounded-2xl border border-border bg-card p-6 shadow-xs md:p-9">
			<div className="flex items-start justify-between gap-6">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Quote {quote.quoteNumber ?? ""}
					</p>
					<h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
						{quote.title ?? "Quote"}
					</h1>
				</div>
				<div className="text-right">
					<div className="font-semibold">{businessName}</div>
				</div>
			</div>

			<div className="mt-6">
				<table className="w-full border-collapse">
					<thead>
						<tr className="border-b-2 border-foreground">
							<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5">
								Item
							</th>
							<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[60px]">
								Qty
							</th>
							<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[110px]">
								Rate
							</th>
							<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[110px]">
								Total
							</th>
						</tr>
					</thead>
					<tbody>
						{lineItems.map((li, i) => (
							<tr key={i} className="border-b border-border last:border-b-0">
								<td className="py-4 align-top">
									<div className="text-[14px] font-semibold">
										{li.description}
									</div>
								</td>
								<td className="py-4 align-top text-right text-[14px] tabular-nums">
									{li.quantity}
								</td>
								<td className="py-4 align-top text-right text-[14px] tabular-nums">
									{formatMoney(li.rate)}
								</td>
								<td className="py-4 align-top text-right text-[14px] font-semibold tabular-nums">
									{formatMoney(li.amount)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="mt-6 border-t-2 border-foreground pt-4 flex flex-col items-end gap-1.5">
				<div className="flex items-center gap-8 text-[14px]">
					<span className="text-muted-foreground">Subtotal</span>
					<span className="tabular-nums">{formatMoney(subtotal)}</span>
				</div>
				{tax > 0 && (
					<div className="flex items-center gap-8 text-[14px]">
						<span className="text-muted-foreground">Estimated tax</span>
						<span className="tabular-nums">{formatMoney(tax)}</span>
					</div>
				)}
				<div className="flex items-center gap-8 text-[16px] font-semibold border-t border-foreground pt-2 mt-1">
					<span>Total</span>
					<span className="tabular-nums">{formatMoney(total)}</span>
				</div>
			</div>

			{quote.terms ? (
				<div className="mt-10 pt-6 border-t border-dashed border-border">
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Terms
					</p>
					<p className="mt-2 text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
						{quote.terms}
					</p>
				</div>
			) : null}
		</div>
	);
}
