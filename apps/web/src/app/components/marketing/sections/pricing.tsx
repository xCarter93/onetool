"use client";

import { useState } from "react";
import { usePlans } from "@clerk/nextjs/experimental";
import { cn } from "@/lib/utils";
import { AmbientLayer } from "../ambient";
import { PricingHalftoneScene } from "../section-halftone-scenes";
import { CheckItem, Eyebrow, Lede, Section, SectionHeading, PlusCorners } from "../primitives";
import { PrimaryButton, SecondaryButton } from "../marketing-nav";
import { RoughMark } from "../rough-mark";

/* Pricing — comp lines 537–589. Two plates: the free tier as a hairline card,
 * Business as the page's featured card (plus-corners + accent wash). Plan
 * contents mirror the production pricing cards, including their two-part split
 * — the caps each plan lifts, then what upgrading adds on top. The Business
 * figures prefer the live Clerk plan and fall back to $30 / $300. */

const FREE_FEATURES = [
	"Up to 10 clients",
	"3 active projects per client",
	"5 e-signature requests a month",
	"Custom invoice and quote PDF generation",
];

const BUSINESS_FEATURES = [
	"Unlimited clients",
	"Unlimited active projects per client",
	"Unlimited e-signature requests a month",
];

const BUSINESS_INCLUDES = [
	"Custom SKU creation",
	"Unlimited saved organization documents",
	"AI import for existing clients and projects",
	"Stripe Connect — send and receive card payments",
	"Priority support with 24-hour SLAs",
];

const FALLBACK_MONTHLY = 30;
const FALLBACK_YEARLY = 300;

/** Live Clerk Business-plan pricing in dollars; hardcoded fallback while the
 *  plans load, or if billing isn't reachable from the public page. */
function useBusinessPrice() {
	const { data: plans, isLoading } = usePlans({ for: "organization", enabled: true });

	const paidPlans = !isLoading && plans ? plans.filter((plan) => plan.hasBaseFee) : [];
	const business =
		paidPlans.find((plan) => plan.name?.toLowerCase().includes("business")) ?? paidPlans[0];

	// Clerk quotes fees in cents at its API boundary; the page displays dollars.
	return {
		monthly: business?.fee?.amount
			? Math.round(business.fee.amount / 100)
			: FALLBACK_MONTHLY,
		yearly: business?.annualFee?.amount
			? Math.round(business.annualFee.amount / 100)
			: FALLBACK_YEARLY,
	};
}

const PLAN_ITEM = "items-start gap-[11px] text-[15px]";
const GROUP_LABEL =
	"text-[11px] font-semibold uppercase tracking-[0.12em] text-(--ink-3)";
/** Feature groups sit under a hairline, the way the production cards read. */
const GROUP = "border-t border-(--rule) pt-5";

function BillingToggle({
	annual,
	onChange,
}: {
	annual: boolean;
	onChange: (annual: boolean) => void;
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
				Yearly <span className="font-medium opacity-75">· save 17%</span>
			</button>
		</div>
	);
}

