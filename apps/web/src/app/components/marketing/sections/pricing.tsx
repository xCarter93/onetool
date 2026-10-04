"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";
import { BUSINESS_MONTHLY_USD, BUSINESS_YEARLY_USD } from "@/lib/plan-pricing";
import { Halftone } from "../halftone";
import { Lede, Section, SectionHeading } from "../primitives";
import { PrimaryButton, SecondaryButton } from "../buttons";
import { PLAN_MATRIX, type PlanMatrixRow } from "@onetool/backend/convex/lib/planMatrix";

// Landing wording per matrix key; values always come from PLAN_MATRIX so the two can't drift.
const LABELS: Record<string, string> = {
	clients: "Clients",
	orgMembers: "Team members",
	clientSends: "Quote and invoice sends a month",
	esignatures: "E-signature requests a month",
	assistantMessages: "AI assistant messages a day",
	savedReports: "Saved reports",
	importedRows: "AI client import rows, total",
	automationPublish: "Workflow automations",
	routing: "Route optimization",
	quickbooks: "QuickBooks sync",
	nlReportGeneration: "AI report generation",
	portalBadgeRemoval: "Client portal without the OneTool badge",
	stripeConnect: "Card payments and Stripe payouts",
	supportSla: "Support replies",
};

// Rows the usage rows already cover, plus two minor ones the landing does not need to list.
const SKIP = new Set(["aiAssistant", "llmCsvImport", "activeProjectsPerClient", "customSkus", "orgDocuments"]);

const ORDER: PlanMatrixRow["category"][] = ["Core usage", "Business tools", "Support"];
const ROWS = ORDER.flatMap((category) => PLAN_MATRIX.filter((row) => row.category === category && !SKIP.has(row.key)));

const YEAR_OF_MONTHS = BUSINESS_MONTHLY_USD * 12;
const SAVING_PCT =
	BUSINESS_YEARLY_USD < YEAR_OF_MONTHS
		? Math.round((1 - BUSINESS_YEARLY_USD / YEAR_OF_MONTHS) * 100)
		: 0;

const PLAN_LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-(--ink-3)";
const CELL = "border-b border-(--rule) px-3 py-[9px] align-middle md:px-5";
const BUSINESS_COLUMN = "border-l border-l-(--rule-3) bg-(--accent-wash)";

function Value({ value }: { value: string | boolean }) {
	if (value === true) {
		return (
			<span className="inline-flex items-center text-(--paid)">
				<Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
				<span className="sr-only">Included</span>
			</span>
		);
	}
	if (value === false) {
		return (
			<span className="text-(--ink-3)">
				<span aria-hidden="true">–</span>
				<span className="sr-only">Not included</span>
			</span>
		);
	}
	const n = Number(value);
	return <span className="tabular-nums">{Number.isNaN(n) ? value : n.toLocaleString("en-US")}</span>;
}

type Plan = {
	key: string;
	name: string;
	price: string;
	note: string;
	phoneNote: string;
	business?: boolean;
	button: ReactNode;
};

function PriceLine({ price }: { price: string }) {
	return (
		<p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
			<span className="lp-price text-(--ink)">{price}</span>
			<span className="text-sm text-(--ink-2)">/ month</span>
		</p>
	);
}

/* Phones: the table's label column would squeeze the plans to 29% each, so the summaries sit above it at full width. */
function PhonePlans({ plans }: { plans: Plan[] }) {
	return (
		<div className="grid grid-cols-2 gap-3 md:hidden">
			{plans.map((plan) => (
				<div
					key={plan.key}
					className={cn(
						"flex flex-col rounded-xl border border-(--rule-2) bg-(--sheet) p-4",
						plan.business && "border-(--rule-3) bg-(--accent-wash)",
					)}
				>
					<p className={PLAN_LABEL}>{plan.name}</p>
					<PriceLine price={plan.price} />
					<p className="mt-1.5 text-xs leading-[1.4] text-(--ink-2)">{plan.phoneNote}</p>
					<div className="mt-auto">{plan.button}</div>
				</div>
			))}
		</div>
	);
}

