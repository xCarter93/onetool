"use client";

import React from "react";
import { CreditCard, Sparkles, RotateCcw, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import type { PlatformFee } from "./use-platform-fee";

type FeeRow = {
	icon: typeof CreditCard;
	name: string;
	desc: string;
	setBy: "Stripe" | "OneTool";
};

function platformFeeDescription(fee: PlatformFee): string {
	if (fee.status === "loading") return "Loading the current fee…";
	if (fee.status === "error") return "Couldn't load the current fee. Refresh to try again.";
	if (fee.dollars === 0) return "No OneTool platform fee";
	return `${formatCurrency(fee.dollars)} per charge`;
}

function feeRows(platformFee: PlatformFee): FeeRow[] {
	return [
		{
			icon: CreditCard,
			name: "Card processing",
			desc: "Stripe's standard US card rate is 2.9% + $0.30 per charge. International cards, currency conversion, and negotiated rates change this.",
			setBy: "Stripe",
		},
		{
			icon: Sparkles,
			name: "OneTool platform fee",
			desc: platformFeeDescription(platformFee),
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
			name: "Dispute (chargeback)",
			desc: "Stripe's standard US dispute fee is $15 per dispute, on top of the disputed amount. Countering a dispute carries a separate $15 fee that Stripe refunds if you win.",
			setBy: "Stripe",
		},
	];
}

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

export function FeeDisclosureTable({ platformFee }: { platformFee: PlatformFee }) {
	return (
		<section className="space-y-4" aria-label="Stripe Connect fee disclosure">
			<div className="divide-y divide-border/60">
				{feeRows(platformFee).map((row) => (
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
					Your connected account pays every charge above, and Stripe&apos;s
					figures are its published US pricing, which may differ for your
					account. If a client disputes a payment, you must submit evidence
					in the Disputes section before Stripe&apos;s deadline or the
					dispute is lost by default.
				</p>
			</div>
		</section>
	);
}
