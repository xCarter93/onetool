/**
 * True 30° isometric projection helpers (axes at +30°/−30°, verticals stay
 * vertical) — matches the reference pack's grid.
 *
 * Every V2 scene is composed from these so all angles agree. Iso space is
 * (a, b, h): `a` runs toward the lower-right, `b` toward the lower-left,
 * `h` straight up. Units differ: a/b/w/d are iso units (scaled by `unit`),
 * while h/ht are screen px, subtracted straight off the projected y.
 *
 * Helpers return path `d` strings / transform matrices, computed once at
 * module scope — art components stay static JSX.
 */

/** tan(30°): vertical rise per horizontal unit along an iso axis. */
export const ISO_T = 0.57735;
const T = ISO_T;

export type IsoPoint = readonly [number, number];

export interface IsoGrid {
	/** Project iso (a,b,h) → screen [x,y]. */
	pt: (a: number, b: number, h: number) => IsoPoint;
	/** Closed polygon through iso points. */
	poly: (points: ReadonlyArray<readonly [number, number, number]>) => string;
	/**
	 * Axis-aligned box footprint (a,b)→(a+w,b+d) in iso units, base height h and
	 * extrusion ht in screen px.
	 * Faces: top, plus the two viewer-facing sides (left = the b+d edge,
	 * right = the a+w edge).
	 */
	box: (
		a: number,
		b: number,
		h: number,
		w: number,
		d: number,
		ht: number,
	) => { top: string; left: string; right: string; outline: string };
	/** Flat rhombus on the ground plane (shadows, floor tiles, rugs). */
	ground: (a: number, b: number, h: number, w: number, d: number) => string;
	/**
	 * Transform matrices that lay flat 2D artwork (rounded rects, bars,
	 * circles) into an iso plane. Draw children in local coords around the
	 * anchor; local units are iso units (multiply by `unit` for px). Any
	 * stroked child needs vectorEffect="non-scaling-stroke" or the transform
	 * distorts its width.
	 */
	topMatrix: (a: number, b: number, h: number) => string;
	/** Vertical plane at constant b, facing lower-left; local +x runs along +a. */
	leftMatrix: (a: number, b: number, h: number) => string;
	/** Vertical plane at constant a, facing lower-right; local +x runs along −b. */
	rightMatrix: (a: number, b: number, h: number) => string;
}

/** `unit` is screen px of horizontal travel per iso unit along an axis. */
export function isoGrid(
	originX: number,
	originY: number,
	unit: number,
): IsoGrid {
	const u = unit;
	const pt = (a: number, b: number, h: number): IsoPoint => [
		originX + (a - b) * u,
		originY + (a + b) * (u * T) - h,
	];

	const poly: IsoGrid["poly"] = (points) => {
		const d = points
			.map(([a, b, h], i) => {
				const [x, y] = pt(a, b, h);
				return `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
			})
			.join(" ");
		return `${d} Z`;
	};

	const box: IsoGrid["box"] = (a, b, h, w, d, ht) => {
		const top = poly([
			[a, b, h + ht],
			[a + w, b, h + ht],
			[a + w, b + d, h + ht],
			[a, b + d, h + ht],
		]);
		const left = poly([
			[a, b + d, h + ht],
			[a + w, b + d, h + ht],
			[a + w, b + d, h],
			[a, b + d, h],
		]);
		const right = poly([
			[a + w, b + d, h + ht],
			[a + w, b, h + ht],
			[a + w, b, h],
			[a + w, b + d, h],
		]);
		// Silhouette of the whole box, for a single crisp outer stroke.
		const outline = poly([
			[a, b, h + ht],
			[a + w, b, h + ht],
			[a + w, b, h],
			[a + w, b + d, h],
			[a, b + d, h],
			[a, b + d, h + ht],
		]);
		return { top, left, right, outline };
	};

	const ground: IsoGrid["ground"] = (a, b, h, w, d) =>
		poly([
			[a, b, h],
			[a + w, b, h],
			[a + w, b + d, h],
			[a, b + d, h],
		]);

	const mat = (
		xx: number,
		xy: number,
		yx: number,
		yy: number,
		a: number,
		b: number,
		h: number,
	) => {
		const [x, y] = pt(a, b, h);
		return `matrix(${xx} ${xy} ${yx} ${yy} ${round(x)} ${round(y)})`;
	};

	return {
		pt,
		poly,
		box,
		ground,
		// top plane: local x → a-axis, local y → b-axis
		topMatrix: (a, b, h) => mat(u, u * T, -u, u * T, a, b, h),
		// lower-left-facing plane (constant b): local x → +a, local y → down
		leftMatrix: (a, b, h) => mat(u, u * T, 0, u, a, b, h),
		// lower-right-facing plane (constant a): local x → −b, local y → down
		rightMatrix: (a, b, h) => mat(u, -u * T, 0, u, a, b, h),
	};
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}
