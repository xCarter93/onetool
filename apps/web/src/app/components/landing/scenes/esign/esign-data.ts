/**
 * A-101 act 2 — the data script and the choreography table.
 *
 * Every string here is a real value from the documented portal vocabulary
 * (quote-detail-island / quote-paper / approval-rail / approval-receipt). None
 * of it is invented: the annotation rule ("carries real information or it does
 * not exist") applies to product copy inside a miniature exactly as it applies
 * to a dimension string.
 */

import type { Guide } from "@/lib/blueprint/geometry";

/* ---------------------------------------------------------------------------
 * The quote
 * ------------------------------------------------------------------------- */

export const QUOTE = {
	number: "Q-1042",
	title: "Spring cleanup + seasonal mowing",
	business: "Northside Lawn & Landscape",
	client: "Marisol Vega",
	sentOn: "Mar 4, 2026",
	validUntil: "Apr 12, 2026",
	approvedAt: "Mar 4, 2026 at 2:15 PM",
	total: "$4,850.00",
} as const;

/**
 * Three line items summing to the quote total. Rate is not rendered in the
 * miniature (four numeric columns at this scale is soup) — quantity and line
 * total are, and they reconcile: 950.00 + 3,500.00 + 400.00 = 4,850.00.
 */
export const LINE_ITEMS = [
	{
		item: "Spring cleanup — beds, edging, haul-away",
		qty: "1",
		total: "$950.00",
	},
	{ item: "Weekly mowing (Apr–Oct)", qty: "28", total: "$3,500.00" },
	{ item: "Mulch install — 6 cu yd", qty: "6", total: "$400.00" },
] as const;

/* ---------------------------------------------------------------------------
 * The journey timeline
 *
 * Exact step labels from the portal's buildJourneySteps: the pending set while
 * the client is deciding, the accepted set once they have signed.
 * ------------------------------------------------------------------------- */

export type JourneyStep = {
	label: string;
	meta?: string;
	state: "complete" | "current" | "upcoming";
};

export const JOURNEY_PENDING: readonly JourneyStep[] = [
	{ label: "Quote sent", meta: QUOTE.sentOn, state: "complete" },
	{ label: "Awaiting your decision", state: "current" },
	{ label: "Accepted or declined", state: "upcoming" },
];

export const JOURNEY_ACCEPTED: readonly JourneyStep[] = [
	{ label: "Quote sent", meta: QUOTE.sentOn, state: "complete" },
	{ label: "Reviewed by client", state: "complete" },
	{ label: "Accepted", meta: `Signed by ${QUOTE.client}`, state: "complete" },
];

/* ---------------------------------------------------------------------------
 * Blueprint layer
 *
 * A quiet lattice in the pixel-mapped regime (percentage coordinates, no
 * viewBox) so the dash rhythm is literal at every width. Lines terminate
 * raggedly and the opaque miniature occludes the ones that cross it — the
 * lattice is construction under the drawing, never wallpaper behind text.
 * ------------------------------------------------------------------------- */

export const ESIGN_LATTICE: Guide[] = [
	{ x1: "6%", y1: "10%", x2: "6%", y2: "74%" },
	{ x1: "17%", y1: "0%", x2: "17%", y2: "46%" },
	{ x1: "50%", y1: "18%", x2: "50%", y2: "100%" },
	{ x1: "83%", y1: "0%", x2: "83%", y2: "54%" },
	{ x1: "94%", y1: "28%", x2: "94%", y2: "90%" },
	{ x1: "0%", y1: "24%", x2: "57%", y2: "24%" },
	{ x1: "35%", y1: "63%", x2: "100%", y2: "63%" },
	{ x1: "11%", y1: "87%", x2: "71%", y2: "87%" },
];

/* ---------------------------------------------------------------------------
 * Choreography (seconds)
 *
 * Every value is a CSS `--bp-delay` on a `.bp-*` class from globals.css, so the
 * whole sequence inherits the reduced-motion terminal-state override and the
 * <noscript> floor for free. The scene has ZERO Motion islands — the only JS is
 * <DrawIn>'s one IntersectionObserver.
 *
 * The stamp lands BEFORE the receipt and the status flips, not after: the beat
 * order is what makes the stamp read as the cause of the outcome rather than a
 * sticker applied to it.
 * ------------------------------------------------------------------------- */

export const T = {
	/** Portal chrome bar. */
	chrome: 0.12,
	/** Hero card — status, quote number, total. */
	hero: 0.24,
	/** Quote journey card. */
	journey: 0.36,
	/** The quote paper itself. */
	paper: 0.46,
	/** The signing block. */
	sign: 0.58,
	/** The signature writes itself. Linear pen travel, 1s (see SIGNATURE_MS). */
	signature: 0.95,
	/** Terms checkbox ticks. */
	check: 2.05,
	/** Approve quote -> Approving… */
	approving: 2.25,
	/** THE STAMP. One beat of ink settling. */
	stamp: 2.6,
	/** Receipt replaces the signing block. */
	receipt: 2.85,
	/** Hero badge: Awaiting decision -> Accepted. */
	badge: 3,
	/** Timeline completes to Accepted · Signed by Marisol Vega. */
	journeyDone: 3.14,
} as const;

/** Duration of the signature wipe. Mirrored in the scoped keyframe. */
export const SIGNATURE_MS = 1000;
