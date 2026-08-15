/**
 * COMPETITOR PRICING — source data for the landing Compare section.
 *
 * Every number here is a LIST price read from the vendor's own pricing page on
 * `RETRIEVED_AT`, or (for OneTool) from this repo. Nothing is estimated,
 * averaged, or extrapolated: if a vendor does not publish a figure, the
 * calculator returns `null` and the table renders an em dash. That is the rule
 * that keeps this section defensible — see
 * `.planning/landing-redesign-2026-08/DIRECTION.md` ("Compare-section data
 * caveats") and `competitor-pricing.json`.
 *
 * BILLING BASIS (disclosed in the section's footnote): competitors are quoted
 * at the annual-billing rate their pricing page displays by default — their
 * cheapest published number. OneTool is quoted month-to-month at $30, its
 * higher price. The comparison is deliberately tilted toward the competitor.
 *
 * Jobber's plan prices, seat allowances and extra-seat fee were re-fetched
 * verbatim from https://www.getjobber.com/pricing/ on 2026-08-14 to settle a
 * discrepancy between two earlier reads. Today's fetch confirms:
 * Core "1 user" · Connect "Includes 5 users" · Grow "Includes 10 users" ·
 * Plus "Includes 15 users", each with "Add users for $29/mo each".
 */

export const RETRIEVED_AT = "2026-08-14";
/** Human-facing form of RETRIEVED_AT, used in the footnote. */
export const RETRIEVED_LABEL = "Aug 14, 2026";

export type VendorKey = "onetool" | "jobber" | "housecall" | "servicetitan";

export type PricingModel = "flat-per-org" | "per-user" | "quote-only";

export interface CompetitorPlan {
	name: string;
	/** Base price per month, at the vendor's `quotedBilling` period. */
	basePrice: number;
	/** Seats the base price covers. "unlimited" = priced per organisation. */
	includedSeats: number | "unlimited";
	/**
	 * Published monthly price of a seat beyond `includedSeats`. `null` means
	 * the vendor does not sell extra seats on this plan, or does not publish
	 * their price — either way, bigger crews are NOT computable here.
	 */
	extraSeatFee: number | null;
}

export interface Vendor {
	key: VendorKey;
	name: string;
	isUs: boolean;
	pricingModel: PricingModel;
	/** "Quote-only" vendors get an em-dash column, never a computed price. */
	quoteOnly: boolean;
	/** Short label for the "Billed" row. */
	billedLabel: string;
	/** Which billing period the quoted `basePrice` figures belong to. */
	quotedBilling: "monthly" | "annual";
	/** Suffix printed under the plan name, e.g. "billed annually". */
	quotedBillingLabel: string;
	plans: CompetitorPlan[];
	sourceUrl: string;
	retrievedAt: string;
	notes: string[];
}

/** Fallback price. The pricing section prefers live Clerk `usePlans` data; the
 *  Compare table is deliberately static so the comparison never moves under a
 *  reader mid-scroll. Keep in sync with `pricing-section.tsx`. */
export const ONETOOL_MONTHLY = 30;

