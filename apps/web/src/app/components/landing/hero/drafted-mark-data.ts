/**
 * G-001 — the OneTool mark, redrawn as a part detail.
 *
 * Every figure here is TRUE: the constants were pixel-scanned off the 296x296
 * mark artwork (`public/OneTool-mark.png`) and everything else is solved from
 * them, so the four dimension callouts measure the drawing rather than
 * decorating it. The mark is genuinely four primitives — one struck circle, two
 * parallel flats, one semicircular cap — which is why a construction layer is
 * earned here instead of costume.
 *
 * Coordinate space is the mark's own 296-unit space, padded out to a 340x340
 * viewBox with a negative y origin so the diameter string has sheet margin
 * above the part. HTML annotation anchors therefore go through `markAnchor()`,
 * which rebases them for <Annotation> (which assumes a 0,0 origin).
 */

import {
	arcBetweenAngles,
	circlePath,
	linePath,
	offsetChordHalf,
	polarPoint,
	type Point,
} from "@/lib/blueprint/geometry";

/* ---------------------------------------------------------------------------
 * Measured input — the only hand-entered numbers in this file
 * ------------------------------------------------------------------------- */

/** Head: a single struck circle. R73 gives the Ø146 callout. */
const HEAD = { cx: 164, cy: 102, r: 73 } as const;
/** Handle: two parallel flats 42 apart, so 21 either side of the axis. */
const HANDLE_HALF = 21;
/** The cap radius IS half the flats — true tangency, not a fitted curve. */
const CAP_R = HANDLE_HALF;
/** Head centre to cap centre, measured along the 45-degree axis. */
const AXIS_LEN = 146.4;
/** Jaw opening, 58 across. */
const NOTCH_HALF = 29;
/** The small fillet at the V root. */
const FILLET = 8;
/** SVG angles: y grows downward, so 135 is down-left and 315 is up-right. */
const AXIS_DEG = 135;
const NOTCH_DEG = 315;
/** How far construction runs past the object it measures. */
const TANGENT_EXT = 24;
const CENTRELINE_EXT = 23;

/* ---------------------------------------------------------------------------
 * Solved geometry
 * ------------------------------------------------------------------------- */

const deg = (x: number) => (Math.asin(x) * 180) / Math.PI;
const dir = (d: number): Point => polarPoint(0, 0, 1, d);
const along = (p: Point, d: number, k: number): Point => {
	const v = dir(d);
	return [p[0] + v[0] * k, p[1] + v[1] * k];
};

/** Cap centre is pinned ON the axis; the PNG scan rounds to (60, 205). */
const CAP_C = polarPoint(HEAD.cx, HEAD.cy, AXIS_LEN, AXIS_DEG);

/**
 * A flat `offset` from the centre meets the circle `asin(offset / r)` off the
 * axis — that solve is the whole reason the notch and the flats land exactly on
 * the struck circle instead of near it.
 */
const HANDLE_OFF = deg(HANDLE_HALF / HEAD.r);
const NOTCH_OFF = deg(NOTCH_HALF / HEAD.r);

/** Where the two flats run into the head. */
const S1_DEG = AXIS_DEG - HANDLE_OFF;
const S2_DEG = AXIS_DEG + HANDLE_OFF;
/** Where the jaw opens. */
const M1_DEG = NOTCH_DEG + NOTCH_OFF;
const M2_DEG = NOTCH_DEG - NOTCH_OFF;

const M1 = polarPoint(HEAD.cx, HEAD.cy, HEAD.r, M1_DEG);
const M2 = polarPoint(HEAD.cx, HEAD.cy, HEAD.r, M2_DEG);
const S2 = polarPoint(HEAD.cx, HEAD.cy, HEAD.r, S2_DEG);

/** Cap tangency points — the flats meet the cap arc at the perpendicular. */
const E1 = polarPoint(CAP_C[0], CAP_C[1], CAP_R, AXIS_DEG - 90);
const E2 = polarPoint(CAP_C[0], CAP_C[1], CAP_R, AXIS_DEG + 90);

/**
 * The V root. Both flanks sit at 45 degrees to the jaw axis, which on a
 * 45-degree axis makes them axis-aligned — the reason the notch reads square.
 */
