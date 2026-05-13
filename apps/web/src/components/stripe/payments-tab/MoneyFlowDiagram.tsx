"use client";

import React from "react";

interface MoneyFlowDiagramProps {
	samplePayment?: number;
	platformFeeDollars?: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

type Step = {
	label: string;
	// String so non-monetary stages (e.g., "T+2 standard (US)") can share the layout.
	amount: string;
	// Negative deductions render in muted/destructive tone; positive landing values in foreground.
	tone: "neutral" | "deduct" | "land" | "meta";
};

export function MoneyFlowDiagram({
	samplePayment = 100,
	platformFeeDollars = 1,
}: MoneyFlowDiagramProps) {
	const stripeFee = round2(samplePayment * 0.029 + 0.3);
	const afterStripe = round2(samplePayment - stripeFee);
	const afterPlatform = round2(afterStripe - platformFeeDollars);

	const steps: Step[] = [
		{
			label: "Customer pays",
			amount: currencyFormatter.format(samplePayment),
			tone: "neutral",
		},
		{
			label: "Stripe processes card (2.9% + $0.30)",
			amount: `-${currencyFormatter.format(stripeFee)}`,
			tone: "deduct",
		},
		{
			label: "OneTool platform fee",
			amount: `-${currencyFormatter.format(platformFeeDollars)}`,
			tone: "deduct",
		},
		{
			label: "Lands in your Stripe balance",
			amount: currencyFormatter.format(afterPlatform),
			tone: "land",
		},
		{
			label: "Daily payout to your bank",
			amount: "T+2 standard (US)",
			tone: "meta",
		},
	];

	return (
		<section aria-label="How a payment flows from your customer to your bank">
			<ol className="relative space-y-3">
				{steps.map((step, index) => {
					const isLast = index === steps.length - 1;
					return (
						<li
							key={step.label}
							className="relative flex items-start gap-3 pl-8"
						>
							{/* Numbered indicator */}
							<span
								aria-hidden="true"
								className="absolute left-0 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs font-medium text-muted-foreground"
							>
								{index + 1}
							</span>
							{/* Vertical rail to next step */}
							{!isLast && (
								<span
									aria-hidden="true"
									className="absolute left-3 top-7 h-[calc(100%-0.5rem)] w-px bg-border/70"
								/>
							)}
							<div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2">
								<span className="text-sm text-foreground">{step.label}</span>
								<span
									className={[
										"text-sm font-medium tabular-nums",
										step.tone === "deduct" && "text-muted-foreground",
										step.tone === "land" && "text-foreground",
										step.tone === "neutral" && "text-foreground",
										step.tone === "meta" && "text-xs text-muted-foreground font-normal",
									]
										.filter(Boolean)
										.join(" ")}
								>
									{step.amount}
								</span>
							</div>
						</li>
					);
				})}
			</ol>
			<p className="mt-3 text-xs text-muted-foreground max-w-2xl">
				Example based on a {currencyFormatter.format(samplePayment)} invoice with
				default {currencyFormatter.format(platformFeeDollars)} platform fee.
				Actual Stripe fees vary by card type and region — see Stripe pricing for
				current rates.
			</p>
		</section>
	);
}
