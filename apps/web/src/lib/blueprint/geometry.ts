/**
 * Blueprint geometry — pure, server-safe path builders and lattice helpers for
 * the marketing drafting language.
 *
 * Two rules this module exists to enforce:
 *  1. Anything that draws on ships as `<path d>`. `pathLength` on `<rect>` /
 *     `<circle>` / `<ellipse>` has a broken Safari history, so the primitives
 *     never emit those for drawable marks — they call the builders here.
 *  2. Path `d` strings are precomputed at module scope by consumers, not
 *     rebuilt per render. These functions are cheap enough to call at module
 *     scope in a scene file.
 *
 * No React, no DOM, no randomness that is not seeded — hand-varied jitter must
 * be deterministic or SSR and the client disagree.
 */

export type Point = readonly [number, number];

export type Guide = {
	x1: number | string;
	y1: number | string;
	x2: number | string;
	y2: number | string;
};

/* ---------------------------------------------------------------------------
 * Dash rhythms
 *
 * Reads as "construction guide" rather than "dotted border": short dash, long
 * gap. Always paired with strokeLinecap="butt" — round caps turn dashes into
 * beads. In a scaled viewBox these lengths scale with the drawing even when
 * vector-effect pins the stroke width, so keep dashed lattices pixel-mapped.
 * ------------------------------------------------------------------------- */
export const BP_DASH = {
	/** Extension / projection lines. */
	guide: "4 6",
	/** Hidden-work convention: a lane that exists but is not taken. */
	hidden: "6 4",
	/** Centre line, long-short-long. */
	centre: "10 3 2 3",
	/**
	 * ISO 04.1 centre line at hero scale. The short `centre` rhythm reads as a
	 * generic dotted border once a drawing is a few hundred units across; the
	 * long dash is what makes it a centre line.
	 */
	centreLong: "24 3 1 3",
	/** Long dash for datum / axis lines. */
	axis: "10 4",
} as const;

/* ---------------------------------------------------------------------------
 * Path builders
 * ------------------------------------------------------------------------- */

