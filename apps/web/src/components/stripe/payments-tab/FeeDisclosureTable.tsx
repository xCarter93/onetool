"use client";

import React from "react";
import { Receipt, Info } from "lucide-react";

type FeeRow = {
	fee: string;
	amount: string;
	setBy: "Stripe" | "OneTool";
};

const FEE_ROWS: FeeRow[] = [
	{ fee: "Card processing", amount: "2.9% + $0.30 per charge", setBy: "Stripe" },
	{
		fee: "OneTool platform fee",
		amount: "$1.00 per charge (configurable)",
		setBy: "OneTool",
	},
	{
		fee: "Refund processing",
		amount: "Card processing fee is NOT returned",
		setBy: "Stripe",
	},
	{ fee: "Chargeback", amount: "$15 fee + disputed amount", setBy: "Stripe" },
];

function SetByBadge({ setBy }: { setBy: FeeRow["setBy"] }) {
	const isPlatform = setBy === "OneTool";
	return (
		<span
			className={[
				"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
				isPlatform
					? "border-primary/30 bg-primary/10 text-primary"
					: "border-border bg-muted text-muted-foreground",
			].join(" ")}
		>
			{setBy}
		</span>
	);
}

export function FeeDisclosureTable() {
	return (
		<section className="space-y-3" aria-label="Stripe Connect fee disclosure">
			<div className="flex items-center gap-2.5">
				<span className="grid h-8 w-8 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
					<Receipt className="h-4 w-4" aria-hidden="true" />
				</span>
				<div>
					<h3 className="text-lg font-semibold text-foreground">
						Fees and responsibilities
					</h3>
					<p className="text-[12.5px] text-muted-foreground">
						Who is charged, how much, and who sets it.
					</p>
				</div>
			</div>

			<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<caption className="sr-only">Stripe Connect fee disclosure</caption>
				<thead>
					<tr className="border-b border-border/60">
						<th
							scope="col"
							className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							Fee
						</th>
						<th
							scope="col"
							className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							Amount
						</th>
						<th
							scope="col"
							className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							Set by
						</th>
					</tr>
				</thead>
				<tbody>
					{FEE_ROWS.map((row) => (
						<tr key={row.fee} className="border-b border-border/40 last:border-0">
							<th
								scope="row"
								className="py-2.5 pr-4 text-left font-semibold text-foreground"
							>
								{row.fee}
							</th>
							<td className="py-2.5 pr-4 text-muted-foreground">{row.amount}</td>
							<td className="py-2.5">
								<SetByBadge setBy={row.setBy} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
			</div>

			<div className="flex items-start gap-2 rounded-lg border border-border bg-warning/[0.06] px-3 py-2.5">
				<Info
					className="mt-px h-[15px] w-[15px] shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Your connected account is liable for processing fees and chargebacks.
					Every charge above is paid by{" "}
					<strong className="font-semibold text-foreground">your business</strong>
					; OneTool collects the platform fee as platform revenue.
				</p>
			</div>
		</section>
	);
}
