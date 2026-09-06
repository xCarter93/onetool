"use client";

/**
 * QuotePaper — pure presentational left-column quote rendering. Header /
 * eyebrow / title, line-item table, totals block, terms block.
 */

import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	formatRecurringPaymentRule,
	formatRecurringSchedule,
} from "@onetool/backend/pdf/recurringAgreementFormat";

import { formatMoney } from "@/lib/portal/format";
import { TotalsBreakdown } from "@/components/portal/totals-breakdown";

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
		| "discountEnabled"
		| "discountAmount"
		| "discountType"
		| "recurringAgreementTerms"
		| "recurringInheritedAt"
		| "recurringQuoteOverride"
	>;
	lineItems: QuotePaperLineItem[];
	businessName: string;
}

export function QuotePaper({ quote, lineItems, businessName }: QuotePaperProps) {
	const subtotal = quote.subtotal ?? 0;
	const tax = quote.taxAmount ?? 0;
	const total = quote.total ?? 0;
	// Discount applies before tax: total = (subtotal - discount) + tax, so the
	// display discount is derived from the resolved totals — never re-derived
	// from discountType math (backend never emits discount dollars directly).
	const discountDollars = subtotal + tax - total;
	const discountLabel =
		quote.discountEnabled && quote.discountType === "percentage"
			? `Discount (${quote.discountAmount}%)`
			: "Discount";

	return (
		<div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xs md:p-9">
			<div className="flex items-start justify-between gap-6">
				<div>
					<p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Quote {quote.quoteNumber ?? ""}
					</p>
					<h1 className="mt-1.5 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">
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
							<th className="text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5">
								Item
							</th>
							<th className="text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[60px]">
								Qty
							</th>
							<th className="text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[110px]">
								Rate
							</th>
							<th className="text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[110px]">
								Total
							</th>
						</tr>
					</thead>
					<tbody>
						{lineItems.map((li, i) => (
							<tr key={i} className="border-b border-border last:border-b-0">
								<td className="py-4 align-top">
									<div className="text-[15px] font-semibold">
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

			<TotalsBreakdown
				className="mt-6"
				subtotal={subtotal}
				discount={discountDollars}
				discountLabel={discountLabel}
				tax={tax}
				taxLabel="Estimated tax"
				total={total}
			/>

			{quote.recurringAgreementTerms ? (
				<section className="mt-10 border-t border-border pt-6">
					<h2 className="text-base font-semibold text-foreground">
						Recurring agreement
					</h2>
					{quote.recurringInheritedAt && !quote.recurringQuoteOverride ? (
						<p className="mt-1 text-sm font-medium text-foreground">
							Approved under recurring agreement {quote.recurringAgreementTerms.agreementReference}
						</p>
					) : null}
					<dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
						<dt className="text-muted-foreground">Agreement</dt>
						<dd className="font-medium text-foreground">
							{quote.recurringAgreementTerms.agreementReference}, revision {quote.recurringAgreementTerms.revisionNumber}
						</dd>
						{quote.recurringAgreementTerms.property ? (
							<>
								<dt className="text-muted-foreground">Service property</dt>
								<dd className="whitespace-pre-wrap text-foreground">
									{[quote.recurringAgreementTerms.property.name, quote.recurringAgreementTerms.property.address].filter(Boolean).join("\n")}
								</dd>
							</>
						) : null}
						<dt className="text-muted-foreground">Service scope</dt>
						<dd className="whitespace-pre-wrap text-foreground">
							{[quote.recurringAgreementTerms.scope.title, quote.recurringAgreementTerms.scope.description].filter(Boolean).join("\n")}
						</dd>
						<dt className="text-muted-foreground">Schedule</dt>
						<dd className="text-foreground">
							{formatRecurringSchedule(quote.recurringAgreementTerms.schedule.rule)}. Starts {quote.recurringAgreementTerms.schedule.anchorDateKey}. Timezone: {quote.recurringAgreementTerms.schedule.timezone}.
						</dd>
						<dt className="text-muted-foreground">Billing</dt>
						<dd className="text-foreground">
							{quote.recurringAgreementTerms.billingMode === "monthly" ? "Monthly consolidated billing" : "Billed per completed visit"}
						</dd>
						{quote.recurringAgreementTerms.paymentChangeActivation === "next_full_month_after_all_approvals" ? (
							<>
								<dt className="text-muted-foreground">Payment change</dt>
								<dd className="text-foreground">This payment arrangement starts with the next full calendar month after all affected recurring agreements are approved. Existing terms apply until then.</dd>
							</>
						) : null}
						<dt className="text-muted-foreground">Payment</dt>
						<dd className="text-foreground">
							{formatRecurringPaymentRule(quote.recurringAgreementTerms.paymentRule)}
						</dd>
					</dl>
				</section>
			) : null}

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
