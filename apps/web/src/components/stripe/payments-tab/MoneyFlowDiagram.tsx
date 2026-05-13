"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

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

type StepTone = "primary" | "deduct" | "land" | "meta";

type Step = {
	label: string;
	// String so non-monetary stages (e.g., "T+2 (US)") can share the layout.
	amount: string;
	tone: StepTone;
};

export function MoneyFlowDiagram({
	samplePayment = 100,
	platformFeeDollars = 1,
}: MoneyFlowDiagramProps) {
	const stripeFee = round2(samplePayment * 0.029 + 0.3);
	const afterStripe = round2(samplePayment - stripeFee);
	const afterPlatform = round2(afterStripe - platformFeeDollars);

	const customerAmount = currencyFormatter.format(samplePayment);
	const stripeAmount = `-${currencyFormatter.format(stripeFee)}`;
	const platformAmount = `-${currencyFormatter.format(platformFeeDollars)}`;
	const balanceAmount = currencyFormatter.format(afterPlatform);

	const steps: Step[] = [
		{ label: "Customer pays", amount: customerAmount, tone: "primary" },
		{ label: "Stripe processes", amount: stripeAmount, tone: "deduct" },
		{ label: "OneTool platform", amount: platformAmount, tone: "deduct" },
		{ label: "Your balance", amount: balanceAmount, tone: "land" },
		{ label: "Bank payout", amount: "T+2 (US)", tone: "meta" },
	];

	// SVG geometry — five nodes along a horizontal trunk at y=120, with the
	// two deduction nodes (B, C) sitting below the trunk and reached by short
	// tributary curves. Node dimensions: 120w x 64h, rx=12.
	const NODE_W = 120;
	const NODE_H = 64;
	const TRUNK_Y = 120;
	const DEDUCT_Y = 220; // top of deduction nodes (below trunk)
	const trunkNodeY = TRUNK_Y - NODE_H / 2; // top y for trunk nodes
	const xs = [20, 170, 320, 470, 620]; // left edges → centers at 80, 230, 380, 530, 680

	const nodeCenter = (i: number) => xs[i] + NODE_W / 2;

	// Trunk path: A (right edge) → D (left edge), passing under B and C drop-off points
	const aRight = xs[0] + NODE_W;
	const dLeft = xs[3];
	const dRight = xs[3] + NODE_W;
	const eLeft = xs[4];

	// Tributary anchor points on the trunk (where deductions branch off)
	const bDropX = nodeCenter(1);
	const cDropX = nodeCenter(2);

	return (
		<section aria-label="How a payment flows from your customer to your bank">
			{/* Desktop: SVG flow chart */}
			<div className="hidden md:block w-full">
				<svg
					viewBox="0 0 760 300"
					preserveAspectRatio="xMidYMid meet"
					role="img"
					className="w-full h-auto"
				>
					<title>
						{`Money flow: Customer pays ${customerAmount}, Stripe takes ${currencyFormatter.format(
							stripeFee
						)}, OneTool takes ${currencyFormatter.format(
							platformFeeDollars
						)}, you receive ${balanceAmount}, paid out to bank`}
					</title>

					<defs>
						<marker
							id="flowArrow"
							viewBox="0 0 10 10"
							refX="8"
							refY="5"
							markerWidth="6"
							markerHeight="6"
							orient="auto-start-reverse"
							className="fill-current text-muted-foreground"
						>
							<path d="M0,0 L10,5 L0,10 z" />
						</marker>
					</defs>

					{/* Trunk: A → D along TRUNK_Y */}
					<path
						d={`M ${aRight} ${TRUNK_Y} L ${dLeft} ${TRUNK_Y}`}
						className="stroke-current text-border"
						strokeWidth={2}
						fill="none"
						markerEnd="url(#flowArrow)"
					/>

					{/* Tributary B: trunk → Stripe fee node */}
					<path
						d={`M ${bDropX} ${TRUNK_Y} C ${bDropX} ${TRUNK_Y + 40}, ${bDropX} ${DEDUCT_Y - 20}, ${bDropX} ${DEDUCT_Y}`}
						className="stroke-current text-border"
						strokeWidth={2}
						fill="none"
						markerEnd="url(#flowArrow)"
					/>

					{/* Tributary C: trunk → Platform fee node */}
					<path
						d={`M ${cDropX} ${TRUNK_Y} C ${cDropX} ${TRUNK_Y + 40}, ${cDropX} ${DEDUCT_Y - 20}, ${cDropX} ${DEDUCT_Y}`}
						className="stroke-current text-border"
						strokeWidth={2}
						fill="none"
						markerEnd="url(#flowArrow)"
					/>

					{/* Trunk continuation: D → E */}
					<path
						d={`M ${dRight} ${TRUNK_Y} L ${eLeft} ${TRUNK_Y}`}
						className="stroke-current text-border"
						strokeWidth={2}
						fill="none"
						markerEnd="url(#flowArrow)"
					/>

					{/* Node A — Customer */}
					<g>
						<rect
							x={xs[0]}
							y={trunkNodeY}
							width={NODE_W}
							height={NODE_H}
							rx={12}
							className="fill-current text-primary/10 stroke-current"
							strokeWidth={1}
							style={{ stroke: "var(--color-border)" }}
						/>
						<text
							x={nodeCenter(0)}
							y={TRUNK_Y - 6}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-[11px]"
						>
							{steps[0].label}
						</text>
						<text
							x={nodeCenter(0)}
							y={TRUNK_Y + 14}
							textAnchor="middle"
							className="fill-current text-primary text-sm font-semibold tabular-nums"
						>
							{steps[0].amount}
						</text>
					</g>

					{/* Node B — Stripe fee (deduction, below trunk) */}
					<g>
						<rect
							x={xs[1]}
							y={DEDUCT_Y}
							width={NODE_W}
							height={NODE_H}
							rx={12}
							className="fill-current text-muted/60 stroke-current"
							strokeWidth={1}
							style={{ stroke: "var(--color-border)" }}
						/>
						<text
							x={nodeCenter(1)}
							y={DEDUCT_Y + 26}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-[11px]"
						>
							{steps[1].label}
						</text>
						<text
							x={nodeCenter(1)}
							y={DEDUCT_Y + 46}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-sm font-medium tabular-nums"
						>
							{steps[1].amount}
						</text>
					</g>

					{/* Node C — Platform fee (deduction, below trunk) */}
					<g>
						<rect
							x={xs[2]}
							y={DEDUCT_Y}
							width={NODE_W}
							height={NODE_H}
							rx={12}
							className="fill-current text-muted/60 stroke-current"
							strokeWidth={1}
							style={{ stroke: "var(--color-border)" }}
						/>
						<text
							x={nodeCenter(2)}
							y={DEDUCT_Y + 26}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-[11px]"
						>
							{steps[2].label}
						</text>
						<text
							x={nodeCenter(2)}
							y={DEDUCT_Y + 46}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-sm font-medium tabular-nums"
						>
							{steps[2].amount}
						</text>
					</g>

					{/* Node D — Connected balance (the landing) */}
					<g>
						<rect
							x={xs[3]}
							y={trunkNodeY}
							width={NODE_W}
							height={NODE_H}
							rx={12}
							className="fill-current text-emerald-500/10 dark:text-emerald-400/15 stroke-current"
							strokeWidth={1}
							style={{ stroke: "var(--color-border)" }}
						/>
						<text
							x={nodeCenter(3)}
							y={TRUNK_Y - 6}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-[11px]"
						>
							{steps[3].label}
						</text>
						<text
							x={nodeCenter(3)}
							y={TRUNK_Y + 14}
							textAnchor="middle"
							className="fill-current text-emerald-600 dark:text-emerald-400 text-sm font-semibold tabular-nums"
						>
							{steps[3].amount}
						</text>
					</g>

					{/* Node E — Bank payout */}
					<g>
						<rect
							x={xs[4]}
							y={trunkNodeY}
							width={NODE_W}
							height={NODE_H}
							rx={12}
							className="fill-current text-muted/30 stroke-current"
							strokeWidth={1}
							style={{ stroke: "var(--color-border)" }}
						/>
						<text
							x={nodeCenter(4)}
							y={TRUNK_Y - 6}
							textAnchor="middle"
							className="fill-current text-muted-foreground text-[11px]"
						>
							{steps[4].label}
						</text>
						<text
							x={nodeCenter(4)}
							y={TRUNK_Y + 14}
							textAnchor="middle"
							className="fill-current text-foreground text-xs font-medium"
						>
							{steps[4].amount}
						</text>
					</g>
				</svg>
			</div>

			{/* Mobile: vertical stack with chevrons */}
			<ol className="md:hidden space-y-2">
				{steps.map((step, index) => {
					const isLast = index === steps.length - 1;
					return (
						<React.Fragment key={step.label}>
							<li className="flex items-baseline justify-between gap-x-4 gap-y-1 py-1">
								<span className="text-sm text-foreground">{step.label}</span>
								<span
									className={[
										"text-sm tabular-nums",
										step.tone === "primary" && "font-semibold text-primary",
										step.tone === "deduct" && "text-muted-foreground",
										step.tone === "land" &&
											"font-semibold text-emerald-600 dark:text-emerald-400",
										step.tone === "meta" && "text-xs text-muted-foreground",
									]
										.filter(Boolean)
										.join(" ")}
								>
									{step.amount}
								</span>
							</li>
							{!isLast && (
								<li
									aria-hidden="true"
									className="flex justify-center text-muted-foreground/60"
								>
									<ChevronRight className="h-3.5 w-3.5 rotate-90" />
								</li>
							)}
						</React.Fragment>
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
