/**
 * A-501 — the data script for the system diagram.
 *
 * This is the trade's own single-line diagram: labelled blocks in swimlanes,
 * connected by runs. There is NO UI miniature here — the A-101 scenes above
 * already show three faithful product miniatures, and a fourth at plate scale
 * was illegible.
 *
 * EVERY EDGE IS A REAL FLOW. The main line's tags are the product's own status
 * values (quotes: draft → sent → approved, invoices: draft → sent → paid,
 * tasks: pending → completed — packages/backend/convex/schema.ts). The dashed
 * runs use the automation vocabulary verbatim: the trigger label "Status
 * changes" (automations/lib/node-types.ts) and the action name "Create task"
 * (packages/backend/convex/lib/workflowTypes.ts). The assistant tap is
 * `runReport` on invoices grouped by month — literally "revenue by month"
 * (packages/backend/convex/assistantTools.ts).
 *
 * The entities are the page's ONE job, carried from G-001 and A-101: quote
 * Q-1042 for $4,850.00, signed by Marisol Vega, first visit Tue 9:00 AM,
 * invoice INV-1042.
 *
 * Never name a key or prop `ref` — reserved in React 19, and it breaks the RSC
 * prerender of this exact section. `refCode` is the house name for a record id.
 */

import type { Guide, Point } from "@/lib/blueprint/geometry";
import { lattice, polylinePath, rectPath } from "@/lib/blueprint/geometry";

/* ---------------------------------------------------------------------------
 * Plate geometry
 *
 * The plate is a fixed-aspect box at lg and up, so one viewBox describes it
 * exactly: block outlines are authored in these units and every HTML label is
 * positioned at a viewBox percentage of the same box. Nothing is measured at
 * runtime. Below lg the drawing is replaced by the stacked run (STACK below).
 * ------------------------------------------------------------------------- */

export const VIEW_BOX = [1200, 580] as const;

/** Left header column — the swimlane name column. */
const HEADER_X = 150;
/** Right end of every lane rule. Margins are bounded and labelled, never blank. */
const RUN_X = 1180;

/** Lane boundaries, top to bottom. */
const LANE_Y = [96, 248, 392, 546] as const;

/** Vertical centre of each lane. */
const LANE_MID = [166, 320, 464] as const;

/** Main-line block box. */
const BW = 128;
const BH = 68;
/** Supporting-system block box — those names are longer. */
const SW = 150;

/** Column centres. Pitch 258 across the four stations of the run. */
const COL = [240, 498, 756, 1014] as const;

/* ---------------------------------------------------------------------------
 * Lanes
 * ------------------------------------------------------------------------- */

export type Lane = {
	readonly id: string;
	readonly name: string;
	readonly note: string;
	readonly at: Point;
};

export const LANES: readonly Lane[] = [
	{
		id: "office",
		name: "Office",
		note: "Your workspace",
		at: [24, LANE_MID[0]],
	},
	{
		id: "client",
		name: "Client",
		note: "Their own portal",
		at: [24, LANE_MID[1]],
	},
	{
		id: "background",
		name: "Background",
		note: "Runs without you",
		at: [24, LANE_MID[2]],
	},
];

/** Lane rules plus the header-column rule. Construction ink, solid, thin. */
export const LANE_RULES: readonly Guide[] = [
	...LANE_Y.map((y) => ({ x1: 24, y1: y, x2: RUN_X, y2: y })),
	{ x1: HEADER_X, y1: LANE_Y[0], x2: HEADER_X, y2: LANE_Y[3] },
];

/** Registration ticks where the header rule crosses each lane rule. */
export const RULE_NODES: readonly Point[] = LANE_Y.map((y) => [HEADER_X, y]);
/** The office/client boundary is the live one — the rest stay hollow. */
export const LIVE_NODE = 1;

/**
 * The section cut between your side of the job and the client's. Hatching marks
 * a REGION, never a background: 18 × 1030 units is 2.7% of the plate.
 */