const APEX = along(
	[HEAD.cx, HEAD.cy],
	NOTCH_DEG,
	offsetChordHalf(HEAD.r, NOTCH_HALF) - NOTCH_HALF,
);
const unit = (from: Point, to: Point): Point => {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const m = Math.hypot(dx, dy) || 1;
	return [dx / m, dy / m];
};
/** Flank travel directions, mouth -> root. */
const F1 = unit(M1, APEX);
const F2 = unit(M2, APEX);
/** Fillet tangency points, one radius back from the root along each flank. */
const T1: Point = [APEX[0] - F1[0] * FILLET, APEX[1] - F1[1] * FILLET];
const T2: Point = [APEX[0] - F2[0] * FILLET, APEX[1] - F2[1] * FILLET];

const L = (p: Point) => `L ${p[0]} ${p[1]}`;

/* ---------------------------------------------------------------------------
 * Object layer — ONE closed path, one weight, miter/butt
 *
 * Authored as a single continuous subpath so the pen draws in one consistent
 * direction: out of the jaw, clockwise round the head, down the handle, round
 * the cap, back up the far flat, round the head again, then the notch V closes
 * it. A four-path version would draw four disconnected strokes at once.
 * ------------------------------------------------------------------------- */

export const MARK_OUTLINE = [
	arcBetweenAngles(HEAD.cx, HEAD.cy, HEAD.r, M1_DEG, S1_DEG),
	L(E1),
	arcBetweenAngles(CAP_C[0], CAP_C[1], CAP_R, AXIS_DEG - 90, AXIS_DEG + 90, {
		move: false,
	}),
	L(S2),
	arcBetweenAngles(HEAD.cx, HEAD.cy, HEAD.r, S2_DEG, M2_DEG, { move: false }),
	L(T2),
	// Interior corner: the fillet turns the other way to every other arc here.
	`A ${FILLET} ${FILLET} 0 0 0 ${T1[0]} ${T1[1]}`,
	L(M1),
	"Z",
].join(" ");

/* ---------------------------------------------------------------------------
 * Construction layer — the circles the part was struck from
 * ------------------------------------------------------------------------- */

export const MARK_CONSTRUCTION = [
	/** The full R73 circle, continuing straight through the jaw opening. */
	circlePath(HEAD.cx, HEAD.cy, HEAD.r),
	/** The full R21 cap circle, including the half buried in the handle. */
	circlePath(CAP_C[0], CAP_C[1], CAP_R),
	/** Both flats run on past the cap — these double as the `42` extensions. */
	...[E1, E2].map((e) => {
		const end = along(e, AXIS_DEG, TANGENT_EXT);
		return linePath(e[0], e[1], end[0], end[1]);
	}),
	/** The notch flanks carried to their theoretical intersection, past the fillet. */
	...(
		[
			[M1, F1],
			[M2, F2],
		] as const
	).map(([m, f]) => linePath(m[0], m[1], APEX[0] + f[0] * 9, APEX[1] + f[1] * 9)),
];

/* ---------------------------------------------------------------------------
 * Centrelines — ISO 04.1, revealed by a mask wipe, never by dasharray
 *
 * `dashOffset` phases each run so a LONG dash straddles the crossing at the
 * head centre: the pattern period is 31 units, the long dash occupies 0-24, and
 * every crossing lands 12 units into one. A centre line whose crossing falls in
 * a gap is the tell that it was drawn rather than struck.
 * ------------------------------------------------------------------------- */

const AXIS_UP = polarPoint(HEAD.cx, HEAD.cy, 100, NOTCH_DEG);
const AXIS_DOWN = polarPoint(HEAD.cx, HEAD.cy, 172, AXIS_DEG);

export const MARK_CENTRELINES = [
	{
		d: linePath(
			HEAD.cx - HEAD.r - CENTRELINE_EXT,
			HEAD.cy,
			HEAD.cx + HEAD.r + CENTRELINE_EXT,
			HEAD.cy,
		),
		dashOffset: 9,
	},
	{
		d: linePath(
			HEAD.cx,
			HEAD.cy - HEAD.r - CENTRELINE_EXT,
			HEAD.cx,
			HEAD.cy + HEAD.r + CENTRELINE_EXT,
		),
		dashOffset: 9,
	},
	{
		d: linePath(AXIS_UP[0], AXIS_UP[1], AXIS_DOWN[0], AXIS_DOWN[1]),
		dashOffset: 5,
	},
] as const;

/* ---------------------------------------------------------------------------
 * Dimensions — four, all real
 * ------------------------------------------------------------------------- */

