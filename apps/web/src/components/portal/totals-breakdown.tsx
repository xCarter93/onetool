"use client";

/**
 * TotalsBreakdown — shared portal totals stack for quote/invoice papers.
 * Renders Subtotal → Discount → Tax → Total so the portal always shows
 * every contribution to the total. Discount/tax rows hide when zero.
 */

import { formatMoney } from "@/lib/portal/format";
import { cn } from "@/lib/utils";

export interface TotalsBreakdownProps {
	subtotal: number;
	/** Display discount in dollars (already resolved from percent/fixed). */
	discount?: number | null;
	/** e.g. "Discount (10%)" — defaults to "Discount". */
	discountLabel?: string;
	tax?: number | null;
	taxLabel?: string;
	total: number;
	totalLabel?: string;
	className?: string;
}

export function TotalsBreakdown({
	subtotal,
	discount,
	discountLabel = "Discount",
	tax,
	taxLabel = "Tax",
	total,
	totalLabel = "Total",
	className,
}: TotalsBreakdownProps) {
	// Guard against float dust so a rounding remainder never renders a row.
	const discountValue = discount != null && discount > 0.005 ? discount : 0;
	const taxValue = tax != null && tax > 0.005 ? tax : 0;

	return (
		<dl
			className={cn(
				"border-t-2 border-foreground pt-4 flex flex-col items-end gap-1.5",
				className
			)}
		>
			<div className="flex items-center gap-8 text-[15px]">
				<dt className="text-muted-foreground">Subtotal</dt>
				<dd className="tabular-nums">{formatMoney(subtotal)}</dd>
			</div>
			{discountValue > 0 && (
				<div className="flex items-center gap-8 text-[15px]">
					<dt className="text-muted-foreground">{discountLabel}</dt>
					<dd className="tabular-nums text-emerald-600 dark:text-emerald-400">
						-{formatMoney(discountValue)}
					</dd>
				</div>
			)}
			{taxValue > 0 && (
				<div className="flex items-center gap-8 text-[15px]">
					<dt className="text-muted-foreground">{taxLabel}</dt>
					<dd className="tabular-nums">{formatMoney(taxValue)}</dd>
				</div>
			)}
			<div
				data-paper-total
				className="flex items-center gap-8 text-[17px] font-semibold border-t border-foreground pt-2 mt-1"
			>
				<dt>{totalLabel}</dt>
				<dd className="tabular-nums">{formatMoney(total)}</dd>
			</div>
		</dl>
	);
}