export const CUT_BAND = rectPath(
	HEADER_X,
	LANE_Y[1] - 18,
	RUN_X - HEADER_X,
	18,
);

/* ---------------------------------------------------------------------------
 * Blocks
 *
 * Small drafted rectangles: a tracked-caps name and one line of real detail.
 * Not cards — no chrome, no buttons, no status pills.
 * ------------------------------------------------------------------------- */

export type Block = {
	readonly id: string;
	readonly name: string;
	readonly detail: string;
	/** Outline path. */
	readonly d: string;
	/** Label anchor — the box centre. */
	readonly at: Point;
	/** Label width as a percentage of the plate, so text tracks the geometry. */
	readonly widthClass: string;
	/** Seconds. */
	readonly delay: number;
};

function mainBlock(
	id: string,
	name: string,
	detail: string,
	col: number,
	lane: number,
	delay: number,
): Block {
	return {
		id,
		name,
		detail,
		d: rectPath(COL[col] - BW / 2, LANE_MID[lane] - BH / 2, BW, BH),
		at: [COL[col], LANE_MID[lane]],
		widthClass: "w-[10%]",
		delay,
	};
}

function supportBlock(
	id: string,
	name: string,
	detail: string,
	col: number,
	delay: number,
): Block {
	return {
		id,
		name,
		detail,
		d: rectPath(COL[col] - SW / 2, LANE_MID[2] - BH / 2, SW, BH),
		at: [COL[col], LANE_MID[2]],
		widthClass: "w-[11.5%]",
		delay,
	};
}

/** The main line, in flow order. */
export const MAIN_BLOCKS: readonly Block[] = [
	mainBlock("client", "Client", "Vega Property Group", 0, 0, 0.14),
	mainBlock("quote", "Quote", "Q-1042 · $4,850.00", 1, 0, 0.3),
	mainBlock("esign", "E-sign", "Signed · Marisol Vega", 1, 1, 0.46),
	mainBlock("schedule", "Schedule", "First visit · Tue 9:00 AM", 2, 0, 0.62),
	// The conversion is the fact worth carrying here: `createFromQuote`
	// (packages/backend/convex/invoices.ts) only accepts an approved quote and
	// only ever makes one invoice from it.
	mainBlock("invoice", "Invoice", "INV-1042 · from Q-1042", 3, 0, 0.78),
	mainBlock("paid", "Paid", "$4,850.00 · card", 3, 1, 0.94),
];

/** The supporting systems, second register. */
export const SUPPORT_BLOCKS: readonly Block[] = [
	supportBlock("inbox", "Inbox", "One thread per client", 0, 1.05),
	supportBlock("automations", "Automations", "Quote sent → approved", 1, 1.15),
	supportBlock("assistant", "Assistant", "Revenue by month", 3, 1.25),
];

/* ---------------------------------------------------------------------------
 * Edges
 *
 * Solid = a hand-off you make. Dashed = a run that happens on its own. That is
 * the product's own edge grammar (components/flow/edge-style.ts: solid = built
 * and configured), held here so the two sheets agree.
 *
 * `at`/`align` place each tag clear of every rule and every box — a label
 * sitting on a lane rule is the one thing this language does not permit.
 * ------------------------------------------------------------------------- */

export type Edge = {
	readonly id: string;
	readonly d: string;
	/** Arrowhead stub at the terminus, so the marker appears with the run. */
	readonly head: string;
	/** A second head at the origin, for a two-way run. */
	readonly tail?: string;
	readonly label: string;
	readonly at: Point;
	readonly align: "start" | "end" | "above";
	readonly labelClass: string;
	readonly dashed: boolean;
	readonly delay: number;
	readonly labelDelay: number;
};

/**
 * A 6-unit stub along the run's final heading, drawn as its own element.
 *
 * The arrow marker has to live on something other than the drawn run: markers
 * are not affected by strokeDasharray, so a marker on a `.bp-draw` path is
 * painted at full strength before its line exists.
 */
const HEAD_LEN = 6;