/** Diameter, dimensioned above the part off its horizontal extremes. */
const DIA_RUN_Y = -4;
export const DIM_DIA = {
	x1: HEAD.cx - HEAD.r,
	x2: HEAD.cx + HEAD.r,
	y: DIA_RUN_Y,
	value: "Ø146",
	label: [HEAD.cx, DIA_RUN_Y] as Point,
	/** Projection lines back to the two tangent points, stopping short of them. */
	extensions: [HEAD.cx - HEAD.r, HEAD.cx + HEAD.r].map((x) =>
		linePath(x, HEAD.cy - 4, x, DIA_RUN_Y - 5),
	),
};

/** Across the flats, mid-handle, arrowheads out to each flat. */
const FLATS_AT = along([HEAD.cx, HEAD.cy], AXIS_DEG, 110);
export const DIM_FLATS = {
	a: along(FLATS_AT, AXIS_DEG - 90, HANDLE_HALF),
	b: along(FLATS_AT, AXIS_DEG + 90, HANDLE_HALF),
	value: "42",
	label: along(FLATS_AT, AXIS_DEG - 90, HANDLE_HALF + 17),
};

/** Cap radius: one arrowhead on the arc, the leader aimed at the cap centre. */
const R_DEG = AXIS_DEG - 90 + 22.5;
const R_ON_ARC = polarPoint(CAP_C[0], CAP_C[1], CAP_R, R_DEG);
const R_BEND = polarPoint(CAP_C[0], CAP_C[1], 58, R_DEG);
const R_SHOULDER: Point = [R_BEND[0] + 26, R_BEND[1]];
export const DIM_RADIUS = {
	d: `M ${R_SHOULDER[0]} ${R_SHOULDER[1]} ${L(R_BEND)} ${L(R_ON_ARC)}`,
	value: `R${CAP_R}`,
	label: [R_SHOULDER[0] + 4, R_SHOULDER[1]] as Point,
};

/**
 * The axis angle, taken off a vertical reference at the axis terminus — the
 * head's own V centreline is that datum, so the reference is a real one.
 */
const ANGLE_R = 28;
export const DIM_ANGLE = {
	reference: linePath(
		AXIS_DOWN[0],
		AXIS_DOWN[1],
		AXIS_DOWN[0],
		AXIS_DOWN[1] + 46,
	),
	arc: arcBetweenAngles(AXIS_DOWN[0], AXIS_DOWN[1], ANGLE_R, 90, AXIS_DEG),
	value: "45°",
	label: polarPoint(AXIS_DOWN[0], AXIS_DOWN[1], 42, 112.5),
};

/* ---------------------------------------------------------------------------
 * Canvas
 * ------------------------------------------------------------------------- */

const MARK_ORIGIN_Y = -32;
const MARK_SIDE = 340;

export const MARK_VIEWBOX = `0 ${MARK_ORIGIN_Y} ${MARK_SIDE} ${MARK_SIDE}`;
/** Size only, for <Annotation>'s percentage bridge. */
export const MARK_VB: readonly [number, number] = [MARK_SIDE, MARK_SIDE];
/** Explicit mask region — the default objectBoundingBox region would clip. */
export const MARK_MASK_BOX = {
	x: 0,
	y: MARK_ORIGIN_Y,
	width: MARK_SIDE,
	height: MARK_SIDE,
} as const;

/** Rebase a drawing coordinate for <Annotation>, which assumes a 0,0 origin. */
export function markAnchor(at: Point): Point {
	return [at[0], at[1] - MARK_ORIGIN_Y];
}

/* ---------------------------------------------------------------------------
 * Choreography (seconds)
 *
 * construction -> centrelines (mask wipe) -> object outline -> dimensions ->
 * stamp. Every beat is a CSS `--bp-delay`, so the reduced-motion terminal state
 * and the <noscript> floor come from globals.css for free.
 * ------------------------------------------------------------------------- */

export const T_MARK = {
	/** Head circle, cap circle, the two flat extensions, the two notch flanks. */
	construction: [0, 0.12, 0.24, 0.24, 0.32, 0.32],
	centrelines: [0.44, 0.52, 0.6],
	outline: 0.78,
	/** Ø146, 42, R21, 45°. */
	dimensions: [1.5, 1.6, 1.7, 1.8],
	labels: [1.6, 1.7, 1.8, 1.9],
	stamp: 2.05,
} as const;
