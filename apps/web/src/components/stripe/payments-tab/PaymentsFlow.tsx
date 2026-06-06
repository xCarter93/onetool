"use client";

import React from "react";
import {
	CreditCard,
	Wallet,
	Landmark,
	ChevronRight,
	ChevronDown,
} from "lucide-react";

interface PaymentsFlowProps {
	platformFeeDollars?: number;
	bankName?: string;
	last4?: string;
}

const PRESETS = [100, 500, 2500, 10000];

const fmt = (n: number) =>
	"$" +
	n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

type Tone = "primary" | "success" | "muted";

const NODE_TONE: Record<Tone, string> = {
	primary: "border-primary/25 bg-primary/10 text-primary",
	success: "border-success/25 bg-success/10 text-success",
	muted: "border-border bg-muted text-muted-foreground",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
	return (
		<p className="m-0 whitespace-nowrap text-[11px] font-semibold uppercase leading-tight tracking-[0.07em] text-muted-foreground">
			{children}
		</p>
	);
}

function FlowNode({
	icon: Icon,
	eyebrow,
	value,
	note,
	tone,
	highlight,
}: {
	icon: typeof CreditCard;
	eyebrow: string;
	value: string;
	note: string;
	tone: Tone;
	highlight?: boolean;
}) {
	return (
		<div
			className={[
				"relative min-w-0 flex-1 rounded-2xl p-4",
				highlight
					? "border-[1.5px] border-dashed border-success/50 bg-success/[0.08]"
					: "border border-border bg-card shadow-xs",
			].join(" ")}
		>
			<div className="mb-2.5 flex items-center gap-2">
				<span
					className={`grid h-[30px] w-[30px] place-content-center rounded-lg border ${NODE_TONE[tone]}`}
				>
					<Icon className="h-4 w-4" aria-hidden="true" />
				</span>
				<Eyebrow>{eyebrow}</Eyebrow>
			</div>
			<div
				className={`text-[26px] font-semibold tracking-tight tabular-nums ${
					highlight ? "text-success" : "text-foreground"
				}`}
			>
				{value}
			</div>
			<div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
				{note}
			</div>
		</div>
	);
}

type Deduction = { label: string; amt: number; tone: "chart" | "warning" };

const CHIP_TONE = {
	chart: "border-chart-1/25 bg-chart-1/10 text-chart-1",
	warning: "border-warning/30 bg-warning/15 text-warning",
} as const;

const CHIP_DOT = {
	chart: "bg-chart-1",
	warning: "bg-warning",
} as const;

function DeductionChip({ label, amt, tone }: Deduction) {
	return (
		<div
			className={`flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1 ${CHIP_TONE[tone]}`}
		>
			<span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold leading-tight">
				<span
					aria-hidden="true"
					className={`h-[7px] w-[7px] shrink-0 rounded-sm ${CHIP_DOT[tone]}`}
				/>
				{label}
			</span>
			<span className="whitespace-nowrap text-[11.5px] font-bold leading-tight tabular-nums">
				−{fmt(amt)}
			</span>
		</div>
	);
}

function Connector({
	deductions,
	label,
}: {
	deductions?: Deduction[];
	label?: string;
}) {
	return (
		<div className="relative flex shrink-0 basis-[154px] flex-col items-center justify-center self-stretch px-0.5">
			{deductions && (
				<div className="mb-2 flex w-full flex-col gap-1.5">
					{deductions.map((d) => (
						<DeductionChip key={d.label} {...d} />
					))}
				</div>
			)}
			<div className="flex w-full items-center text-border">
				<span className="h-0.5 flex-1 rounded-full bg-current" />
				<ChevronRight
					className="-ml-1 h-4 w-4 text-muted-foreground/90"
					aria-hidden="true"
				/>
			</div>
			{label && (
				<div className="mt-2 text-center text-[11px] font-medium leading-tight text-muted-foreground">
					{label}
				</div>
			)}
		</div>
	);
}

