"use client";

import React from "react";
import { CreditCard, Sparkles, RotateCcw, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type FeeRow = {
	icon: typeof CreditCard;
	name: string;
	desc: string;
	setBy: "Stripe" | "OneTool";
};

const FEE_ROWS: FeeRow[] = [
	{
		icon: CreditCard,
		name: "Card processing",
		desc: "2.9% + $0.30 per charge",
		setBy: "Stripe",
	},
	{
		icon: Sparkles,
		name: "OneTool platform fee",
		desc: "$1.00 per charge (configurable)",
		setBy: "OneTool",
	},
	{
		icon: RotateCcw,
		name: "Refund processing",
		desc: "Card processing fee is NOT returned",
		setBy: "Stripe",
	},
	{
		icon: AlertTriangle,
		name: "Chargeback",
		desc: "$15 fee + disputed amount",
		setBy: "Stripe",
	},
];

function SetByTag({ setBy }: { setBy: FeeRow["setBy"] }) {
	const isPlatform = setBy === "OneTool";
	return (
		<span
			className={cn(
				"shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
				isPlatform
					? "border-primary/30 bg-primary/10 text-primary"
					: "border-border bg-muted text-muted-foreground",
			)}
		>
			{setBy}
		</span>
	);
}

export function FeeDisclosureTable() {
	return (
		<section className="space-y-4" aria-label="Stripe Connect fee disclosure">
			<div className="divide-y divide-border/60">
				{FEE_ROWS.map((row) => (
					<div
						key={row.name}
						className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0"
					>
						<span className="grid size-9 shrink-0 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
							<row.icon className="size-4" aria-hidden="true" />
						</span>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold text-foreground">
								{row.name}
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">{row.desc}</p>
						</div>
						<SetByTag setBy={row.setBy} />
					</div>
				))}
			</div>

			<div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3">
				<Info
					className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
					aria-hidden="true"
				/>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Your connected account is liable for processing fees and
					chargebacks. Every charge above is paid by{" "}
					<strong className="font-semibold text-foreground">
						your business
					</strong>
					; OneTool collects the platform fee as platform revenue.
				</p>
			</div>
		</section>
	);
}
