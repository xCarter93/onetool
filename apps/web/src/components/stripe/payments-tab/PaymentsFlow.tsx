"use client";

import React from "react";
import { CreditCard, Receipt, Sparkles, Wallet, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
} from "@/components/reui/frame";
import {
	Timeline,
	TimelineContent,
	TimelineIndicator,
	TimelineItem,
	TimelineDate,
	TimelineTitle,
} from "@/components/reui/timeline";
import { formatCurrency } from "@/lib/money";

interface PaymentsFlowProps {
	platformFeeDollars?: number;
}

const AMOUNT_PRESETS = [100, 500, 2500, 10000];

type Tone = "neutral" | "primary" | "amber" | "emerald";

const TILE_TONE: Record<Tone, string> = {
	neutral: "bg-muted text-muted-foreground",
	primary: "bg-primary/10 text-primary",
	amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const BAR_TONE: Record<Tone, string> = {
	neutral: "bg-foreground/70",
	primary: "bg-primary",
	amber: "bg-amber-500",
	emerald: "bg-emerald-500",
};

const AMOUNT_TONE: Record<Tone, string> = {
	neutral: "text-foreground",
	primary: "text-foreground",
	amber: "text-foreground",
	emerald: "text-emerald-600 dark:text-emerald-400",
};

function LegendRow({
	dotClass,
	label,
	amount,
}: {
	dotClass: string;
	label: string;
	amount: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2 text-xs">
			<span className="flex items-center gap-2 text-muted-foreground">
				<span aria-hidden="true" className={cn("size-2 rounded-full", dotClass)} />
				{label}
			</span>
			<span className="font-semibold tabular-nums text-foreground">
				{amount}
			</span>
		</div>
	);
}

export function PaymentsFlow({ platformFeeDollars = 1 }: PaymentsFlowProps) {
	const [amount, setAmount] = React.useState(100);

	// Derived during render — no effects (vercel-react-best-practices).
	const stripeFee = amount * 0.029 + 0.3;
	const balance = Math.max(0, amount - stripeFee - platformFeeDollars);
	const stripePct = amount > 0 ? (stripeFee / amount) * 100 : 0;
	const otPct = amount > 0 ? (platformFeeDollars / amount) * 100 : 0;
	const keepPct = amount > 0 ? (balance / amount) * 100 : 0;

	// Donut geometry: three arcs that sum to exactly 100% of the circle.
	const r = 52;
	const circumference = 2 * Math.PI * r;
	const keepLen = (keepPct / 100) * circumference;
	const stripeLen = (stripePct / 100) * circumference;
	const otLen = (otPct / 100) * circumference;

	const moneyFlow: {
		icon: typeof CreditCard;
		label: string;
		amount: string;
		sublabel: string;
		pct: number;
		tone: Tone;
		large?: boolean;
	}[] = [
		{
			icon: CreditCard,
			label: "Customer pays",
			amount: formatCurrency(amount),
			sublabel: "Full invoice amount, charged at checkout",
			pct: 100,
			tone: "neutral",
		},
		{
			icon: Receipt,
			label: "Stripe processing",
			amount: `−${formatCurrency(stripeFee)}`,
			sublabel: "2.9% + $0.30 per charge",
			pct: stripePct,
			tone: "primary",
		},
		{
			icon: Sparkles,
			label: "OneTool fee",
			amount: `−${formatCurrency(platformFeeDollars)}`,
			sublabel: `${formatCurrency(platformFeeDollars)} per charge`,
			pct: otPct,
			tone: "amber",
		},
		{
			icon: Wallet,
			label: "Your balance",
			amount: formatCurrency(balance),
			sublabel: "Available in your OneTool balance right away",
			pct: keepPct,
			tone: "emerald",
			large: true,
		},
		{
			icon: Landmark,
			label: "Bank payout",
			amount: formatCurrency(balance),
			sublabel: "+2 business days (US)",
			pct: keepPct,
			tone: "emerald",
		},
	];

	const settlementSteps = [
		{
			date: "Today",
			desc: "Customer's card is charged",
			icon: CreditCard,
			done: true,
		},
		{
			date: "Today",
			desc: "Funds land in your OneTool balance",
			icon: Wallet,
			done: true,
		},
		{
			date: "+2 business days",
			desc: "Paid out to your bank",
			icon: Landmark,
			done: false,
		},
	];

	return (
		<section
			aria-label="How a payment flows from your customer to your bank"
			className="space-y-4"
		>
			<div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
				{/* Money flow timeline */}
				<Frame>
					<FrameHeader className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<FrameTitle className="text-base">
								Follow your money
							</FrameTitle>
							<FrameDescription className="mt-1 text-xs">
								See exactly where each dollar of an invoice goes.
							</FrameDescription>
						</div>
						<div className="inline-flex shrink-0 rounded-lg bg-muted p-1">
							{AMOUNT_PRESETS.map((p) => {
								const active = amount === p;
								return (
									<button
										key={p}
										type="button"
										onClick={() => setAmount(p)}
										aria-pressed={active}
										className={cn(
											"rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
											active
												? "bg-card text-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										{formatCurrency(p, { whole: true })}
									</button>
								);
							})}
						</div>
					</FrameHeader>

					<FramePanel>
						<Timeline defaultValue={moneyFlow.length}>
							{moneyFlow.map((row, index) => (
								<TimelineItem key={row.label} step={index + 1}>
									<TimelineIndicator
										className={cn(
											"flex size-7 items-center justify-center border-none",
											TILE_TONE[row.tone],
										)}
									>
										<row.icon className="size-3.5" aria-hidden="true" />
									</TimelineIndicator>
									<TimelineTitle className="flex items-baseline justify-between gap-3 text-sm font-medium text-foreground">
										<span>{row.label}</span>
										<span
											className={cn(
												"shrink-0 font-semibold tabular-nums",
												row.large ? "text-base" : "text-sm",
												AMOUNT_TONE[row.tone],
											)}
										>
											{row.amount}
										</span>
									</TimelineTitle>
									<TimelineContent className="mt-1">
										<p className="text-xs text-muted-foreground">
											{row.sublabel}
										</p>
										<div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
											<div
												className={cn(
													"h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
													BAR_TONE[row.tone],
												)}
												style={{
													width: `${Math.min(100, Math.max(0, row.pct))}%`,
												}}
											/>
										</div>
									</TimelineContent>
								</TimelineItem>
							))}
						</Timeline>
					</FramePanel>
				</Frame>

				{/* Right column: donut + settlement timeline */}
				<div className="flex flex-col gap-6">
					<Frame>
						<FramePanel>
							<div className="flex flex-col items-center">
								<div className="relative grid size-[132px] shrink-0 place-content-center">
									<svg width={132} height={132} viewBox="0 0 132 132">
										<circle
											cx={66}
											cy={66}
											r={r}
											fill="none"
											strokeWidth={15}
											strokeDasharray={`${keepLen} ${circumference - keepLen}`}
											transform="rotate(-90 66 66)"
											className="stroke-emerald-500"
										/>
										<circle
											cx={66}
											cy={66}
											r={r}
											fill="none"
											strokeWidth={15}
											strokeDasharray={`${stripeLen} ${circumference - stripeLen}`}
											strokeDashoffset={-keepLen}
											transform="rotate(-90 66 66)"
											className="stroke-primary"
										/>
										<circle
											cx={66}
											cy={66}
											r={r}
											fill="none"
											strokeWidth={15}
											strokeDasharray={`${otLen} ${circumference - otLen}`}
											strokeDashoffset={-(keepLen + stripeLen)}
											transform="rotate(-90 66 66)"
											className="stroke-amber-500"
										/>
									</svg>
									<div className="absolute inset-0 flex flex-col items-center justify-center">
										<span className="text-xl font-bold tabular-nums text-foreground">
											{keepPct.toFixed(0)}%
										</span>
										<span className="text-[11px] text-muted-foreground">
											you keep
										</span>
									</div>
								</div>
								<div className="mt-5 w-full space-y-2.5">
									<LegendRow
										dotClass="bg-emerald-500"
										label="Your payout"
										amount={formatCurrency(balance)}
									/>
									<LegendRow
										dotClass="bg-primary"
										label="Stripe processing"
										amount={`−${formatCurrency(stripeFee)}`}
									/>
									<LegendRow
										dotClass="bg-amber-500"
										label="OneTool fee"
										amount={`−${formatCurrency(platformFeeDollars)}`}
									/>
								</div>
							</div>
						</FramePanel>
					</Frame>

					<Frame>
						<FrameHeader>
							<FrameTitle className="text-base">
								Settlement timeline
							</FrameTitle>
						</FrameHeader>
						<FramePanel>
							<Timeline defaultValue={settlementSteps.length}>
								{settlementSteps.map((step, index) => (
									<TimelineItem key={step.desc} step={index + 1}>
										<TimelineIndicator
											className={cn(
												"flex size-7 items-center justify-center border-none",
												step.done
													? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
													: "bg-primary/10 text-primary",
											)}
										>
											<step.icon className="size-3.5" aria-hidden="true" />
										</TimelineIndicator>
										<TimelineDate
											className={cn(
												"mb-0.5 text-xs font-bold",
												step.done
													? "text-emerald-600 dark:text-emerald-400"
													: "text-primary",
											)}
										>
											{step.date}
										</TimelineDate>
										<TimelineTitle className="text-xs font-medium leading-snug text-muted-foreground">
											{step.desc}
										</TimelineTitle>
									</TimelineItem>
								))}
							</Timeline>
						</FramePanel>
					</Frame>
				</div>
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">
				Example based on a {formatCurrency(amount)} invoice with a{" "}
				{formatCurrency(platformFeeDollars)} platform fee. Actual Stripe fees vary by
				card type and region — see Stripe pricing for current rates.
			</p>
		</section>
	);
}
