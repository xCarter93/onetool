/**
 * A-101 act 3 — transcript copy, chart geometry and choreography constants.
 *
 * Every `d` string is built once at module scope, never per render.
 *
 * Same sizing decision as the hero: ONE fixed set of readable metrics rather
 * than the Attio 1x/2x scaling trick. A scaled assistant panel lands at 6px
 * type on a phone, which is illegible rather than "small", so the panel keeps
 * real product metrics at every breakpoint and only the surrounding layout
 * changes.
 */

import type { Guide, Point } from "@/lib/blueprint/geometry";
import { CHART_CATEGORICAL } from "@/lib/chart-colors";

/* ---------------------------------------------------------------------------
 * Transcript — the exchange the product actually produces
 *
 * `runReport` supports a `month` grouping on invoices ("revenue by month"), so
 * this question really does return this card. The tool-chip label pairs are
 * verbatim from the assistant's own renderer table; the prompt is verbatim from
 * the panel's default suggestion list.
 * ------------------------------------------------------------------------- */

export const ASK_CHART = "Chart revenue by month this year";
export const ASK_OVERDUE = "Which invoices are overdue?";

export const CHIP_REPORT = {
	running: "Running a report…",
	done: "Ran a report",
} as const;

export const CHIP_INVOICES = {
	running: "Looking up invoices…",
	done: "Looked up invoices",
} as const;

/** The panel's own chrome strings. */
export const PANEL = {
	title: "Assistant",
	subtitle: "Ask about your clients, schedule, quotes, invoices, and more",
	placeholder: "Ask about your business…",
	footnote:
		"The assistant can make changes you ask for — double-check anything important.",
} as const;

/* ---------------------------------------------------------------------------
 * Report card
 * ------------------------------------------------------------------------- */

export type RevenueBar = {
	/** Axis label. */
	readonly label: string;
	/** Spoken in the sr-only summary. */
	readonly month: string;
	readonly value: number;
	readonly amount: string;
};

/** Six months of a plausible landscaping year. The sum is exactly $148,200. */
export const REVENUE: readonly RevenueBar[] = [
	{ label: "Jan", month: "January", value: 16400, amount: "$16,400" },
	{ label: "Feb", month: "February", value: 19150, amount: "$19,150" },
	{ label: "Mar", month: "March", value: 24800, amount: "$24,800" },
	{ label: "Apr", month: "April", value: 27300, amount: "$27,300" },
	{ label: "May", month: "May", value: 31600, amount: "$31,600" },
	{ label: "Jun", month: "June", value: 28950, amount: "$28,950" },
];

/** Stats/chart context, so the compact form is correct here. */
export const REVENUE_TOTAL = "$148.2K";
export const REVENUE_CATEGORIES = `${REVENUE.length} categories`;

/**
 * Bars walk CHART_CATEGORICAL by index, exactly as the product's report chart
 * does. This is the one place semantic/product colour is allowed inside the
 * miniature — the blueprint artwork around it stays zinc and sky.
 */
export const BAR_COLORS: readonly string[] = REVENUE.map(
	(_, i) => CHART_CATEGORICAL[i % CHART_CATEGORICAL.length],
);

/* Plot geometry. Uniform-scaled viewBox (never preserveAspectRatio="none"), so
   the HTML axis labels beneath stay locked to the bar centres at every width. */
export const PLOT_W = 400;
export const PLOT_H = 128;
const PLOT_TOP = 4;
const BASELINE = 122;
/** Nice round axis ceiling above the $31,600 peak. */
const AXIS_MAX = 32000;
const BAND = PLOT_W / REVENUE.length;
const BAR_W = 38;
/** radius [4,4,0,0] — the product's bar shape. */
const BAR_R = 4;

/** Bar with rounded top corners only, as a path so it stays pathLength-safe. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
	const k = Math.max(0, Math.min(r, w / 2, h));
	const round = (n: number) => Number(n.toFixed(2));
	const [bx, by, bw, bh] = [round(x), round(y), round(w), round(h)];
	return [
		`M ${bx} ${by + bh}`,
		`V ${round(by + k)}`,
		`A ${k} ${k} 0 0 1 ${round(bx + k)} ${by}`,
		`H ${round(bx + bw - k)}`,
		`A ${k} ${k} 0 0 1 ${round(bx + bw)} ${round(by + k)}`,
		`V ${round(by + bh)}`,
		"Z",
	].join(" ");
}

export const BAR_PATHS: readonly string[] = REVENUE.map((bar, i) => {
	const h = ((BASELINE - PLOT_TOP) * bar.value) / AXIS_MAX;
	return barPath(i * BAND + (BAND - BAR_W) / 2, BASELINE - h, BAR_W, h, BAR_R);
});

/**
 * Horizontal grid only, dashed "3 3", `axisLine={false}` — the product's own
 * Recharts config. The bottom rule doubles as the baseline, which is why no
 * separate axis line is drawn.
 */
