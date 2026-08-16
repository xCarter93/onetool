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
 * BILLING BASIS (disclosed in the section's footnote): EVERY vendor, us
 * included, is quoted month-to-month — the no-commitment rate, and the number a
 * visitor actually sees on Jobber's page, which loads on Monthly. One cadence
 * across all five columns is the apples-to-apples comparison and the one a
 * reader can reproduce without discovering a toggle.
 *
 * Be honest about what changed on 2026-08-16: this basis is NOT tilted toward
 * the competitor the way the old annual basis was. Jobber and Housecall Pro
 * both publish cheaper annual rates a buyer could take, and the footnote says
 * so out loud with their numbers — that disclosure is load-bearing, do not drop
 * it to tighten the copy. OneTool's own annual ($300/yr) is disclosed with it.
 *
 * ServiceTitan was dropped from this table on 2026-08-16. It publishes no
 * figure anywhere — every tier is "Request Pricing" — so its column was em
 * dashes end to end, carrying no information while eating a fifth of the table
 * width. It is not hidden for being expensive; there is simply nothing to
 * quote. The `quote-only` pricing model and the `quoteOnly` flag went with it,
 * since it was the only vendor that used them.
 *
 * ── 2026-08-16 correction ────────────────────────────────────────────────────
 * The 2026-08-14 read of Jobber was WRONG, and wrong in Jobber's favour. Jobber
 * gates its pricing page behind a "Team size" selector (Just me · 2-5 people ·
 * 6-10 people · 11-15 people · 16 or more). Both the prices AND the bundled
 * seat count change with the bucket, and which plans are offered changes too.
 * The old read took the prices from the "Just me" bucket and paired them with
 * seat allowances (5 / 10 / 15) that belong to the larger buckets, then let a
 * $29/seat formula fill the gaps — so a crew of four was quoted $99 when Jobber
 * actually quotes that crew $149 (annual) / $199 (monthly). Plans are now
 * `seatBand`-scoped so each crew size is priced from the bucket Jobber itself
 * puts it in, which is exactly reproducible by anyone who loads the page.
 */

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
	/**
	 * Published monthly price of a seat beyond `includedSeats`. `null` means
	 * the vendor does not sell extra seats on this plan, or does not publish
	 * their price — either way, bigger crews are NOT computable here.
	 */
	extraSeatFee: number | null;
	/**
	 * Crew-size bucket this plan+price is offered in, when the vendor's pricing
	 * page is gated by a team-size selector (Jobber). A plan is simply not
	 * quotable outside its band. Absent = the plan is offered at every crew size
	 * (Housecall Pro).
	 */
	seatBand?: { min: number; max: number };
}

