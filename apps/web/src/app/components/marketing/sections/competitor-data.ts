/** Compare-section pricing: list prices from each vendor's own page on RETRIEVED_AT, all month-to-month; never estimated, unpublished is null. */

import { BUSINESS_MONTHLY_USD } from "@/lib/plan-pricing";

export const RETRIEVED_AT = "2026-08-16";
/** Human-facing form of RETRIEVED_AT, used in the footnote. */
export const RETRIEVED_LABEL = "Aug 16, 2026";

export type VendorKey = "onetool" | "jobber" | "housecall" | "joby";

export type PricingModel = "flat-per-org" | "per-user";

export interface CompetitorPlan {
	name: string;
	/** Base price per month, at the vendor's `quotedBilling` period. */
	basePrice: number;
	/** Seats the base price covers. "unlimited" = priced per organisation. */
	includedSeats: number | "unlimited";
	/** Monthly price per seat beyond `includedSeats`; null = not sold or not published, so bigger crews can't be priced. */
	extraSeatFee: number | null;
	/** Team-size bucket this price is offered in (Jobber gates its page by team size); absent = every crew size. */
	seatBand?: { min: number; max: number };
}

export interface Vendor {
	key: VendorKey;
	name: string;
	isUs: boolean;
	/** Informational: a bare "per user" table row contradicted the whole-crew total above it, so don't render it. */
	pricingModel: PricingModel;
	/** Which billing period the quoted `basePrice` figures belong to. */
	quotedBilling: "monthly" | "annual";
	plans: CompetitorPlan[];
	sourceUrl: string;
	retrievedAt: string;
}

