"use client";

import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LineItemsDisplayTotals } from "./types";

export interface LineItemsTotalsProps extends LineItemsDisplayTotals {
	/** Show the internal cost/margin rollup line (never on the client PDF). */
	showCostMargin?: boolean;
	/** Sum of quantity × cost across the lines. */
	totalCost?: number;
	className?: string;
}

export function LineItemsTotals({
	subtotal,
	discountAmount,
	taxAmount,
	total,
	showCostMargin = false,
	totalCost = 0,
	className,
}: LineItemsTotalsProps) {
	const margin = subtotal - totalCost;
	const marginPct = subtotal > 0 ? (margin / subtotal) * 100 : 0;

	return (
		<div className={cn("mt-6 flex justify-end", className)}>
			<div className="flex w-[340px] max-w-full flex-col gap-2">
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Subtotal</span>
					<span className="font-medium tabular-nums">
						{formatCurrency(subtotal)}
					</span>
				</div>
				{discountAmount > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Discount</span>
						<span className="font-medium text-destructive tabular-nums">
							-{formatCurrency(discountAmount)}
						</span>
					</div>
				)}
				{taxAmount > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Tax</span>
						<span className="font-medium tabular-nums">
							{formatCurrency(taxAmount)}
						</span>
					</div>
				)}
				<div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
					<span>Total</span>
					<span className="tabular-nums">{formatCurrency(total)}</span>
				</div>
				{showCostMargin && (
					<div className="flex justify-between pt-0.5 text-xs text-muted-foreground">
						<span>Internal · cost {formatCurrency(totalCost)}</span>
						<span
							className={cn(
								"font-semibold tabular-nums",
								marginPct >= 40
									? "text-success"
									: marginPct >= 20
										? "text-warning"
										: "text-destructive"
							)}
						>
							{formatCurrency(margin)} ({marginPct.toFixed(0)}%) margin
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