function stub(points: readonly Point[], atEnd: boolean): string {
	const [a, b] = atEnd
		? [points[points.length - 2], points[points.length - 1]]
		: [points[1], points[0]];
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len = Math.hypot(dx, dy) || 1;
	return `M ${b[0] - (dx / len) * HEAD_LEN} ${b[1] - (dy / len) * HEAD_LEN} L ${b[0]} ${b[1]}`;
}

function edge(
	spec: Omit<Edge, "d" | "head" | "tail"> & {
		points: readonly Point[];
		twoWay?: boolean;
	},
): Edge {
	const { points, twoWay, ...rest } = spec;
	return {
		...rest,
		d: polylinePath(points),
		head: stub(points, true),
		tail: twoWay ? stub(points, false) : undefined,
	};
}

export const EDGES: readonly Edge[] = [
	edge({
		id: "draft",
		points: [
			[COL[0] + BW / 2, LANE_MID[0]],
			[COL[1] - BW / 2, LANE_MID[0]],
		],
		label: "Draft",
		at: [369, 158],
		align: "above",
		labelClass: "max-w-[7rem]",
		dashed: false,
		delay: 0.24,
		labelDelay: 0.5,
	}),
	edge({
		id: "quote-sent",
		points: [
			[COL[1], LANE_MID[0] + BH / 2],
			[COL[1], LANE_MID[1] - BH / 2],
		],
		label: "Sent",
		at: [514, 243],
		align: "start",
		labelClass: "max-w-[7rem]",
		dashed: false,
		delay: 0.4,
		labelDelay: 0.66,
	}),
	edge({
		id: "approved",
		points: [
			[COL[1] + BW / 2, LANE_MID[1]],
			[612, LANE_MID[1]],
			[612, LANE_MID[0]],
			[COL[2] - BW / 2, LANE_MID[0]],
		],
		label: "Approved",
		at: [628, 243],
		align: "start",
		labelClass: "max-w-[8rem]",
		dashed: false,
		delay: 0.56,
		labelDelay: 0.82,
	}),
	edge({
		id: "completed",
		points: [
			[COL[2] + BW / 2, LANE_MID[0]],
			[COL[3] - BW / 2, LANE_MID[0]],
		],
		label: "Completed",
		at: [885, 158],
		align: "above",
		labelClass: "max-w-[8rem]",
		dashed: false,
		delay: 0.72,
		labelDelay: 0.98,
	}),
	edge({
		id: "invoice-sent",
		points: [
			[COL[3], LANE_MID[0] + BH / 2],
			[COL[3], LANE_MID[1] - BH / 2],
		],
		label: "Sent",
		at: [1030, 243],
		align: "start",
		labelClass: "max-w-[7rem]",
		dashed: false,
		delay: 0.88,
		labelDelay: 1.14,
	}),
	edge({
		id: "email",
		points: [
			[COL[0], LANE_MID[0] + BH / 2],
			[COL[0], LANE_MID[2] - BH / 2],
		],
		twoWay: true,
		label: "Email out · reply in",
		at: [256, 258],
		align: "start",
		labelClass: "max-w-[8.5rem]",
		dashed: true,
		delay: 1.2,
		labelDelay: 1.34,
	}),
	edge({
		id: "trigger",
		points: [
			[COL[1], LANE_MID[1] + BH / 2],
			[COL[1], LANE_MID[2] - BH / 2],
		],
		label: "Status changes",
		at: [484, 372],
		align: "end",
		labelClass: "max-w-[9rem]",
		dashed: true,
		delay: 1.3,
		labelDelay: 1.44,
	}),
	edge({
		id: "create-task",
		points: [
			[COL[1] + SW / 2, LANE_MID[2]],
			[COL[2], LANE_MID[2]],
			[COL[2], LANE_MID[0] + BH / 2],
		],
		label: "Create task",
		at: [772, 300],
		align: "start",
		labelClass: "max-w-[8rem]",
		dashed: true,
		delay: 1.38,
		labelDelay: 1.52,
	}),
	edge({
		id: "report",
		points: [
			[COL[3], LANE_MID[1] + BH / 2],
			[COL[3], LANE_MID[2] - BH / 2],
		],
		label: "Reads invoices",
		at: [1000, 372],
		align: "end",
		labelClass: "max-w-[9rem]",
		dashed: true,
		delay: 1.46,
		labelDelay: 1.6,
	}),
];