export function Pricing() {
	const [annual, setAnnual] = useState(false);
	const { monthly, yearly } = useBusinessPrice();

	const price = annual ? `$${yearly}` : `$${monthly}`;
	const priceUnit = annual ? "/ year" : "/ month";
	const priceNote = annual
		? `Works out at $${Math.round(yearly / 12)} a month, saving 17%.`
		: "Per organisation, unlimited users. Cancel any time.";

	return (
		<Section id="pricing" scheme="sheet" className="overflow-hidden">
			{/* Halftone scene: the one-shed operation on the left, the shopfront it
			    grows into on the right. No edge mask — the artwork's own dissolves
			    already hold it to the floor and the two margins. */}
			<AmbientLayer opacity={0.7} fullBleed>
				<PricingHalftoneScene />
			</AmbientLayer>

			<div className="relative">
				<div>
					<Eyebrow>Pricing</Eyebrow>
					<SectionHeading className="max-w-[16ch]">
						<RoughMark type="highlight">Free</RoughMark> until you outgrow it.
					</SectionHeading>
					<Lede className="max-w-[34rem]">
						Start on the free plan and upgrade the week it starts paying for itself. If
						you&rsquo;d rather be walked through it first,{" "}
						<a
							href="#book-a-demo"
							className="font-medium text-(--accent-ink) underline-offset-2 transition-colors hover:text-(--ink) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
						>
							book a demo
						</a>{" "}
						and we&rsquo;ll call you.
					</Lede>
				</div>
			</div>

			{/* mx-auto: the pair is narrower than the page column, so without it the
			    cards hang off the left edge of a wide viewport. Explicit row/column
			    placement (rather than auto-fit) is what lets the toggle occupy row 1
			    of the Business column alone while both plates still start on row 2. */}
			<div className="relative mx-auto mt-[clamp(40px,6vw,80px)] grid max-w-[64rem] grid-cols-1 gap-x-[clamp(16px,2vw,24px)] gap-y-4 md:grid-cols-2">
				{/* Billing period belongs to the plan whose figures it changes. In one
				    column it drops between the plates, so it still reads as the
				    Business card's control rather than a page-level switch. */}
				<div className="order-2 flex justify-center md:order-none md:col-start-2 md:row-start-1 md:justify-start">
					<BillingToggle annual={annual} onChange={setAnnual} />
				</div>

				{/* Free */}
				<div className="order-1 lp-lift grid content-start gap-5 md:col-start-1 md:row-start-2 rounded-2xl border border-(--rule-2) bg-(--paper) p-[clamp(24px,3vw,36px)]">
					<div>
						<p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-(--ink-3)">
							Free
						</p>
						<p className="mt-3 text-[15px] leading-[1.55] text-(--ink-2)">
							Enough to run a one-van operation and see if this fits.
						</p>
						<p className="mt-[18px] flex items-baseline gap-2">
							<span className="text-[clamp(38px,4.6vw,54px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
								$0
							</span>
							<span className="text-base text-(--ink-2)">{priceUnit}</span>
						</p>
						<p className="mt-[10px] text-[15px] text-(--ink-2)">
							Free forever. No card required.
						</p>
					</div>

					<SecondaryButton
						href="/sign-up"
						className="h-12 w-full justify-center text-base font-semibold"
					>
						Start free
					</SecondaryButton>

					<div className={GROUP}>
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

				{/* Business — the featured plate */}
				<div className="order-3 lp-lift relative grid content-start gap-5 md:col-start-2 md:row-start-2 rounded-2xl border border-(--rule-3) bg-(--paper) p-[clamp(24px,3vw,36px)]">
					<PlusCorners />
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 rounded-2xl"
						style={{
							background:
								"linear-gradient(160deg,var(--accent-wash),transparent 46%)",
						}}
					/>

					<div className="relative">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<Eyebrow>Business</Eyebrow>
							<span className="rounded-full border border-(--accent) bg-(--accent-wash) px-[11px] py-[5px] text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-(--accent-ink)">
								Most popular
							</span>
						</div>
						<p className="mt-3 text-[15px] leading-[1.55] text-(--ink-2)">
							Best value for a growing business: everything unlimited, and money
							moving through the app.
						</p>
						<p className="mt-[18px] flex items-baseline gap-2">
							<span className="text-[clamp(38px,4.6vw,54px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
								{price}
							</span>
							<span className="text-base text-(--ink-2)">{priceUnit}</span>
						</p>
						<p className="mt-[10px] text-[15px] text-(--ink-2)">{priceNote}</p>
					</div>

					<PrimaryButton
						href="/sign-up"
						className="relative h-12 w-full justify-center text-base"
					>
						Start free, upgrade later
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
		</Section>
	);
}
