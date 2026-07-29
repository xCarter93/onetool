/**
 * G-001 hero — geometry and choreography constants.
 *
 * Every `d` string is built once at module scope, never per render (the path
 * builders are cheap but the RSC payload is not).
 *
 * The scene is deliberately built at ONE fixed card size rather than the Attio
 * 1x/2x type-scaling trick: at the widths a phone actually gives us, a scaled
 * miniature lands at 5-6px type, which is illegible rather than "small". So the
 * card keeps real, readable metrics at every breakpoint and only the LAYOUT
 * changes — a vertical spine below lg (which is also what the product's own
 * automation canvas does) and the horizontal stepped journey at lg and up.
 */

import type { Guide, Point } from "@/lib/blueprint/geometry";
import { elbowPath, linePath, roundedRectPath } from "@/lib/blueprint/geometry";

/* ---------------------------------------------------------------------------
 * Card + bracket geometry
 * ------------------------------------------------------------------------- */

export const CARD_W = 248;
export const CARD_H = 128;

/** How far the drafted construction bracket floats outside the object. */
const BRACKET_GAP = 5;

export const BRACKET_W = CARD_W + BRACKET_GAP * 2;
export const BRACKET_H = CARD_H + BRACKET_GAP * 2;
export const BRACKET_OFFSET = -BRACKET_GAP;

/**
 * The construction extents drawn around each card. Object ink (quiet zinc),
 * not sky: the card's own ring is the object edge, this is the drafted box that
 * brackets it, and construction must stay quieter than the object it measures.
 */
export const CARD_BRACKET = roundedRectPath(
	0.5,
	0.5,
	BRACKET_W - 1,
	BRACKET_H - 1,
	14,
);

/** Corners of the bracket, for the staggered vertex ticks. */
export const BRACKET_CORNERS: Point[] = [
	[0.5, 0.5],
	[BRACKET_W - 0.5, 0.5],
	[BRACKET_W - 0.5, BRACKET_H - 0.5],
	[0.5, BRACKET_H - 0.5],
];

/** One filled sky tick per card — the live control point. A field of filled ticks reads as a HUD. */
export const LIVE_CORNER = [1];

/* ---------------------------------------------------------------------------
 * Connectors
 * ------------------------------------------------------------------------- */

/** Vertical step between consecutive cards at lg — what gives the edges a real elbow. */
export const STEP = 24;
export const CONNECTOR_W = 72;
export const CONNECTOR_H = CARD_H + STEP;

/**
 * lg: an orthogonal elbow from one card's right edge to the next card's left
 * edge, one step lower. Solid = a built, configured segment — the product's own
 * edge grammar (solid built / dashed not-yet-built), so a solid run here is
 * factually correct.
 */
export const ELBOW = elbowPath(
	[0, CARD_H / 2],
	[CONNECTOR_W, CARD_H / 2 + STEP],
	"h",
);

/** Below lg: the straight vertical spine the automations canvas actually draws. */
export const SPINE_H = 48;
export const SPINE = linePath(CARD_W / 2, 0, CARD_W / 2, SPINE_H);

/* ---------------------------------------------------------------------------
 * Dimension string — the section's ONE annotation device
 * ------------------------------------------------------------------------- */

/** Full width of the lg run: three cards and two connectors. */
export const RUN_W = CARD_W * 3 + CONNECTOR_W * 2;

export const DIM_LG_VB: readonly [number, number] = [RUN_W, 46];
export const DIM_LG = { x1: 8, y1: 22, x2: RUN_W - 8, gap: 262 } as const;
export const DIM_LG_LABEL: Point = [RUN_W / 2, 22];

export const DIM_SM_VB: readonly [number, number] = [CARD_W, 52];
export const DIM_SM = { x1: 8, y1: 16, x2: CARD_W - 8, gap: 0 } as const;
export const DIM_SM_LABEL: Point = [CARD_W / 2, 32];

/** Locked copy. The dimension line's slash ticks supply the flanking rules. */
export const DIM_LABEL = "4 min, quote to paid invoice";

/* ---------------------------------------------------------------------------
 * Lattice
 *
 * Percentage coordinates in the pixel-mapped regime (no viewBox), so the dash
 * rhythm is literal at every breakpoint. Every line terminates short of the
 * frame — a lattice that runs edge to edge reads as graph-paper wallpaper, and
 * none of these run under the copy because the layer is scoped to the scene
 * stage, below the CTAs.
 * ------------------------------------------------------------------------- */

export const HERO_LATTICE: Guide[] = [
	{ x1: "8%", y1: "12%", x2: "8%", y2: "78%" },
	{ x1: "22%", y1: "0%", x2: "22%", y2: "56%" },
	{ x1: "38%", y1: "24%", x2: "38%", y2: "100%" },
	{ x1: "50%", y1: "6%", x2: "50%", y2: "68%" },
	{ x1: "64%", y1: "18%", x2: "64%", y2: "92%" },
	{ x1: "78%", y1: "0%", x2: "78%", y2: "48%" },
	{ x1: "92%", y1: "30%", x2: "92%", y2: "84%" },
	{ x1: "4%", y1: "18%", x2: "62%", y2: "18%" },
	{ x1: "30%", y1: "50%", x2: "100%", y2: "50%" },
	{ x1: "12%", y1: "82%", x2: "70%", y2: "82%" },
];

/* ---------------------------------------------------------------------------
 * Choreography (seconds)
 *
 * guides wipe -> cards draft on staggered -> vertex ticks pop -> chips flip ->
 * dimension last. Every one of these is a CSS `--bp-delay` on a `.bp-*` class,
 * so the whole sequence inherits the reduced-motion terminal-state override and
 * the <noscript> floor from globals.css for free.
 * ------------------------------------------------------------------------- */

export const T = {
	/** Bracket draw-on per card. */
	bracket: [0.2, 0.38, 0.56],
	/** Card body rise, a beat behind its own bracket. */
	body: [0.3, 0.48, 0.66],
	/** Vertex ticks, relative to the bracket that owns them. */
	ticksAfterBracket: 0.3,
	/** Edge draw-on, between the cards they join. */
	edge: [0.5, 0.68],
	/** Status chips flipping to their terminal state. */
	chip: [1.05, 1.3],
	/** The dimension string lands last. */
	dimension: 1.55,
	dimensionLabel: 1.75,
} as const;