/* ---------------------------------------------------------------------------
 * The ONE annotation device
 *
 * A single leader off the schedule block into the top margin. The crew's phone
 * is the one part of this system that is not a box on the sheet, which makes it
 * the one thing worth a note (apps/mobile/lib/agenda.ts builds the day plan).
 * ------------------------------------------------------------------------- */

export const LEADER = {
	from: [COL[2], LANE_MID[0] - BH / 2] as Point,
	bend: [COL[2] + 66, LANE_MID[0] - BH / 2 - 66] as Point,
	shoulder: 28,
	eyebrow: "Mobile",
	body: "The crew opens the same visit on their phone.",
	delay: 1.62,
	labelDelay: 1.84,
} as const;

/* ---------------------------------------------------------------------------
 * Below lg — the same diagram, stacked
 *
 * A vertical run with the transition tags between stations and the background
 * taps hanging off the station they touch. Same facts, same grammar, no
 * horizontal scroll and nothing measured.
 * ------------------------------------------------------------------------- */

export type StackTap = { readonly label: string; readonly body: string };

export type StackStep = {
	readonly id: string;
	/** The transition that leads INTO this station. */
	readonly via?: string;
	readonly name: string;
	readonly detail: string;
	readonly lane: string;
	/** Dashed taps hanging off this station. */
	readonly taps?: readonly StackTap[];
};

export const STACK: readonly StackStep[] = [
	{
		id: "client",
		name: "Client",
		detail: "Vega Property Group",
		lane: "Office",
		taps: [
			{
				label: "Inbox · email out, reply in",
				body: "Every message with this client sits in one thread.",
			},
		],
	},
	{
		id: "quote",
		via: "Draft",
		name: "Quote",
		detail: "Q-1042 · $4,850.00",
		lane: "Office",
	},
	{
		id: "esign",
		via: "Sent",
		name: "E-sign",
		detail: "Signed · Marisol Vega",
		lane: "Client portal",
		taps: [
			{
				label: "Automations · status changes",
				body: "Quote sent → approved fires the rule, which creates the task.",
			},
		],
	},
	{
		id: "schedule",
		via: "Approved",
		name: "Schedule",
		detail: "First visit · Tue 9:00 AM",
		lane: "Office",
		taps: [
			{
				label: "Mobile",
				body: "The crew opens the same visit on their phone.",
			},
		],
	},
	{
		id: "invoice",
		via: "Completed",
		name: "Invoice",
		detail: "INV-1042 · from Q-1042",
		lane: "Office",
	},
	{
		id: "paid",
		via: "Sent",
		name: "Paid",
		detail: "$4,850.00 · card",
		lane: "Client portal",
		taps: [
			{
				label: "Assistant · reads invoices",
				body: "Ask for revenue by month and it charts your real invoices.",
			},
		],
	},
];

/**
 * The accessible drawing. Every fact in the artwork is stated here, in flow
 * order — the SVG and its labels are aria-hidden.
 */
export const SCHEMATIC_NARRATION =
	"How one job moves through OneTool. In your workspace, the client Vega Property Group gets quote Q-1042 for $4,850.00 as a draft. The quote is sent, and it opens in the client's own portal, where Marisol Vega signs it. Once approved, the job is scheduled — first visit Tuesday at 9:00 AM, which the crew opens on their phone. When the visit is completed, invoice INV-1042 — converted from the approved quote — is sent to the same portal and paid by card, $4,850.00. Three systems run alongside: the inbox keeps every email to and from this client in one thread; an automation watches for the quote's status changing from sent to approved and creates the task; and the assistant reads your invoices to chart revenue by month.";