export function PaymentsFlow({
	platformFeeDollars = 1,
	bankName,
	last4,
}: PaymentsFlowProps) {
	const [amount, setAmount] = React.useState(100);

	// Derived during render — no effects (vercel-react-best-practices).
	const stripeFee = amount * 0.029 + 0.3;
	const net = Math.max(0, amount - stripeFee - platformFeeDollars);
	const pct = (a: number) => (amount > 0 ? (a / amount) * 100 : 0);

	const bankLabel = last4 ? `${bankName ?? "Bank"} ••••${last4}` : "Your bank";

	const allocation = [
		{ label: "Your payout", amt: net, bar: "bg-success", note: "Lands in your bank" },
		{
			label: "Stripe processing",
			amt: stripeFee,
			bar: "bg-chart-1",
			note: "2.9% + $0.30",
		},
		{
			label: "OneTool fee",
			amt: platformFeeDollars,
			bar: "bg-warning",
			note: `${fmt(platformFeeDollars)} per charge`,
		},
	];

	const dot = {
		"Your payout": "bg-success",
		"Stripe processing": "bg-chart-1",
		"OneTool fee": "bg-warning",
	} as const;

	const timeline = [
		{
			t: "Today",
			d: "Customer's card is charged",
			icon: CreditCard,
			done: true,
		},
		{
			t: "Today",
			d: "Funds land in your OneTool balance",
			icon: Wallet,
			done: true,
		},
		{
			t: "+2 business days",
			d: `Paid out to ${bankLabel}`,
			icon: Landmark,
			done: false,
		},
	];

	const deductions: Deduction[] = [
		{ label: "Stripe fee", amt: stripeFee, tone: "chart" },
		{ label: "OneTool fee", amt: platformFeeDollars, tone: "warning" },
	];

	return (
		<section
			aria-label="How a payment flows from your customer to your bank"
			className="space-y-6"
		>
			{/* Header + amount control */}
			<div className="flex flex-wrap items-end justify-between gap-5">
				<div className="min-w-[260px]">
					<h3 className="text-lg font-semibold tracking-tight text-foreground">
						How payments work
					</h3>
					<p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
						Follow a single invoice from your customer&apos;s card to your bank
						account. Drag to see how any amount splits.
					</p>
				</div>
				<div className="max-w-md flex-[1_1_320px]">
					<div className="mb-2 flex items-baseline justify-between">
						<Eyebrow>Example invoice</Eyebrow>
						<div className="flex items-baseline gap-px">
							<span className="text-base font-semibold text-muted-foreground">
								$
							</span>
							<input
								type="number"
								value={Math.round(amount)}
								min={5}
								max={25000}
								aria-label="Example invoice amount"
								onChange={(e) =>
									setAmount(
										Math.min(25000, Math.max(5, Number(e.target.value) || 0))
									)
								}
								className="w-[92px] border-none bg-transparent p-0 text-right text-[22px] font-bold tracking-tight tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
							/>
						</div>
					</div>
					<input
						type="range"
						min={5}
						max={25000}
						step={5}
						value={amount}
						aria-label="Example invoice amount slider"
						onChange={(e) => setAmount(Number(e.target.value))}
						className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
					/>
					<div className="mt-3 flex gap-1.5">
						{PRESETS.map((p) => {
							const on = Math.round(amount) === p;
							return (
								<button
									key={p}
									type="button"
									onClick={() => setAmount(p)}
									aria-pressed={on}
									className={[
										"flex-1 rounded-lg border px-1 py-1.5 text-xs font-semibold transition-colors",
										on
											? "border-primary/35 bg-primary/10 text-primary"
											: "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
									].join(" ")}
								>
									{fmt0(p)}
								</button>
							);
						})}
					</div>
				</div>
			</div>

			{/* Pipeline — desktop */}
			<div className="hidden items-stretch gap-1 md:flex">
				<FlowNode
					icon={CreditCard}
					eyebrow="Customer pays"
					value={fmt(amount)}
					note="Card charged at checkout"
					tone="primary"
				/>
				<Connector deductions={deductions} label="Fees deducted instantly" />
				<FlowNode
					icon={Wallet}
					eyebrow="Your balance"
					value={fmt(net)}
					note="Available right away"
					tone="success"
					highlight
				/>
				<Connector label="Paid out on your schedule — T+2 in the US" />
				<FlowNode
					icon={Landmark}
					eyebrow="Bank payout"
					value={fmt(net)}
					note={bankLabel}
					tone="muted"
				/>
			</div>

			{/* Pipeline — mobile (vertical) */}
			<div className="space-y-2 md:hidden">
				<FlowNode
					icon={CreditCard}
					eyebrow="Customer pays"
					value={fmt(amount)}
					note="Card charged at checkout"
					tone="primary"
				/>
				<div className="flex flex-col items-center gap-1.5 py-1">
					<ChevronDown
						className="h-4 w-4 text-muted-foreground/70"
						aria-hidden="true"
					/>
					<div className="flex w-full max-w-xs flex-col gap-1.5">
						{deductions.map((d) => (
							<DeductionChip key={d.label} {...d} />
						))}
					</div>
					<ChevronDown
						className="h-4 w-4 text-muted-foreground/70"
						aria-hidden="true"
					/>
				</div>
				<FlowNode
					icon={Wallet}
					eyebrow="Your balance"
					value={fmt(net)}
					note="Available right away"
					tone="success"
					highlight
				/>
				<div className="flex justify-center py-1">
					<ChevronDown
						className="h-4 w-4 text-muted-foreground/70"
						aria-hidden="true"
					/>
				</div>
				<FlowNode
					icon={Landmark}
					eyebrow="Bank payout"
					value={fmt(net)}
					note={`${bankLabel} · T+2 in the US`}
					tone="muted"
				/>
			</div>

			{/* Allocation bar */}
			<div>
				<div className="mb-2.5 flex items-center justify-between">
					<Eyebrow>Where your {fmt0(amount)} goes</Eyebrow>
					<span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
						You keep{" "}
						<strong className="font-bold text-success">
							{pct(net).toFixed(1)}%
						</strong>
					</span>
				</div>
				<div className="flex h-9 overflow-hidden rounded-lg border border-border bg-muted">
					{allocation.map((a, i) => (
						<div
							key={a.label}
							title={`${a.label}: ${fmt(a.amt)}`}
							style={{ width: pct(a.amt) + "%", minWidth: a.amt > 0 ? 3 : 0 }}
							className={[
								"flex items-center justify-center transition-[width] duration-200 ease-out motion-reduce:transition-none",
								a.bar,
								i < allocation.length - 1 ? "border-r-2 border-card" : "",
							].join(" ")}
						>
							{pct(a.amt) > 9 && (
								<span className="whitespace-nowrap text-[11.5px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.18)]">
									{pct(a.amt).toFixed(0)}%
								</span>
							)}
						</div>
					))}
				</div>
				<div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
					{allocation.map((a) => (
						<div key={a.label} className="flex gap-2">
							<span
								aria-hidden="true"
								className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${dot[a.label as keyof typeof dot]}`}
							/>
							<div className="min-w-0">
								<div className="text-sm font-bold leading-tight tabular-nums text-foreground">
									{fmt(a.amt)}
								</div>
								<div className="mt-0.5 whitespace-nowrap text-[12.5px] font-semibold leading-tight text-foreground">
									{a.label}
								</div>
								<div className="mt-px whitespace-nowrap text-[11.5px] leading-tight text-muted-foreground">
									{a.note}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Settlement timeline */}
			<div className="rounded-xl border border-border bg-primary/[0.03] p-5">
				<Eyebrow>Settlement timeline</Eyebrow>
				<div className="mt-3.5 flex items-start">
					{timeline.map((m, i) => (
						<React.Fragment key={i}>
							<div className="relative flex flex-1 flex-col items-center gap-2 text-center">
								<span
									className={[
										"grid h-8 w-8 place-content-center rounded-full border-[1.5px]",
										m.done
											? "border-success/40 bg-success/[0.13] text-success"
											: "border-primary/40 bg-primary/[0.13] text-primary",
									].join(" ")}
								>
									<m.icon className="h-[15px] w-[15px]" aria-hidden="true" />
								</span>
								<div>
									<div
										className={`text-[12.5px] font-bold ${
											m.done ? "text-success" : "text-primary"
										}`}
									>
										{m.t}
									</div>
									<div className="mt-0.5 max-w-[180px] text-xs leading-snug text-muted-foreground">
										{m.d}
									</div>
								</div>
							</div>
							{i < timeline.length - 1 && (
								<span
									aria-hidden="true"
									className="mt-4 h-0.5 shrink-0 basis-6 bg-border"
								/>
							)}
						</React.Fragment>
					))}
				</div>
			</div>

			<p className="text-xs leading-relaxed text-muted-foreground">
				Example based on a {fmt(amount)} invoice with a {fmt(platformFeeDollars)}{" "}
				platform fee. Actual Stripe fees vary by card type and region — see Stripe
				pricing for current rates.
			</p>
		</section>
	);
}