/** Axis-aligned rectangle as a path, so it can carry `pathLength`. */
export function rectPath(x: number, y: number, w: number, h: number): string {
	return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

/**
 * Rounded rectangle as a path. `r` is clamped to half the shorter side so a
 * generous radius on a small card degrades to a stadium rather than inverting.
 */
export function roundedRectPath(
	x: number,
	y: number,
	w: number,
	h: number,
	r = 0,
): string {
	const k = Math.max(0, Math.min(r, Math.min(w, h) / 2));
	if (k === 0) return rectPath(x, y, w, h);
	return [
		`M ${x + k} ${y}`,
		`H ${x + w - k}`,
		`A ${k} ${k} 0 0 1 ${x + w} ${y + k}`,
		`V ${y + h - k}`,
		`A ${k} ${k} 0 0 1 ${x + w - k} ${y + h}`,
		`H ${x + k}`,
		`A ${k} ${k} 0 0 1 ${x} ${y + h - k}`,
		`V ${y + k}`,
		`A ${k} ${k} 0 0 1 ${x + k} ${y}`,
		"Z",
	].join(" ");
}

/** Circle as a path (two arcs) — `pathLength`-safe everywhere. */
export function circlePath(cx: number, cy: number, r: number): string {
	return [
		`M ${cx - r} ${cy}`,
		`A ${r} ${r} 0 0 1 ${cx + r} ${cy}`,
		`A ${r} ${r} 0 0 1 ${cx - r} ${cy}`,
		"Z",
	].join(" ");
}

/**
 * Point on a circle. SVG angle convention: 0deg is +x, 90deg is +y — which is
 * DOWN the screen, so "increasing angle" is clockwise visually.
 */
export function polarPoint(
	cx: number,
	cy: number,
	r: number,
	deg: number,
): Point {
	const t = (deg * Math.PI) / 180;
	return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}

/**
 * Arc between two angles on a circle, for drawings struck from real construction
 * geometry rather than eyeballed curves.
 *
 * `sweep: 1` travels in the direction of increasing angle (clockwise on screen);
 * the large-arc flag is derived from the normalised travel, so callers never
 * have to reason about it. `move: false` drops the leading `M` so the arc can
 * continue an open subpath whose current point is already the start.
 */
export function arcBetweenAngles(
	cx: number,
	cy: number,
	r: number,
	fromDeg: number,
	toDeg: number,
	{ sweep = 1, move = true }: { sweep?: 0 | 1; move?: boolean } = {},
): string {
	const [x1, y1] = polarPoint(cx, cy, r, fromDeg);
	const [x2, y2] = polarPoint(cx, cy, r, toDeg);
	const raw = sweep === 1 ? toDeg - fromDeg : fromDeg - toDeg;
	const travel = ((raw % 360) + 360) % 360;
	const large = travel > 180 ? 1 : 0;
	const arc = `A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
	return move ? `M ${x1} ${y1} ${arc}` : arc;
}

/**
 * Half the chord that a line parallel to a diameter, `offset` from the centre,
 * cuts from a circle — i.e. how far along the axis that offset line meets the
 * circumference. This is the tangency/intersection solve behind a drafted part
 * whose flats run into a struck circle. Returns 0 when the line misses.
 */
export function offsetChordHalf(r: number, offset: number): number {
	const d = r * r - offset * offset;
	return d > 0 ? Math.sqrt(d) : 0;
}

/** Straight segment as a path. */
export function linePath(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): string {
	return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/** Open polyline as a path. */
export function polylinePath(points: readonly Point[]): string {
	if (points.length === 0) return "";
	const [first, ...rest] = points;
	return `M ${first[0]} ${first[1]}` + rest.map(([x, y]) => ` L ${x} ${y}`).join("");
}

/**
 * Orthogonal elbow between two nodes — the edge grammar of the automations
 * canvas, drafted. `axis: "h"` leaves horizontally and arrives vertically.
 * Miter joins (set on the primitive) are what make it read as drafted.
 */
export function elbowPath(from: Point, to: Point, axis: "h" | "v" = "h"): string {
	const [x1, y1] = from;
	const [x2, y2] = to;
	const mid = axis === "h" ? (x1 + x2) / 2 : (y1 + y2) / 2;
	return axis === "h"
		? `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`
		: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`;
}

/* ---------------------------------------------------------------------------
 * Lattices
 * ------------------------------------------------------------------------- */

/**
 * A terminating guide lattice. Guides must end raggedly — a lattice that runs
 * edge to edge under the copy reads as graph-paper wallpaper, not construction.
 *
 * `inset` pulls every line short of the frame; `skip` drops a run of lines to
 * open a clear zone. Coordinates land on half pixels so 1px strokes stay crisp
 * at dpr 1 in the pixel-mapped regime.
 */
export function lattice({
	width,
	height,
	step = 40,
	inset = 0,
	orientation = "both",
}: {
	width: number;
	height: number;
	step?: number;
	inset?: number;
	orientation?: "vertical" | "horizontal" | "both";
}): Guide[] {
	const guides: Guide[] = [];
	if (orientation !== "horizontal") {
		for (let x = step; x < width; x += step) {
			const px = Math.round(x) + 0.5;
			guides.push({ x1: px, y1: inset, x2: px, y2: height - inset });
		}
	}
	if (orientation !== "vertical") {
		for (let y = step; y < height; y += step) {
			const py = Math.round(y) + 0.5;
			guides.push({ x1: inset, y1: py, x2: width - inset, y2: py });
		}
	}
	return guides;
}

/**
 * Extension guides that project from a shape's edges out to the sheet margin —
 * the honest version of a lattice: every line measures something real.
 */
export function projectionGuides(
	box: { x: number; y: number; w: number; h: number },
	{ left = 0, right = 0, top = 0, bottom = 0 } = {},
): Guide[] {
	const guides: Guide[] = [];
	if (left) guides.push({ x1: box.x - left, y1: box.y, x2: box.x, y2: box.y });
	if (right)
		guides.push({
			x1: box.x + box.w,
			y1: box.y + box.h,
			x2: box.x + box.w + right,
			y2: box.y + box.h,
		});
	if (top) guides.push({ x1: box.x, y1: box.y - top, x2: box.x, y2: box.y });
	if (bottom)
		guides.push({
			x1: box.x + box.w,
			y1: box.y + box.h,
			x2: box.x + box.w,
			y2: box.y + box.h + bottom,
		});
	return guides;
}

/** The four corners of a box, for vertex ticks. */
export function boxVertices(box: {
	x: number;
	y: number;
	w: number;
	h: number;
}): Point[] {
	return [
		[box.x, box.y],
		[box.x + box.w, box.y],
		[box.x + box.w, box.y + box.h],
		[box.x, box.y + box.h],
	];
}

/* ---------------------------------------------------------------------------
 * Revision cloud
 * ------------------------------------------------------------------------- */

const signedArea = (p: readonly Point[]) =>
	p.reduce((s, [x, y], i) => {
		const [nx, ny] = p[(i + 1) % p.length];
		return s + (x * ny - nx * y);
	}, 0) / 2;

/**
 * Regular scalloped arc chain around a closed polygon. Regular, never wobbly —
 * rough.js-style jitter is off-limits in this language.
 *
 * `r = bump * 0.62` is the sweet spot: at bump/2 the arcs flatten into a chain,
 * above ~0.7 * bump SVG auto-scales the radius and the bulges go inconsistent.
 * The signedArea sweep flip is required or a counter-clockwise polygon scallops
 * inward and reads as a gear.
 *
 * At most ONE revision cloud per page — it is the loudest blueprint signifier.
 */
export function revisionCloud(points: readonly Point[], bump = 14): string {
	if (points.length < 2) return "";
	const pts: Point[] = [];
	const closed = [...points, points[0]];
	for (let i = 0; i < closed.length - 1; i++) {
		const [ax, ay] = closed[i];
		const [bx, by] = closed[i + 1];
		const len = Math.hypot(bx - ax, by - ay);
		const n = Math.max(1, Math.round(len / bump));
		for (let k = 0; k < n; k++) {
			pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
		}
	}
	const r = bump * 0.62;
	const sweep = signedArea(points) > 0 ? 0 : 1;
	let d = `M ${pts[0][0]} ${pts[0][1]}`;
	for (let i = 1; i <= pts.length; i++) {
		const [x, y] = pts[i % pts.length];
		d += ` A ${r} ${r} 0 0 ${sweep} ${x} ${y}`;
	}
	return `${d} Z`;
}

/* ---------------------------------------------------------------------------
 * Determinism
 * ------------------------------------------------------------------------- */

/**
 * mulberry32 — a seeded PRNG for hand-varied marks (a vertex nudged a hair off
 * true, a varied dash phase). Math.random() here is a guaranteed hydration
 * mismatch; every jitter in this system runs through a literal seed.
 */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Deterministic +/- `amount` offsets for a list of points. */
export function seededJitter(
	points: readonly Point[],
	amount = 0.75,
	seed = 20260728,
): Point[] {
	const rand = seededRandom(seed);
	return points.map(([x, y]) => [
		x + (rand() - 0.5) * 2 * amount,
		y + (rand() - 0.5) * 2 * amount,
	]);
}

/* ---------------------------------------------------------------------------
 * viewBox <-> HTML bridging
 * ------------------------------------------------------------------------- */

/**
 * Convert a viewBox coordinate to CSS percentages so an HTML label can be
 * anchored to SVG geometry. Valid only while the svg is `w-full h-auto` with
 * the default uniform preserveAspectRatio (`none` breaks this and everything
 * else — never use it).
 */
export function viewBoxPercent(
	at: Point,
	viewBox: readonly [number, number],
): { left: string; top: string } {
	return {
		left: `${(at[0] / viewBox[0]) * 100}%`,
		top: `${(at[1] / viewBox[1]) * 100}%`,
	};
}

/** Midpoint of a dimension run, offset to where its value string belongs. */
export function dimensionAnchor(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	offset = 0,
): Point {
	return [(x1 + x2) / 2, (y1 + y2) / 2 + offset];
}
