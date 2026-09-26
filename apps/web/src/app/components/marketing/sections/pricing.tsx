"use client";

import { useState } from "react";
import { usePlans } from "@clerk/nextjs/experimental";
import { cn } from "@/lib/utils";
import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";
import { CheckItem, Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { PrimaryButton, SecondaryButton } from "../marketing-nav";
import { AmbientLayer } from "../ambient";
import { PricingHalftoneScene } from "../section-halftone-scenes";
import { RoughMark } from "../rough-mark";
import {
	BUSINESS_SEATS,
	FREE_SEATS,
	PLAN_MATRIX,
} from "@onetool/backend/convex/lib/planMatrix";

const matrixValue = (key: string, plan: "free" | "business"): string => {
	const row = PLAN_MATRIX.find((r) => r.key === key);
	if (!row) throw new Error(`PLAN_MATRIX row missing: ${key}`);
	return String(row[plan]);
};

const FREE_FEATURES = [
	"Unlimited clients and projects",
	`${FREE_SEATS} team members`,
	`${matrixValue("clientSends", "free")} quote and invoice sends a month, +10 in months you collect a payment`,
	`${matrixValue("esignatures", "free")} e-signature requests a month`,
	`AI assistant, ${matrixValue("assistantMessages", "free")} messages a day`,
	`${matrixValue("savedReports", "free")} saved custom reports`,
	`AI client import, up to ${Number(matrixValue("importedRows", "free")).toLocaleString("en-US")} rows`,
	"Online card payments through Stripe",
];

const BUSINESS_FEATURES = [
	`${BUSINESS_SEATS} team members`,
	"Unlimited sends and e-signatures",
	"Unlimited AI messages, reports and imports",
];

const BUSINESS_ADD_LABELS: Record<string, string> = {
	automationPublish: "Workflow automations",
	routing: "Route optimization for the day's jobs",
	quickbooks: "QuickBooks sync",
	nlReportGeneration: "AI report generation",
	portalBadgeRemoval: "Remove the OneTool badge from your client portal",
};

const BUSINESS_INCLUDES = [
	...PLAN_MATRIX.filter((row) => row.business === true && row.free === false).map(
		(row) => BUSINESS_ADD_LABELS[row.key] ?? row.label
	),
	"Priority support with 24-hour SLAs",
];

const FALLBACK_MONTHLY = 30;
const FALLBACK_YEARLY = 300;

const trimCents = (formatted: string) => formatted.replace(/\.00$/, "");

function useBusinessPrice() {
	const { data: plans, isLoading } = usePlans({ for: "organization", enabled: true });

	const paidPlans = !isLoading && plans ? plans.filter((plan) => plan.hasBaseFee) : [];
	const business =
		paidPlans.find((plan) => plan.name?.toLowerCase().includes("business")) ?? paidPlans[0];

	const fee = business?.fee;
	const annualFee = business?.annualFee;

	// Do not mix live and fallback prices in the savings calculation.
	if (!fee || !annualFee) {
		return {
			symbol: "$",
			monthly: String(FALLBACK_MONTHLY),
			yearly: String(FALLBACK_YEARLY),
			monthlyMinor: FALLBACK_MONTHLY * 100,
			yearlyMinor: FALLBACK_YEARLY * 100,
		};
	}

	return {
		symbol: fee.currencySymbol ?? annualFee.currencySymbol ?? "$",
		monthly: trimCents(fee.amountFormatted),
		yearly: trimCents(annualFee.amountFormatted),
		monthlyMinor: fee.amount,
		yearlyMinor: annualFee.amount,
	};
}

const PLAN_ITEM = "items-start gap-[11px] text-[15px]";
const GROUP_LABEL =
	"text-[11px] font-semibold uppercase tracking-[0.12em] text-(--ink-3)";
const GROUP = "border-t border-(--rule) pt-5";

function BillingToggle({
	annual,
	onChange,
	savingPct,
}: {
	annual: boolean;
	onChange: (annual: boolean) => void;
	savingPct: number;
}) {
	const tab = (isActive: boolean) =>
		cn(
			"cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)",
			isActive ? "bg-(--sheet) text-(--ink)" : "text-(--ink-3) hover:text-(--ink-2)"
		);

	return (
		<div
			role="group"
			aria-label="Billing period"
			className="inline-flex flex-none rounded-[11px] border border-(--rule-2) bg-(--paper) p-1"
		>
			<button
				type="button"
				aria-pressed={!annual}
				onClick={() => onChange(false)}
				className={tab(!annual)}
			>
				Monthly
			</button>
			<button
				type="button"
				aria-pressed={annual}
				onClick={() => onChange(true)}
				className={tab(annual)}
			>
				Yearly
				{savingPct > 0 && (
					<span className="font-medium text-(--ink-3)"> · save {savingPct}%</span>
				)}
			</button>
		</div>
	);
}

export function Pricing() {
	const [annual, setAnnual] = useState(false);
	const promoActive = useLaunchPromoActive();
	const { symbol, monthly, yearly, monthlyMinor, yearlyMinor } = useBusinessPrice();

	const yearOfMonths = monthlyMinor * 12;
	const savingPct =
		yearOfMonths > 0 && yearlyMinor < yearOfMonths
			? Math.round((1 - yearlyMinor / yearOfMonths) * 100)
			: 0;

	const price = `${symbol}${annual ? yearly : monthly}`;
	const priceUnit = annual ? "/ year" : "/ month";
	const priceNote = annual
		? `Works out at ${symbol}${Math.round(yearlyMinor / 12 / 100)} a month${
				savingPct > 0 ? `, saving ${savingPct}%` : ""
			}.`
		: `Per organisation, ${BUSINESS_SEATS} seats included. Cancel any time.`;

	return (
		<Section id="pricing" scheme="sheet" className="overflow-hidden">

			<AmbientLayer fullBleed opacity={0.7}>
				<PricingHalftoneScene />
			</AmbientLayer>

			<div className="relative">
				<div>
					<SectionHeading className="mt-0 max-w-[16ch]">
						<RoughMark type="highlight">Free</RoughMark> until you outgrow it.
					</SectionHeading>
					<Lede className="max-w-[34rem]">
						Try Business for 14 days without a card. Then stay on Free, or upgrade
						when your crew needs more. Want a walkthrough?{" "}
						<a
							href="#book-a-demo"
							className="font-medium text-(--accent-ink) underline-offset-2 transition-colors hover:text-(--ink) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
						>
							book a demo
						</a>{" "}
						and we&rsquo;ll get in touch.
					</Lede>
				</div>
			</div>

			<div className="relative mx-auto mt-[clamp(40px,6vw,80px)] max-w-[64rem]">
				<div className="mb-4 flex justify-center">
					<BillingToggle
						annual={annual}
						onChange={setAnnual}
						savingPct={savingPct}
					/>
				</div>
				<div className="grid gap-4 md:grid-cols-2 md:grid-rows-[repeat(4,auto)] md:gap-x-6 md:gap-y-5">
					<div className="lp-lift grid content-start gap-5 rounded-2xl border border-(--rule-2) bg-(--paper) p-[clamp(24px,3vw,36px)] md:col-start-1 md:row-span-4 md:row-start-1 md:grid-rows-subgrid">
						<div>
							<p className="flex min-h-7 items-center text-[12px] font-semibold uppercase tracking-[0.1em] text-(--ink-3)">
								Free
							</p>
							<p className="mt-3 text-[15px] leading-[1.55] text-(--ink-2) md:min-h-[4.65em] lg:min-h-[3.1em]">
								Enough to run a one-van operation and see if this fits.
							</p>
							<p className="mt-[18px] flex items-baseline gap-2">
								<span className="text-[clamp(38px,4.6vw,54px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
									$0
								</span>
								<span className="text-base text-(--ink-2)">{priceUnit}</span>
							</p>
							<p className="mt-[10px] text-[15px] text-(--ink-2)">
								Starts with a 14-day trial of Business. Free forever after, no card
								required.
							</p>
						</div>

						<SecondaryButton
							href="/sign-up"
							className="h-12 w-full justify-center text-base font-semibold"
						>
							Start free
						</SecondaryButton>

						<div className={`${GROUP} md:row-span-2`}>
							<p className={GROUP_LABEL}>What you get</p>
							<ul className="mt-4 grid gap-[11px]">
								{FREE_FEATURES.map((item) => (
									<CheckItem key={item} tone="dim" className={PLAN_ITEM}>
										{item}
									</CheckItem>
								))}
							</ul>
						</div>
					</div>

					<div className="lp-lift relative grid content-start gap-5 rounded-2xl border border-(--rule-3) bg-(--paper) p-[clamp(24px,3vw,36px)] md:col-start-2 md:row-span-4 md:row-start-1 md:grid-rows-subgrid">
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-0 rounded-2xl"
							style={{
								background:
									"linear-gradient(160deg,var(--accent-wash),transparent 46%)",
							}}
						/>

						<div className="relative">
							<div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
								<Eyebrow>Business</Eyebrow>
								<span className="rounded-full border border-(--accent) bg-(--accent-wash) px-[11px] py-[5px] text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-(--accent-ink)">
									For growing crews
								</span>
							</div>
							<p className="mt-3 text-[15px] leading-[1.55] text-(--ink-2) md:min-h-[4.65em] lg:min-h-[3.1em]">
								Room for a growing crew: no usage meters, and up to 20 people
								on one flat price.
							</p>
							<p className="mt-[18px] flex items-baseline gap-2">
								<span className="text-[clamp(38px,4.6vw,54px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
									{price}
								</span>
								<span className="text-base text-(--ink-2)">{priceUnit}</span>
							</p>
							<p className="mt-[10px] text-[15px] text-(--ink-2)">{priceNote}</p>
							{promoActive && (
								<p className="mt-[10px] text-[15px] font-medium text-(--accent-ink)">
									Launch offer:{" "}
									{annual
										? LAUNCH_PROMO.annual.label.toLowerCase()
										: LAUNCH_PROMO.monthly.label.toLowerCase()}
									. Claim your code at signup. Ends {LAUNCH_PROMO.endsLabel}.
								</p>
							)}
						</div>

						<PrimaryButton
							href="/sign-up"
							className="relative h-12 w-full justify-center text-base"
						>
							Start free
							<span aria-hidden="true" className="text-sm">
								→
							</span>
						</PrimaryButton>

						<div className={`relative ${GROUP}`}>
							<p className={GROUP_LABEL}>What you get</p>
							<ul className="mt-4 grid gap-[11px]">
								{BUSINESS_FEATURES.map((item) => (
									<CheckItem key={item} className={PLAN_ITEM}>
										{item}
									</CheckItem>
								))}
							</ul>
						</div>

						<div className={`relative ${GROUP}`}>
							<p className={GROUP_LABEL}>Everything in Free, plus</p>
							<ul className="mt-4 grid gap-[11px]">
								{BUSINESS_INCLUDES.map((item) => (
									<CheckItem key={item} className={PLAN_ITEM}>
										{item}
									</CheckItem>
								))}
							</ul>
						</div>
					</div>
				</div>
			</div>
		</Section>
	);
}