/* ---------------------------------------------------------------------------
 * Lattice
 *
 * Pixel-mapped (no viewBox) so `4 6` is literally 4px on and 6px off at every
 * breakpoint; the svg box clips whatever runs past the plate, which is what
 * gives the lines their ragged termination.
 * ------------------------------------------------------------------------- */

export const PLATE_LATTICE = lattice({
	width: 1280,
	height: 620,
	step: 48,
	inset: 18,
});

/** The capability index. Names only — a fabricated count is not an index. */
export const CAPABILITIES = [
	"Clients",
	"Quotes",
	"Invoices",
	"Scheduling",
	"Automations",
	"Inbox",
	"Client portal",
	"Mobile",
] as const;

/* ---------------------------------------------------------------------------
 * The capability track
 *
 * The same eight index names, regrouped into seven cards so each one carries a
 * sentence instead of only a label. Mobile is not its own card — it is the same
 * visit opened on a phone, so it belongs in the scheduling card.
 *
 * DRAFT copy. Every claim traces to shipped behaviour: BoldSign e-sign on
 * quotes, `createFromQuote` (invoices.ts) off an approved quote, portal card
 * payments over Stripe Connect, the "Status changes" trigger with the "Create
 * task" action (node-types.ts / workflowTypes.ts), and `runReport` on invoices.
 * No counts, no metrics.
 *
 * `refCode`, never `ref` — reserved in React 19, and a `ref` key spread into
 * props breaks the RSC prerender of this section.
 * ------------------------------------------------------------------------- */

export type CapabilityIcon =
	| "clients"
	| "quotes"
	| "schedule"
	| "invoices"
	| "portal"
	| "automations"
	| "inbox";

export type CapabilityCard = {
	readonly id: string;
	readonly refCode: string;
	readonly title: string;
	readonly body: string;
	readonly icon: CapabilityIcon;
};

export const CAPABILITY_CARDS: readonly CapabilityCard[] = [
	{
		id: "clients",
		refCode: "CAP 01",
		title: "Clients",
		body: "One record per client: contacts, addresses, properties and every job you have ever done for them. Nothing lives in a spreadsheet you have to remember to open.",
		icon: "clients",
	},
	{
		id: "quotes",
		refCode: "CAP 02",
		title: "Quotes & e-signatures",
		body: "Build a quote from line items with your own branding, send it for signature, and get back an approval you can act on. No printing, no chasing paper.",
		icon: "quotes",
	},
	{
		id: "schedule",
		refCode: "CAP 03",
		title: "Scheduling",
		body: "An approved quote turns into scheduled visits and tasks on the calendar. The crew opens that same visit on their phone, with the address and the notes already on it.",
		icon: "schedule",
	},
	{
		id: "invoices",
		refCode: "CAP 04",
		title: "Invoices & payments",
		body: "Convert the approved quote into an invoice off the same numbers, then take card payments through Stripe. The money lands in your own bank account.",
		icon: "invoices",
	},
	{
		id: "portal",
		refCode: "CAP 05",
		title: "Client portal",
		body: "Your clients get a portal of their own to review the quote, sign it, read the invoice and pay it — under your business name, not ours.",
		icon: "portal",
	},
	{
		id: "automations",
		refCode: "CAP 06",
		title: "Automations",
		body: "Rules watch for things like a quote moving from sent to approved, then do the next step for you — create the task, send the email. Follow-ups stop waiting on your memory.",
		icon: "automations",
	},
	{
		id: "inbox",
		refCode: "CAP 07",
		title: "Inbox & assistant",
		body: "Email to and from a client stays on one thread beside their jobs. Ask the assistant for something like revenue by month and it reads your real invoices.",
		icon: "inbox",
	},
];

/**
 * The accessible summary that precedes the track. The cards themselves are real
 * DOM text; this only states the shape of the set, which the horizontal
 * scrolling would otherwise hide.
 */
export const CAPABILITY_SUMMARY =
	"Seven capabilities, in the order one job travels through them: clients, quotes and e-signatures, scheduling, invoices and payments, the client portal, automations, and the shared inbox with the assistant.";
