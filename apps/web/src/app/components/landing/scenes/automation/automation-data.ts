/**
 * A-101 act 1 — the automation editor miniature: geometry, strings, timing.
 *
 * The whole flow column is a FIXED PIXEL composition. That is deliberate on two
 * counts:
 *
 *  1. Readability. The hero already settled this — a viewBox-scaled miniature
 *     lands at 5-6px type on a phone, which is illegible rather than "small".
 *     So the cards keep real, readable metrics at every breakpoint and the
 *     drawing simply sits in more whitespace on a wide canvas, which is exactly
 *     what the product's own canvas looks like.
 *  2. Dash rhythm. The edge layer is pixel-mapped (width/height, no viewBox), so
 *     the product's `5 4` dashes are literally 5px on and 4px off everywhere. A
 *     scaled viewBox stretches dash rhythm even with vector-effect pinning the
 *     stroke width (playbook failure mode #7).
 *
 * COL_W is 288 so the column still clears a 320px viewport inside a `px-4`
 * container with nothing to spare and nothing clipped.
 *
 * Every string below is the product's own: node titles and descriptions from
 * `automations/lib/node-types.ts` + `action-meta.ts`, branch labels from
 * `components/flow/branch-label-edge.tsx`, category pills from `action-meta.ts`.
 */

/* ---------------------------------------------------------------------------
 * Card + column geometry
 * ------------------------------------------------------------------------- */

/**
 * The product's step card is w-[280px]; 236 is the same card at miniature scale,
 * sized so the card plus the unbuilt lane beside it still clears COL_W.
 */
export const CARD_W = 236;
/** Fixed so the edge geometry is deterministic — descriptions clamp, never reflow. */
export const CARD_H = 62;

export const COL_W = 288;

/** The vertical spine. The product lays this canvas out top-to-bottom, not free-form. */
export const SPINE_X = CARD_W / 2;

/** Clearance for the floating TRIGGER eyebrow, which straddles the first card's top edge. */
const TOP_PAD = 14;
/** Spine segment between consecutive cards. */
const GAP = 40;

export const TRIGGER_Y = TOP_PAD;
export const COND_Y = TRIGGER_Y + CARD_H + GAP;

/** Where both branches leave the condition card. */
const FAN_Y = COND_Y + CARD_H;
/** The product's FAN_DROP: a short stem before the smooth-step turns into its lane. */
const FAN_DROP = 22;
export const CORNER_Y = FAN_Y + FAN_DROP;

export const EMAIL_Y = FAN_Y + 44;
export const TASK_Y = EMAIL_Y + CARD_H + GAP;
const TASK_BOTTOM = TASK_Y + CARD_H;

/**
 * The unbuilt lane. Far enough right that its terminal "+" clears the card edge
 * by a comfortable margin, close enough that its branch pill stays inside COL_W.
 */
export const FALSE_X = 258;
/** Terminal stubs are a fixed 50px in the product; 44 at this scale. */
export const FALSE_PLUS_Y = CORNER_Y + 44;
export const TERMINAL_PLUS_Y = TASK_BOTTOM + 32;

export const COL_H = TERMINAL_PLUS_Y + 16;

/** Radius of the non-interactive "+" affordance at the end of an unbuilt stub. */
export const PLUS_R = 11;

/* ---------------------------------------------------------------------------
 * Edges
 *
 * Edge language is semantic and documented in components/flow/edge-style.ts:
 * SOLID = a built, configured segment. DASHED = a segment that does not exist
 * yet. A scene that dashes a live path is simply wrong, so the false lane and
 * the two terminal stubs are the only dashed strokes here.
 * ------------------------------------------------------------------------- */

/** The product's resting edge stroke (`--flow-edge`), not a blueprint ink. */
export const FLOW_EDGE =
	"color-mix(in oklch, var(--muted-foreground) 55%, transparent)";

/** The product's not-yet-built rhythm, verbatim. */
export const FLOW_DASH = "5 4";

/** getSmoothStepPath's borderRadius on this canvas. */
const R = 12;

export const EDGES = {
	/** Trigger -> condition. */
	triggerToCondition: `M ${SPINE_X} ${TRIGGER_Y + CARD_H} L ${SPINE_X} ${COND_Y}`,
	/** The `Is true` lane keeps the spine, because its branch is the one that was built. */
	trueLane: `M ${SPINE_X} ${FAN_Y} L ${SPINE_X} ${EMAIL_Y}`,
	/** Send Email -> Create Task. */
	emailToTask: `M ${SPINE_X} ${EMAIL_Y + CARD_H} L ${SPINE_X} ${TASK_Y}`,
	/** The `Is false` lane: stem, rounded turn, lane, rounded turn, stub. */
	falseLane: [
		`M ${SPINE_X} ${FAN_Y}`,
		`V ${CORNER_Y - R}`,
		`Q ${SPINE_X} ${CORNER_Y} ${SPINE_X + R} ${CORNER_Y}`,
		`H ${FALSE_X - R}`,
		`Q ${FALSE_X} ${CORNER_Y} ${FALSE_X} ${CORNER_Y + R}`,
		`V ${FALSE_PLUS_Y - PLUS_R - 2}`,
	].join(" "),
	/** The stub past the last step — the flow can keep going, it just hasn't yet. */
	terminalStub: `M ${SPINE_X} ${TASK_BOTTOM} L ${SPINE_X} ${TERMINAL_PLUS_Y - PLUS_R - 2}`,
} as const;

/* ---------------------------------------------------------------------------
 * Content — the product's own strings
 * ------------------------------------------------------------------------- */