function PlanHead({ plan }: { plan: Plan }) {
	return (
		<th
			scope="col"
			className={cn(
				"border-b border-(--rule) px-3 pb-3 pt-5 text-left align-top font-normal md:pb-5 md:px-5",
				plan.business && cn(BUSINESS_COLUMN, "rounded-t-xl border-t border-r border-(--rule-3)"),
			)}
		>
			<p className={PLAN_LABEL}>{plan.name}</p>
			<div className="hidden md:block">
				<PriceLine price={plan.price} />
				<p className="mt-2 text-sm leading-[1.5] text-pretty text-(--ink-2)">{plan.note}</p>
				<div className="mt-4">{plan.button}</div>
			</div>
		</th>
	);
}

export function Pricing() {
	const promoActive = useLaunchPromoActive();
	const yearly = formatCurrency(BUSINESS_YEARLY_USD, { whole: true });
	const businessNote =
		SAVING_PCT > 0
			? `Or ${yearly} a year, ${SAVING_PCT}% less. No monthly limits.`
			: "One flat price per organization. No monthly limits.";
	const plans: Plan[] = [
		{
			key: "free",
			name: "Free",
			price: formatCurrency(0, { whole: true }),
			note: "Enough for a one-van operation. No time limit.",
			phoneNote: "No time limit",
			button: (
				<SecondaryButton href="/sign-up" className="w-full justify-center whitespace-nowrap">
					Start free
				</SecondaryButton>
			),
		},
		{
			key: "business",
			name: "Business",
			price: formatCurrency(BUSINESS_MONTHLY_USD, { whole: true }),
			note: businessNote,
			phoneNote: `Or ${yearly} a year, ${SAVING_PCT}% less`,
			business: true,
			button: (
				<PrimaryButton href="/sign-up" className="w-full justify-center whitespace-nowrap">
					Start free
					<ArrowRight aria-hidden="true" className="size-4 shrink-0 max-md:hidden" />
				</PrimaryButton>
			),
		},
	];

	return (
		<Section id="pricing">
			<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<SectionHeading className="mt-0 max-w-[22ch]">
					Free for a one‑van shop. One flat price for the crew.
				</SectionHeading>
				<Lede className="mt-0 max-w-[30rem]">
					Try Business for 14 days without a card. Keep Free, or pay the flat price when the
					monthly limits get in the way.
				</Lede>
			</div>

			<div className="mt-[clamp(40px,6vw,80px)]">
				<div>
					<PhonePlans plans={plans} />
					<table className="mt-5 w-full table-fixed border-separate border-spacing-0 md:mt-0">
						<caption className="sr-only">What the Free and Business plans include.</caption>
						<colgroup>
							<col className="w-[42%] md:w-[40%]" />
							<col className="w-[29%] md:w-[30%]" />
							<col className="w-[29%] md:w-[30%]" />
						</colgroup>
						<thead>
							<tr>
								<th scope="col" className="border-b border-(--rule) align-bottom">
									<span className="sr-only">Plan</span>
									<Halftone scene="vans" className="lp-pricing-art" />
								</th>
								{plans.map((plan) => (
									<PlanHead key={plan.key} plan={plan} />
								))}
							</tr>
						</thead>
						<tbody>
							{ROWS.map((row) => (
								<tr key={row.key}>
									<th scope="row" className={cn(CELL, "text-left text-sm font-normal text-(--ink-2)")}>
										{LABELS[row.key] ?? row.label}
									</th>
									<td className={cn(CELL, "text-sm text-(--ink)")}>
										<Value value={row.free} />
									</td>
									<td className={cn(CELL, BUSINESS_COLUMN, "text-sm text-(--ink)")}>
										<Value value={row.business} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<p className="mt-4 text-xs leading-[1.65] text-(--ink-2)">
						Card payments cost your Stripe rate plus {formatCurrency(1, { whole: true })} per payment. Free
						gets 10 extra sends in any month you collect one. Everything you add during the trial stays.
					</p>
					{promoActive && (
						<p className="mt-2 text-sm font-medium text-(--accent-ink)">
							Launch offer: {LAUNCH_PROMO.monthly.label.toLowerCase()} on monthly,{" "}
							{LAUNCH_PROMO.annual.label.toLowerCase()} on yearly. Claim your code at signup. Ends{" "}
							{LAUNCH_PROMO.endsLabel}.
						</p>
					)}
				</div>

			</div>
		</Section>
	);
}