export const VENDORS: Vendor[] = [
	{
		key: "onetool",
		name: "OneTool",
		isUs: true,
		pricingModel: "flat-per-org",
		quoteOnly: false,
		billedLabel: "Per organisation",
		quotedBilling: "monthly",
		quotedBillingLabel: "month-to-month",
		plans: [
			{
				name: "Business",
				basePrice: ONETOOL_MONTHLY,
				includedSeats: "unlimited",
				extraSeatFee: null,
			},
		],
		sourceUrl: "/#pricing",
		retrievedAt: RETRIEVED_AT,
		notes: [
			"$30/month, or $300/year. There is also a permanent Free plan.",
			"$30 is the hardcoded fallback in pricing-section.tsx; at runtime that section prefers live Clerk plan data. Confirm the live Clerk price before changing this number.",
		],
	},
	{
		key: "jobber",
		name: "Jobber",
		isUs: false,
		pricingModel: "per-user",
		quoteOnly: false,
		billedLabel: "Per user",
		quotedBilling: "annual",
		quotedBillingLabel: "billed annually",
		plans: [
			{ name: "Core", basePrice: 29, includedSeats: 1, extraSeatFee: 29 },
			{ name: "Connect", basePrice: 99, includedSeats: 5, extraSeatFee: 29 },
			{ name: "Grow", basePrice: 149, includedSeats: 10, extraSeatFee: 29 },
			{ name: "Plus", basePrice: 399, includedSeats: 15, extraSeatFee: 29 },
		],
		sourceUrl: "https://www.getjobber.com/pricing/",
		retrievedAt: RETRIEVED_AT,
		notes: [
			"Re-verified verbatim on 2026-08-14: Core $49/mo no commitment, $39/mo 1-year commitment, $29/mo billed annually, '1 user'; Connect $139/$119/$99, 'Includes 5 users'; Grow $199/$169/$149, 'Includes 10 users'; Plus $499/$439/$399, 'Includes 15 users'. Every plan: 'Add users for $29/mo each'.",
			"Annual-billing figures are used here — Jobber's cheapest published column.",
			"Add-ons priced separately: Marketing Suite $99/mo, Receptionist $29/mo, Pipeline $49/mo.",
		],
	},
	{
		key: "housecall",
		name: "Housecall Pro",
		isUs: false,
		pricingModel: "per-user",
		quoteOnly: false,
		billedLabel: "Per user",
		quotedBilling: "annual",
		quotedBillingLabel: "billed annually",
		plans: [
			// Extra seats are a MAX-plan capability, and MAX's per-extra-user
			// price is not published — so no plan here can absorb an extra seat.
			{ name: "Basic", basePrice: 59, includedSeats: 1, extraSeatFee: null },
			{ name: "Essentials", basePrice: 149, includedSeats: 5, extraSeatFee: null },
			{ name: "MAX", basePrice: 299, includedSeats: 8, extraSeatFee: null },
		],
		sourceUrl: "https://www.housecallpro.com/pricing/",
		retrievedAt: RETRIEVED_AT,
		notes: [
			"Annual-billing rates $59 / $149 / $299 (vs $79 / $189 / $329 monthly). Seat allowances 1 / 5 / 8 come from Housecall Pro's own machine-readable summary, https://www.housecallpro.com/llm-info/.",
			"'Additional users are available on the MAX plan' — the per-additional-user price is not published, so crews above 8 are not computable and render an em dash.",
		],
	},
	{
		key: "servicetitan",
		name: "ServiceTitan",
		isUs: false,
		pricingModel: "quote-only",
		quoteOnly: true,
		billedLabel: "Per technician",
		quotedBilling: "annual",
		quotedBillingLabel: "not published",
		plans: [],
		sourceUrl: "https://www.servicetitan.com/pricing",
		retrievedAt: RETRIEVED_AT,
		notes: [
			"All three tiers (Starter, Essentials, The Works) show 'Request Pricing' — no dollar figure is published anywhere on the page, so no cell in this column can be filled in.",
			"The page states 'Our per-technician pricing is designed to fit your business'.",
		],
	},
];

export function vendor(key: VendorKey): Vendor {
	const found = VENDORS.find((v) => v.key === key);
	if (!found) throw new Error(`Unknown vendor: ${key}`);
	return found;
}

/** Crew sizes offered by the stepper. */
export const CREW_SIZES = [1, 2, 3, 4, 5, 6, 8, 10] as const;
export type CrewSize = (typeof CREW_SIZES)[number];
export const DEFAULT_CREW: CrewSize = 4;

/** cost(crew) = base + max(0, crew − includedSeats) × extraSeatFee.
 *  `null` when the vendor publishes no way to price that crew on this plan. */
function planCost(plan: CompetitorPlan, crew: number): number | null {
	if (plan.includedSeats === "unlimited") return plan.basePrice;
	if (crew <= plan.includedSeats) return plan.basePrice;
	if (plan.extraSeatFee === null) return null;
	return plan.basePrice + (crew - plan.includedSeats) * plan.extraSeatFee;
}

export interface VendorQuote {
	planName: string;
	monthly: number;
}

/**
 * The cheapest published configuration for a crew of `crew` — we always give
 * the vendor their best number, and name the plan it came from. `null` when no
 * published plan can cover that crew (quote-only vendors, or Housecall Pro
 * above 8 people).
 */