export const VENDORS: Vendor[] = [
	{
		key: "onetool",
		name: "OneTool",
		isUs: true,
		pricingModel: "flat-per-org",
		quotedBilling: "monthly",
		plans: [
			{
				name: "Business",
				basePrice: BUSINESS_MONTHLY_USD,
				includedSeats: 20,
				extraSeatFee: null,
			},
		],
		sourceUrl: "/#pricing",
		retrievedAt: RETRIEVED_AT,
	},
	{
		key: "jobber",
		name: "Jobber",
		isUs: false,
		pricingModel: "per-user",
		quotedBilling: "monthly",
		// Monthly rates per Team size bucket (annual ones in competitor-notes.md); Core exists only in "Just me".
		plans: [
			{
				name: "Core",
				basePrice: 49,
				includedSeats: 1,
				extraSeatFee: null,
				seatBand: { min: 1, max: 1 },
			},
			{
				name: "Connect",
				basePrice: 139,
				includedSeats: 1,
				extraSeatFee: null,
				seatBand: { min: 1, max: 1 },
			},
			{
				name: "Grow",
				basePrice: 199,
				includedSeats: 1,
				extraSeatFee: null,
				seatBand: { min: 1, max: 1 },
			},

			{
				name: "Connect",
				basePrice: 199,
				includedSeats: 5,
				extraSeatFee: null,
				seatBand: { min: 2, max: 5 },
			},
			{
				name: "Grow",
				basePrice: 299,
				includedSeats: 5,
				extraSeatFee: null,
				seatBand: { min: 2, max: 5 },
			},
			{
				name: "Plus",
				basePrice: 499,
				includedSeats: 5,
				extraSeatFee: null,
				seatBand: { min: 2, max: 5 },
			},

			{
				name: "Connect",
				basePrice: 299,
				includedSeats: 10,
				extraSeatFee: null,
				seatBand: { min: 6, max: 10 },
			},
			{
				name: "Grow",
				basePrice: 399,
				includedSeats: 10,
				extraSeatFee: null,
				seatBand: { min: 6, max: 10 },
			},
			{
				name: "Plus",
				basePrice: 599,
				includedSeats: 10,
				extraSeatFee: null,
				seatBand: { min: 6, max: 10 },
			},

			{
				name: "Connect",
				basePrice: 399,
				includedSeats: 15,
				extraSeatFee: null,
				seatBand: { min: 11, max: 15 },
			},
			{
				name: "Grow",
				basePrice: 499,
				includedSeats: 15,
				extraSeatFee: null,
				seatBand: { min: 11, max: 15 },
			},
			{
				name: "Plus",
				basePrice: 699,
				includedSeats: 15,
				extraSeatFee: null,
				seatBand: { min: 11, max: 15 },
			},
		],
		sourceUrl: "https://www.getjobber.com/pricing/",
		retrievedAt: RETRIEVED_AT,
	},
	{
		key: "housecall",
		name: "Housecall Pro",
		isUs: false,
		pricingModel: "per-user",
		quotedBilling: "monthly",
		plans: [
			// Monthly rate though their toggle defaults to Annual; MAX's extra-seat price is unpublished.
			{ name: "Basic", basePrice: 79, includedSeats: 1, extraSeatFee: null },
			{
				name: "Essentials",
				basePrice: 189,
				includedSeats: 5,
				extraSeatFee: null,
			},
			{ name: "MAX", basePrice: 329, includedSeats: 8, extraSeatFee: null },
		],
		sourceUrl: "https://www.housecallpro.com/pricing/",
		retrievedAt: RETRIEVED_AT,
	},
	{
		key: "joby",
		name: "Joby",
		isUs: false,
		// The one rival that prices per org like us; readers who know it would notice it missing.
		pricingModel: "flat-per-org",
		// Joby publishes no annual rate, so month-to-month is its only figure.
		quotedBilling: "monthly",
		plans: [
			{
				name: "Starter",
				basePrice: 89,
				includedSeats: "unlimited",
				extraSeatFee: null,
			},
			{
				name: "Pro",
				basePrice: 129,
				includedSeats: "unlimited",
				extraSeatFee: null,
			},
			{
				name: "Grow",
				basePrice: 250,
				includedSeats: "unlimited",
				extraSeatFee: null,
			},
		],
		sourceUrl: "https://joby.io/pricing",
		retrievedAt: RETRIEVED_AT,
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

/** base + max(0, crew − includedSeats) × extraSeatFee; null when the plan can't price this crew, including outside its seatBand. */
function planCost(plan: CompetitorPlan, crew: number): number | null {
	if (plan.seatBand && (crew < plan.seatBand.min || crew > plan.seatBand.max))
		return null;
	if (plan.includedSeats === "unlimited") return plan.basePrice;
	if (crew <= plan.includedSeats) return plan.basePrice;
	if (plan.extraSeatFee === null) return null;
	return plan.basePrice + (crew - plan.includedSeats) * plan.extraSeatFee;
}

export interface VendorQuote {
	planName: string;
	monthly: number;
}

/** Cheapest published plan for this crew, so each vendor gets its best number; null when no plan covers it. */
export function quoteFor(v: Vendor, crew: number): VendorQuote | null {
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
	key: VendorKey;
	name: string;
}

/** Cheapest per-seat rival at this crew size, over computable cells only. */
export function cheapestRival(crew: number): RivalQuote | null {
	let best: RivalQuote | null = null;
	for (const v of VENDORS) {
		if (v.isUs) continue;
		const q = quoteFor(v, crew);
		if (!q) continue;
		if (best === null || q.monthly < best.monthly) {
			best = { ...q, key: v.key, name: v.name };
		}
	}
	return best;
}

/* ------------------------------------------------------------------ features */

export type FeatureCell =
	/** Included in the plan shown. `label` adds published detail. */
	| { kind: "included"; label?: string; short?: string }
	/** Costs extra: gated to a named tier, or sold as an add-on. */
	| { kind: "tier"; label: string }
	/** A plain published fact (seat allowances, support terms). */
	| { kind: "text"; label: string; short?: string }
	/** On the roadmap, not shipped yet — OneTool only, and only where we can say so. */
	| { kind: "soon"; label?: string }
	/** Not published on their pricing page; renders "Not published". */
	| { kind: "unpublished" };

export interface FeatureRow {
	label: string;
	cells: Record<VendorKey, FeatureCell>;
}

/** Every cell traces to the vendor's own published pages; "unpublished" means we found nothing, not that they lack it. */
export const FEATURE_ROWS: FeatureRow[] = [
	{
		label: "Users included",
		cells: {
			onetool: { kind: "included", label: "20" },
			jobber: { kind: "text", label: "1 to 15 by team size", short: "1 to 15" },
			housecall: { kind: "text", label: "1 to 8 by plan", short: "1 to 8" },
			joby: { kind: "included", label: "Unlimited" },
		},
	},
	{
		label: "E-signatures included",
		cells: {
			onetool: { kind: "included", label: "Unlimited" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "unpublished" },
			joby: { kind: "included" },
		},
	},
	{
		label: "Route planning",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "tier", label: "Essentials plan" },
			joby: { kind: "unpublished" },
		},
	},
	{
		label: "Workflow automations",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "tier", label: "Grow plan" },
			housecall: { kind: "tier", label: "Essentials plan" },
			joby: { kind: "tier", label: "Pro plan" },
		},
	},
	{
		// Plain "CSV import": the row label already draws the AI line, and editorializing breaks the no-mockery rule.
		label: "AI import from CSV",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "unpublished" },
			joby: { kind: "text", label: "CSV import", short: "CSV" },
		},
	},
	{
		label: "Offline mobile app",
		cells: {
			// Per the mobile-app help article; creating records, sending and route planning still need signal.
			onetool: { kind: "included", label: "Routes, tasks, signatures", short: "Routes, tasks" },
			jobber: { kind: "included", label: "Forms, visits, time", short: "Partial" },
			housecall: { kind: "included", label: "Viewing only", short: "View only" },
			joby: { kind: "unpublished" },
		},
	},
	{
		// A deliberate tie: it tells readers a cheap tool has these too, better than a claim would.
		label: "Client portal and card payments",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "included" },
			housecall: { kind: "included" },
			joby: { kind: "included" },
		},
	},
	{
		// The row we lose, kept on purpose; Jobber's rate is on /features/ ("Get Paid"), not /pricing/.
		label: "Card processing fee",
		cells: {
			onetool: { kind: "text", label: "Stripe + $1/txn", short: "Stripe rate + $1" },
			jobber: { kind: "text", label: "2.9% + 30¢", short: "2.9%+30¢" },
			housecall: { kind: "text", label: "From 2.59%", short: "From 2.59%" },
			joby: { kind: "text", label: "2.9% + 30¢", short: "2.9%+30¢" },
		},
	},
	{
		label: "Support",
		cells: {
			onetool: { kind: "text", label: "Email, replies within 24 hours", short: "Email, 24h" },
			jobber: { kind: "included", label: "Phone" },
			housecall: { kind: "included", label: "Phone" },
			joby: { kind: "text", label: "Email; priority on Pro", short: "Email" },
		},
	},
];

/* ------------------------------------------------------- non-calculator note */

/** Vendors we can name but cannot compute — no published base price. */
export const NON_CALCULATOR_MENTIONS = [
	{
		name: "Workiz",
		note: "shows “Request pricing” on all three tiers (Standard, Pro and Ultimate) and publishes only $55 to $65 per extra member per month",
		sourceUrl: "https://www.workiz.com/pricing-plans/",
		retrievedAt: RETRIEVED_AT,
	},
] as const;

/** Sources linked from the footnote row. */
export const FOOTNOTE_SOURCES = [
	{ name: "Jobber", url: vendor("jobber").sourceUrl },
	{ name: "Housecall Pro", url: vendor("housecall").sourceUrl },
	{ name: "Joby", url: vendor("joby").sourceUrl },
	{ name: "Workiz", url: NON_CALCULATOR_MENTIONS[0].sourceUrl },
] as const;