export const PLOT_GRID: Guide[] = [0, 1, 2, 3, 4].map((i) => {
	const y = BASELINE - ((BASELINE - PLOT_TOP) * i) / 4;
	return { x1: 0, y1: y, x2: PLOT_W, y2: y };
});

/** Static because the scene mounts once per page — see the note in revenue-chart. */
export const STRIPE_ID_PREFIX = "a101-assistant-bar";

/* ---------------------------------------------------------------------------
 * Prose — bare, no bubble. Every figure is arithmetic on the bars above.
 * ------------------------------------------------------------------------- */

/** 28,950 / 16,400 = 1.765. */
export const ANSWER_CHART = {
	lead: "June is your strongest month so far",
	rest: " at $28,950 — up 77% from January.",
} as const;

/** 3 overdue invoices; the oldest is INV-0298, 24 days out. */
export const ANSWER_OVERDUE = {
	lead: "$6,240 across 3 invoices",
	rest: " — the oldest is 24 days out.",
} as const;

/* ---------------------------------------------------------------------------
 * Blueprint layer
 * ------------------------------------------------------------------------- */

/**
 * The scene's ONE annotation device: a leader off the report card's right edge.
 *
 * Pixel-mapped (no viewBox) and anchored to the CARD, not the stage, so the
 * geometry cannot drift as the transcript above it reflows. The svg box's
 * bottom-left corner is pinned to the card's right edge at its vertical centre,
 * which is what makes `from` the origin.
 */
export const LEADER_BOX = { w: 148, h: 112 } as const;
export const LEADER_FROM: Point = [0, LEADER_BOX.h];
export const LEADER_TO: Point = [56, 56];
export const LEADER_SHOULDER = 44;
export const LEADER_LABEL = "Your real numbers";
export const LEADER_BODY = "Pulled live from your invoices.";

/**
 * Quiet construction lattice under the panel. Percentage coordinates in the
 * pixel-mapped regime so the dash rhythm is literal at every breakpoint, and
 * every line terminates raggedly inside the frame. The panel is an opaque
 * plate, so guides passing behind it are occluded rather than clashing — the
 * lattice never runs under loose text.
 */
export const ASSISTANT_LATTICE: Guide[] = [
	{ x1: "10%", y1: "6%", x2: "10%", y2: "72%" },
	{ x1: "24%", y1: "22%", x2: "24%", y2: "96%" },
	{ x1: "46%", y1: "0%", x2: "46%", y2: "54%" },
	{ x1: "62%", y1: "16%", x2: "62%", y2: "88%" },
	{ x1: "80%", y1: "34%", x2: "80%", y2: "100%" },
	{ x1: "92%", y1: "4%", x2: "92%", y2: "62%" },
	{ x1: "4%", y1: "14%", x2: "58%", y2: "14%" },
	{ x1: "34%", y1: "48%", x2: "100%", y2: "48%" },
	{ x1: "8%", y1: "86%", x2: "68%", y2: "86%" },
];

/* ---------------------------------------------------------------------------
 * Choreography (seconds)
 *
 * ask -> chip runs -> chip resolves -> card -> bars rise -> total -> answer ->
 * leader -> second ask -> chip -> answer. Every value below is a CSS
 * `--bp-delay` on a `.bp-*` class, so the whole sequence inherits the
 * reduced-motion terminal-state override and the <noscript> floor for free.
 * ------------------------------------------------------------------------- */

export const T = {
	ask: [0.12, 2.6],
	chip: [0.38, 2.85],
	/** The terminal chip fades over the running one. */
	chipDone: [1.2, 3.55],
	card: 1.34,
	/** First bar; the rest follow on `barStep`. */
	bars: 1.52,
	barStep: 0.06,
	/** Axis labels and the summary row land with the last bar. */
	plotLabels: 1.95,
	answer: [2.1, 3.72],
	leader: 2.3,
} as const;

/**
 * How long each spinner is allowed to turn, in whole 1s `animate-spin` cycles.
 *
 * A spinner that is `infinite` keeps repainting forever behind the resolved
 * chip that covers it — factually wrong (the tool call finished) and a real
 * idle cost. These counts run past the moment each chip resolves and then stop.
 * The spin itself only starts when <DrawIn> flips `.bp-in`, so the count is
 * measured from the scene entering view, not from page load.
 */
export const SPIN_CYCLES = [2, 4] as const;
