"use client";

import React from "react";

type FeeRow = {
	fee: string;
	amount: string;
	whoPays: string;
	setBy: string;
};

const FEE_ROWS: FeeRow[] = [
	{
		fee: "Card processing",
		amount: "2.9% + $0.30 per charge",
		whoPays: "Your business",
		setBy: "Stripe",
	},
	{
		fee: "OneTool platform fee",
		amount: "$1.00 per charge (configurable)",
		whoPays: "Your business",
		setBy: "OneTool",
	},
	{
		fee: "Refund processing",
		amount: "Card processing fee is NOT returned",
		whoPays: "Your business",
		setBy: "Stripe",
	},
	{
		fee: "Chargeback",
		amount: "$15 fee + disputed amount",
		whoPays: "Your business",
		setBy: "Stripe",
	},
];

export function FeeDisclosureTable() {
	return (
		<section className="space-y-2">
			<h3 className="text-lg font-semibold text-foreground">
				Fees and responsibilities
			</h3>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<caption className="sr-only">Stripe Connect fee disclosure</caption>
					<thead>
						<tr>
							<th
								scope="col"
								className="text-left font-medium text-muted-foreground py-2 pr-4"
							>
								Fee
							</th>
							<th
								scope="col"
								className="text-left font-medium text-muted-foreground py-2 pr-4"
							>
								Amount
							</th>
							<th
								scope="col"
								className="text-left font-medium text-muted-foreground py-2 pr-4"
							>
								Who pays
							</th>
							<th
								scope="col"
								className="text-left font-medium text-muted-foreground py-2"
							>
								Set by
							</th>
						</tr>
					</thead>
					<tbody>
						{FEE_ROWS.map((row) => (
							<tr key={row.fee}>
								<th
									scope="row"
									className="py-2 pr-4 border-t border-border/40 text-left font-medium text-foreground"
								>
									{row.fee}
								</th>
								<td className="py-2 pr-4 border-t border-border/40 text-foreground">
									{row.amount}
								</td>
								<td className="py-2 pr-4 border-t border-border/40 text-foreground">
									{row.whoPays}
								</td>
								<td className="py-2 border-t border-border/40 text-muted-foreground">
									{row.setBy}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="text-xs text-muted-foreground mt-2">
				Your connected account is liable for processing fees and chargebacks.
				OneTool collects the platform fee as platform revenue.
			</p>
		</section>
	);
}