/** Editor top bar: the automation's real name and its published state. */
export const AUTOMATION_NAME = "Quote approved → invoice the client";
export const AUTOMATION_STATE = "Active";

/**
 * The plain-English entry framing. A landscaper reads one sentence before five
 * nodes, which is the whole point of the card.
 */
export const RULE_SENTENCE = {
	when: "a quote is approved",
	then: "send the invoice and book the first visit",
} as const;

export type AccentKey = "amber" | "violet" | "sky" | "green";

export type FlowNodeData = {
	readonly key: string;
	readonly y: number;
	readonly accent: AccentKey;
	readonly title: string;
	readonly description: string;
	/** The card's category pill. */
	readonly category: string;
	/** Floating tracked-caps label straddling the card's top edge. Trigger only. */
	readonly eyebrow?: string;
};

export const NODES: readonly FlowNodeData[] = [
	{
		key: "trigger",
		y: TRIGGER_Y,
		accent: "amber",
		title: "Status Changed",
		description: "Quote Sent → Approved",
		category: "Triggers",
		eyebrow: "Trigger",
	},
	{
		key: "condition",
		y: COND_Y,
		accent: "violet",
		title: "Total",
		description: "Total is greater than 500",
		category: "Conditions",
	},
	{
		key: "email",
		y: EMAIL_Y,
		accent: "sky",
		title: "Send Email",
		description: "Your quote is approved — invoice attached",
		category: "Communication",
	},
	{
		key: "task",
		y: TASK_Y,
		accent: "green",
		title: "Create Task",
		description: "Schedule the first service visit",
		category: "Actions",
	},
];

/** branch-label-edge.tsx's display strings. */
export const BRANCH_TRUE = "Is true";
export const BRANCH_FALSE = "Is false";

/* ---------------------------------------------------------------------------
 * Choreography (seconds)
 *
 * One <DrawIn> observer flips `.bp-in` on the scene root and every beat below is
 * a CSS `--bp-delay`, so the whole sequence inherits the reduced-motion
 * terminal-state override and the <noscript> floor from globals.css for free.
 * The single exception is the run pulse, which is Motion and carries its own
 * useReducedMotion() gate.
 *
 * cards rise -> solid edges draw on -> the unbuilt lane fades in -> branch pills
 * -> the run pulse travels the true lane, and each card's ring flips to emerald
 * as the pulse reaches it.
 * ------------------------------------------------------------------------- */

export const T = {
	/** Card bodies, in flow order. */
	card: [0.1, 0.22, 0.34, 0.46],
	/** Solid edges: trigger->condition, condition->email (true lane), email->task. */
	edge: [0.2, 0.32, 0.44],
	/** Dashed strokes never draw on — dasharray belongs to the dash, so they fade. */
	falseLane: 0.4,
	/** Branch label pills, on the fan-out corner. */
	pill: [0.46, 0.5],
	/** Terminal stubs and their "+" affordances. */
	stub: 0.55,
	/**
	 * Emerald success rings + chip flips: each card flips as the run pulse leaves
	 * it, so the ring lands on "this step is done" rather than "this step is
	 * next". Derived from RUN below — see the arithmetic there.
	 */
	ring: [0.95, 1.55, 2.15, 2.45],
} as const;

/**
 * The page's ONE marching-dash element (PRD motion budget).
 *
 * A short window of the product's own running-edge pattern (`6 4` marching to
 * -10 over 700ms linear, from flow-theme.css) travels down the true lane. It
 * parks BEHIND the first card and finishes BEHIND the last one, so it is only
 * ever seen crossing the gaps between steps — which is exactly where the product
 * shows it, and which means the resting and finished states are both invisible
 * without needing anything clipped.
 *
 * Ring timings above are `delay + (cardBottom - from) / speed`, speed being
 * (to - from) / travel = 310 / 1.75 = 177px per second.
 */
export const RUN = {
	x: SPINE_X,
	/** Stroke width. The product thickens a running edge from 1.5 to 2. */
	width: 2,
	/** Height of the travelling window. */
	window: 56,
	/** Parked behind the trigger card. */
	from: TRIGGER_Y,
	/** Parked behind the last card. */
	to: TASK_Y,
	travel: 1.75,
	delay: 0.6,
	/** The product's marching period. */
	dashPeriod: 0.7,
	/** Finite: the scene stops repainting the moment the run finishes. */
	dashPlays: 3,
	/** One dash + one gap, i.e. the product's `6 4`. */
	dashOn: 6,
	dashPeriodPx: 10,
} as const;

/* ---------------------------------------------------------------------------
 * Blueprint layer
 *
 * A quiet terminating lattice behind the whole stack. Percentage coordinates in
 * the pixel-mapped regime so the `4 6` guide rhythm is literal at every width.
 * The canvas plate and the sentence card are opaque, so guides passing behind
 * them are occluded rather than running under text (Vercel's occlusion trick).
 * ------------------------------------------------------------------------- */

export const AUTOMATION_LATTICE = [
	{ x1: "10%", y1: "6%", x2: "10%", y2: "72%" },
	{ x1: "24%", y1: "0%", x2: "24%", y2: "48%" },
	{ x1: "76%", y1: "18%", x2: "76%", y2: "94%" },
	{ x1: "90%", y1: "8%", x2: "90%", y2: "60%" },
	{ x1: "4%", y1: "22%", x2: "44%", y2: "22%" },
	{ x1: "58%", y1: "64%", x2: "97%", y2: "64%" },
] as const;
