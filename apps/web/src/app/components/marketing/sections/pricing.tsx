"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePlans } from "@clerk/nextjs/experimental";
import { cn } from "@/lib/utils";
import { AmbientLayer } from "../ambient";
import { CheckItem, Eyebrow, Lede, Section, SectionHeading, PlusCorners } from "../primitives";
import { InkButton, SheetButton } from "../marketing-nav";
import { RoughMark } from "../rough-mark";

/* Pricing — comp lines 537–589. Two plates: the free tier as a hairline card,
 * Business as the page's featured card (plus-corners + accent wash). The
 * Business figures prefer the live Clerk plan and fall back to $30 / $300. */

const FREE_PLAN = [
	"Up to 10 clients",
	"3 active projects per client",
	"5 e-signatures a month",
	"Quotes and invoices as branded PDFs",
];

const BUSINESS_PLAN = [
	"Unlimited clients, projects and e-signatures",
	"Stripe Connect — card payments to your bank",
	"Custom SKUs and unlimited saved documents",
	"AI import for existing clients and projects",
	"Recurring work, routing and automations",
	"Priority support — 24-hour SLAs",
];

/* Ambient: slow ink rings under the plates. Three.js stays out of the landing's
 * first load — the chunk arrives with the section. */
const MinimalRipple = dynamic(
	() => import("@/components/react-bits/minimal-ripple"),
	{ ssr: false }
);

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

const PLAN_ITEM = "gap-[11px] text-[15px]";

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
		? `Works out at $${Math.round(yearly / 12)} a month — save 17%.`
		: "Per organisation, unlimited users. Cancel any time.";

	return (
		<Section id="pricing" scheme="sheet">
			<AmbientLayer opacity={0.1}>
				<MinimalRipple
					className="h-full w-full"
					color="#8a8782"
					hotColor="#8a8782"
					backgroundColor="transparent"
					speed={0.22}
					frequency={5}
					grain={0}
					cursorInteraction={false}
					adaptiveQuality
					dpr={1.25}
				/>
			</AmbientLayer>

			<div className="relative flex flex-wrap items-end justify-between gap-6">
				<div>
					<Eyebrow>Pricing</Eyebrow>
					<SectionHeading className="max-w-[16ch]">
						<RoughMark type="highlight">Free</RoughMark> until you outgrow it.
					</SectionHeading>
					<Lede className="max-w-[34rem]">
						Start on the free plan and upgrade the week it starts paying for itself. If
						you&rsquo;d rather be walked through it first, book a demo and we&rsquo;ll call
						you.
					</Lede>
				</div>

				<BillingToggle annual={annual} onChange={setAnnual} />
			</div>

			<div className="relative mt-[clamp(40px,6vw,80px)] grid max-w-[64rem] grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[clamp(16px,2vw,24px)]">
				{/* Free */}
				<div className="lp-lift grid content-start gap-5 rounded-2xl border border-(--rule-2) bg-(--paper) p-[clamp(24px,3vw,36px)]">
					<div>
						<p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-(--ink-3)">
							Free
						</p>
						<p className="mt-[14px] text-[clamp(38px,4.6vw,54px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
							$0
						</p>
						<p className="mt-[10px] text-[15px] text-(--ink-2)">
							Enough to run a one-van operation and see if this fits.
						</p>
					</div>

					<ul className="grid gap-[11px]">
						{FREE_PLAN.map((item) => (
							<CheckItem key={item} tone="dim" className={PLAN_ITEM}>
								{item}
							</CheckItem>
						))}
					</ul>

					<SheetButton
						href="/sign-up"
						className="mt-1.5 h-12 w-full justify-center text-base font-semibold"
					>
						Start free
					</SheetButton>
				</div>

				{/* Business — the featured plate */}
				<div className="lp-lift relative grid content-start gap-5 rounded-2xl border border-(--rule-3) bg-(--paper) p-[clamp(24px,3vw,36px)]">
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
						<Eyebrow>Business</Eyebrow>
						<p className="mt-[14px] flex items-baseline gap-2">
							<span className="text-[clamp(38px,4.6vw,54px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
								{price}
							</span>
							<span className="text-base text-(--ink-2)">{priceUnit}</span>
						</p>
						<p className="mt-[10px] text-[15px] text-(--ink-2)">{priceNote}</p>
					</div>

					<ul className="relative grid gap-[11px]">
						{BUSINESS_PLAN.map((item) => (
							<CheckItem key={item} className={PLAN_ITEM}>
								{item}
							</CheckItem>
						))}
					</ul>

					<InkButton
						href="/sign-up"
						className="relative mt-1.5 h-12 w-full justify-center text-base"
					>
						Start free, upgrade later
						<span aria-hidden="true" className="text-sm">
							→
						</span>
					</InkButton>
				</div>
			</div>
		</Section>
	);
}