export function quoteFor(v: Vendor, crew: number): VendorQuote | null {
	if (v.quoteOnly) return null;
	let best: VendorQuote | null = null;
	for (const plan of v.plans) {
		const monthly = planCost(plan, crew);
		if (monthly === null) continue;
		if (best === null || monthly < best.monthly) {
			best = { planName: plan.name, monthly };
		}
	}
	return best;
}

export interface RivalQuote extends VendorQuote {
	name: string;
}

/** Cheapest per-seat rival at this crew size, over computable cells only. */
export function cheapestRival(crew: number): RivalQuote | null {
	let best: RivalQuote | null = null;
	for (const v of VENDORS) {
		if (v.isUs || v.quoteOnly) continue;
		const q = quoteFor(v, crew);
		if (!q) continue;
		if (best === null || q.monthly < best.monthly) {
			best = { ...q, name: v.name };
		}
	}
	return best;
}

/* ------------------------------------------------------------------ features */

export type FeatureCell =
	/** Included in the plan shown. `label` adds published detail. */
	| { kind: "included"; label?: string }
	/** Costs extra: gated to a named tier, or sold as an add-on. */
	| { kind: "tier"; label: string }
	/** A plain published fact (seat allowances, support terms). */
	| { kind: "text"; label: string }
	/** Not published on their pricing page — renders an em dash. */
	| { kind: "unpublished" };

export interface FeatureRow {
	label: string;
	cells: Record<VendorKey, FeatureCell>;
}

/**
 * Rows are chosen so every cell traces to a published statement. "—" means
 * "not published on their pricing page" (stated in the legend), never "they
 * can't do it" — several of these vendors may well ship the feature without
 * listing it. Phone support is conceded to Jobber and Housecall Pro.
 * There is deliberately NO card-processing-rate row: OneTool's application fee
 * is unpublished, so it is the one row we could not fill in honestly.
 */
export const FEATURE_ROWS: FeatureRow[] = [
	{
		label: "Users included",
		cells: {
			onetool: { kind: "included", label: "Unlimited" },
			jobber: { kind: "text", label: "1–15 by plan" },
			housecall: { kind: "text", label: "1–8 by plan" },
			servicetitan: { kind: "text", label: "Per technician" },
		},
	},
	{
		label: "E-signatures included",
		cells: {
			onetool: { kind: "included", label: "Unlimited" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "unpublished" },
			servicetitan: { kind: "unpublished" },
		},
	},
	{
		label: "Online card payments",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "included", label: "2.9% + 30¢" },
			housecall: { kind: "included", label: "From 2.59%" },
			servicetitan: { kind: "unpublished" },
		},
	},
	{
		label: "Route planning",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "tier", label: "Essentials plan" },
			servicetitan: { kind: "unpublished" },
		},
	},
	{
		label: "Workflow automations",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "tier", label: "Grow plan" },
			housecall: { kind: "tier", label: "Essentials plan" },
			servicetitan: { kind: "unpublished" },
		},
	},
	{
		label: "AI import from CSV",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "unpublished" },
			servicetitan: { kind: "unpublished" },
		},
	},
	{
		label: "Offline iOS app",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "unpublished" },
			servicetitan: { kind: "unpublished" },
		},
	},
	{
		label: "Phone support",
		cells: {
			onetool: { kind: "text", label: "Email, 24h SLA" },
			jobber: { kind: "included" },
			housecall: { kind: "included" },
			servicetitan: { kind: "unpublished" },
		},
	},
];

/* ------------------------------------------------------- non-calculator note */

/** Vendors we can name but cannot compute — no published base price. */
export const NON_CALCULATOR_MENTIONS = [
	{
		name: "Workiz",
		note: "publishes $55–$65 per extra member per month, but no base price for any tier",
		sourceUrl: "https://www.workiz.com/pricing-plans/",
		retrievedAt: RETRIEVED_AT,
	},
] as const;

/** Sources linked from the footnote row. */
export const FOOTNOTE_SOURCES = [
	{ name: "Jobber", url: vendor("jobber").sourceUrl },
	{ name: "Housecall Pro", url: vendor("housecall").sourceUrl },
	{ name: "ServiceTitan", url: vendor("servicetitan").sourceUrl },
	{ name: "Workiz", url: NON_CALCULATOR_MENTIONS[0].sourceUrl },
] as const;