export interface Vendor {
	key: VendorKey;
	name: string;
	isUs: boolean;
	/** How the vendor charges. Informational — the table no longer renders it:
	 *  a "Billed: per user" row contradicted the whole-crew total directly above
	 *  it (Jobber at six people is $299/mo total, not $299 per user), so the row
	 *  was dropped 2026-08-16. Keep the field; it is what the copy is written
	 *  from. Do not put it back in the table as a bare label. */
	pricingModel: PricingModel;
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
 *  reader mid-scroll. Keep in sync with `pricing.tsx`. */
export const ONETOOL_MONTHLY = 30;

export const VENDORS: Vendor[] = [
	{
		key: "onetool",
		name: "OneTool",
		isUs: true,
		pricingModel: "flat-per-org",
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
			"$30 is the hardcoded fallback in sections/pricing.tsx; at runtime that section prefers live Clerk plan data. Confirm the live Clerk price before changing this number.",
			"Client portal ships on every plan: apps/web routes /portal/c/[clientPortalId]/{quotes,invoices} with OTP verification, quote approval, e-signature and card payment.",
			"Seats are uncapped: lib/planLimits.ts caps only clients (10) and active projects per client (3) on the free plan, never users.",
			"Card payments run through Stripe Connect on the org's own Stripe account, so the org pays Stripe's rate directly (US standard online card is 2.9% + 30¢). OneTool adds a flat application fee of $1 per transaction on top — portal/invoicesActions.ts sets application_fee_amount from STRIPE_APPLICATION_FEE_CENTS, read as 100 off the deployment on 2026-08-16. It is env-driven, so re-read it before changing the table. Both Jobber and Joby publish the bare Stripe rate with no markup, so this is the one row where we are the most expensive.",
		],
	},
	{
		key: "jobber",
		name: "Jobber",
		isUs: false,
		pricingModel: "per-user",
		quotedBilling: "monthly",
		quotedBillingLabel: "month-to-month",
		// Read bucket-by-bucket off getjobber.com/pricing on 2026-08-16, toggling
		// Team size and Billing. basePrice = the MONTHLY no-commitment rate, which
		// is what the page shows on load; the annual rate is recorded in `notes`.
		// Core exists ONLY in the "Just me" bucket; Plus does not exist there.
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
		notes: [
			"Read verbatim on 2026-08-16, one team-size bucket at a time (monthly / billed-annually). 'Just me', each card marked '1 user': Core $49/$29, Connect $139/$99, Grow $199/$149 — no Plus card. '2-5 people', each '/Includes 5 users/': Connect $199/$149, Grow $299/$229, Plus $499/$399 — no Core card. '6-10 people', each 'Includes 10 users': Connect $299/$229, Grow $399/$299, Plus $599/$449. '11-15 people', each 'Includes 15 users': Connect $399/$299, Grow $499/$399, Plus $699/$529. '16 or more' replaces every price with 'Let's chat' / Contact Sales and hides the billing toggle.",
			"Month-to-month figures are used here. Jobber's page loads on Monthly and its monthly cards read 'No commitment'. The annual column is genuinely cheaper — by bucket: Core $29; Connect $99 / $149 / $229 / $299; Grow $149 / $229 / $299 / $399; Plus $399 / $449 / $529 — and the section footnote discloses that.",
			"Jobber DOES still publish extra seats: the '?' beside 'Includes N users' reads 'A user is anyone who accesses your account at the office or in the field to view or manage the team's schedule. Add users for $29/mo each.' We deliberately do NOT apply that $29 across buckets to synthesise a cheaper configuration (e.g. Core + 5 add-on seats for a crew of six). Jobber's page does not offer the lower-bucket plans to a larger crew, so the bucket price is what that crew is actually quoted — and quoting anything else would not be reproducible by a reader loading the page.",
			"Add-ons priced separately: Marketing Suite $99/mo, Receptionist $29/mo, Pipeline $49/mo — as read on /pricing/. NOTE a live self-contradiction in Jobber's own copy: /features/ prices Marketing Suite at $79/mo. Neither number is used in any table cell; if one is ever quoted, say which page it came from.",
			"Card-processing rate IS published — on https://www.getjobber.com/features/ under 'Get Paid', not on /pricing/ (a direct browser read of the pricing page on 2026-08-16 found no rate on it at all). Verbatim: 'Card payments … Rate: 2.9% + 30¢ / transaction' and 'ACH bank payments … Rate: 1% / transaction', alongside 'Online payments are included with your Jobber account with no additional monthly or set up fees—you only pay when you get paid.' Jobber Payments is Stripe-powered (stripe.com/newsroom/news/jobber), so that is the plain Stripe rate with no visible markup. A help-centre snippet suggests card-PRESENT rates vary by plan (2.5% Grow / 2.7% Connect / 2.9% Core) — the table quotes the published online-card headline rate.",
			"Customer portal is published as 'Client Hub' — getjobber.com/features/ describes customers entering card details 'in client hub' to pay an invoice.",
			"Offline mobile work shipped 2026-03-18 — productupdates.getjobber.com/134787: job forms, visit details and notes, and time tracking save locally and sync when back online.",
		],
	},
	{
		key: "housecall",
		name: "Housecall Pro",
		isUs: false,
		pricingModel: "per-user",
		quotedBilling: "monthly",
		quotedBillingLabel: "month-to-month",
		plans: [
			// basePrice = the MONTHLY rate. Housecall Pro's toggle defaults to Annual,
			// so unlike Jobber this is NOT their default view — it is the cadence
			// every other column is on, and the footnote names their annual rate.
			// Extra seats are a MAX-plan capability, and MAX's per-extra-user
			// price is not published — so no plan here can absorb an extra seat.
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
		notes: [
			"Re-verified 2026-08-16 and UNCHANGED. Monthly rates $79 / $189 / $329 are quoted here; annual is $59 / $149 / $299, and the page's own billing toggle defaults to Annual. Seat allowances 1 / 5 / 8 come from Housecall Pro's own machine-readable summary, https://www.housecallpro.com/llm-info/, which states 'Basic - 1 user', 'Essentials - includes 5 users', 'MAX - includes 8 users' and dates itself 'As of July 2026'.",
			"'Additional users are available on the MAX plan' — the per-additional-user price is not published, so crews above 8 are not computable and render an em dash.",
			"The pricing page now leads with a 'Get the right plan' wizard and only reveals the plan cards after it; the card prices above are still in the page payload and match llm-info.",
			"Customer portal is published as 'Customer Portal', with its own feature page (housecallpro.com/features/customer-portal/) and help-centre collection: customers view past and upcoming appointments, view and pay invoices, and message the business. It is not named in the pricing page's per-plan feature lists, so no tier gating is claimed.",
			"'Included in every Housecall Pro plan' band lists: live phone and chat support, card processing rates as low as 2.59%, free iOS/Android app, and OFFLINE VIEWING.",
			"Feature tiers on the pricing page: Essentials adds 'Routes' (group and sequence jobs), 'Checklist automations' and QuickBooks Online sync; MAX adds 'Route optimization', open API and escalated phone support.",
		],
	},
	{
		key: "joby",
		name: "Joby",
		isUs: false,
		// The one rival on this table that prices the way we do. Kept in the
		// comparison precisely because of that — a reader who already knows Joby
		// would notice its absence, and we still win the number.
		pricingModel: "flat-per-org",
		// Joby publishes no annual rate at all, so its only figure is already the
		// month-to-month one — it needed no adjustment when the table moved off the
		// annual basis, and it is the one rival with no annual discount to concede.
		quotedBilling: "monthly",
		quotedBillingLabel: "month-to-month",
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
		notes: [
			"Read verbatim on 2026-08-16: 'Flat monthly pricing with unlimited users on every plan. 14-day free trial.' Starter $89/mo, Pro $129/mo, Grow $250/mo. No annual-billing option is published, so these ARE the cheapest published figures.",
			"Every tier says 'Unlimited users' on the plan card and in the compare grid, so the seat argument does not separate us from Joby — only the price does.",
			"'Customer self-serve portal' is checked on all three tiers in the compare grid, and joby-pay adds 'A clean, branded payment page that loads on any phone — no Joby account required'.",
			"Compare grid, read tier-by-tier: 'Estimates & e-signatures', 'Online card payments (Joby Pay / Stripe)', 'CSV import (leads & clients)' and 'Mobile app (iOS & Android)' are checked on all three tiers. 'Workflow automations (visual)' is an em dash on Starter and checked on Pro and Grow.",
			"joby.io/products/joby-pay publishes the rate outright, verbatim: 'Standard Stripe processing fees apply (2.9% + 30¢ for card, 0.8% for ACH capped at $5). There is no extra Joby fee on top — your seat price covers the platform. Enterprise customers can negotiate custom processing rates with Stripe.' Charges run through the org's own Stripe Express account, the same Connect model as ours, so Joby beats us on this row. Separately, 'Online card payments (Joby Pay / Stripe)' confirms Joby is on Stripe like us and Jobber — so the underlying cost is comparable and only the markup is unknown. Also, nothing about route planning or optimization appears — the closest published rows are 'Service-area matching' and 'Live location team tracking' ($5 per active worker/month add-on). No offline capability is claimed anywhere on the page.",
			"Support ladder is published as email support (Starter), priority support (Pro), dedicated success manager (Grow) — no phone support for customers is published, which is notable for a vendor whose product IS a phone system.",
			"Communication usage is billed on top of every plan: calls from $0.006/min local inbound, $0.015/min outbound, SMS $0.008/segment, phone numbers $1/mo local. Our table quotes the plan fee only, which is Joby's best case.",
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

/** cost(crew) = base + max(0, crew − includedSeats) × extraSeatFee, and `null`
 *  when the vendor publishes no way to price that crew on this plan — including
 *  when the crew falls outside the plan's published team-size bucket. */
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

/**
 * The cheapest published configuration for a crew of `crew` — we always give
 * the vendor their best number, and name the plan it came from. `null` when no
 * published plan can cover that crew — today that means only Housecall Pro
 * above 8 people, whose extra-seat price is unpublished.
 */
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
	/** On the roadmap, not shipped yet — OneTool only, and only where we can say so. */
	| { kind: "soon"; label?: string }
	/** Not published on their pricing page — renders an em dash. */
	| { kind: "unpublished" };

export interface FeatureRow {
	label: string;
	cells: Record<VendorKey, FeatureCell>;
}

/**
 * Rows are chosen so every cell traces to a published statement on one of the
 * vendor's own pages — usually /pricing/, but a product or features page counts
 * too (that is where Jobber's card rate, Jobber's offline post and Housecall
 * Pro's Customer Portal live). "—" means "the vendor publishes nothing we could
 * find", never "they can't do it" — several of these vendors may well ship the feature without
 * listing it. Phone support is conceded to Jobber and Housecall Pro, and as of
 * 2026-08-16 so is offline mobile: both of them ship it and we do not yet.
 * The card-processing row USED to be omitted because OneTool's application fee
 * was unpublished. It is published now — a flat $1 per transaction on top of
 * the org's own Stripe rate (STRIPE_APPLICATION_FEE_CENTS=100, read off the
 * deployment 2026-08-16; verify prod before changing it). This is the one row
 * we LOSE and it stays in on purpose: Jobber and Joby both publish the plain
 * Stripe rate with no markup on top, so we are the most expensive of the three.
 * Do not soften it, and do not "fix" it by deleting the row.
 */
export const FEATURE_ROWS: FeatureRow[] = [
	{
		label: "Users included",
		cells: {
			onetool: { kind: "included", label: "Unlimited" },
			jobber: { kind: "text", label: "1–15 by team size" },
			housecall: { kind: "text", label: "1–8 by plan" },
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
		// A row every vendor wins — deliberately. A reader looking at a $30 tool
		// assumes it cannot have the client-facing surface the $200 tools have, and
		// a tie says otherwise better than a claim would. Each vendor ships one
		// under its own name; the names are in the per-vendor notes rather than the
		// cells, so the row reads as a level check rather than four brand labels.
		label: "Customer portal",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "included" },
			housecall: { kind: "included" },
			joby: { kind: "included" },
		},
	},
	{
		label: "Online card payments",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "included" },
			housecall: { kind: "included" },
			joby: { kind: "included" },
		},
	},
	{
		// Capability above, cost here — the row we lose, kept deliberately.
		// Jobber's rate is NOT on /pricing/ (a direct browser read found none
		// there); it is on /features/ under "Get Paid". Look there, not on the
		// pricing page, when re-verifying.
		label: "Card processing fee",
		cells: {
			onetool: { kind: "text", label: "Stripe + $1/txn" },
			jobber: { kind: "text", label: "2.9% + 30¢" },
			housecall: { kind: "text", label: "From 2.59%" },
			joby: { kind: "text", label: "2.9% + 30¢" },
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
		// Joby's cell says plain "CSV import" rather than "CSV import, not AI":
		// they do publish CSV import on every tier, and the row label already makes
		// the distinction. Editorialising in the cell breaks the no-mockery rule.
		label: "AI import from CSV",
		cells: {
			onetool: { kind: "included" },
			jobber: { kind: "unpublished" },
			housecall: { kind: "unpublished" },
			joby: { kind: "text", label: "CSV import" },
		},
	},
	{
		label: "Offline mobile app",
		cells: {
			// apps/mobile has no offline code today — the PRD exists, the feature
			// does not. Anything but "coming soon" here would be a false claim.
			onetool: { kind: "soon" },
			jobber: { kind: "included", label: "Forms, visits, time" },
			housecall: { kind: "included", label: "Viewing only" },
			joby: { kind: "unpublished" },
		},
	},
	{
		label: "Phone support",
		cells: {
			onetool: { kind: "text", label: "Email, 24h SLA" },
			jobber: { kind: "included" },
			housecall: { kind: "included" },
			joby: { kind: "text", label: "Email; priority on Pro" },
		},
	},
];

/* ------------------------------------------------------- non-calculator note */

/** Vendors we can name but cannot compute — no published base price. */
export const NON_CALCULATOR_MENTIONS = [
	{
		name: "Workiz",
		note: "shows 'Request pricing' on all three tiers (Standard, Pro, Ultimate) and publishes only $55–$65 per extra member per month",
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
