import { HalftoneDash } from "./halftone-dash";

/* The page's one halftone-scene chassis. Every section that carries a halftone
 * field renders its own artwork through THIS component, which owns the dash
 * tuning, the canvas sizes and the accent inking — so the scenes stay a family
 * and can only differ in what they depict. The renderer itself (row dashes,
 * pointer light) lives in halftone-dash.tsx.
 *
 * Opacity is deliberately NOT a prop here: sections dial the whisper through
 * their AmbientLayer, and a second knob on the clusters would double-dim. */

export const uri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/* The two grayscale ramps every scene draws with — `g` = soft terrain and
 * planting, `h` = built structure.
 *
 * `h` is deliberately almost flat and almost black. Dash length tracks how DARK
 * the artwork is, so a structure painted with a wide light-to-dark ramp gets
 * near-zero dashes along its top edge — which is precisely the edge that makes
 * a silhouette readable. Keeping `h` dark end to end means a roofline lands as
 * a hard step in the dash field instead of fading out. `g` keeps the wide ramp,
 * because ground and planting SHOULD dissolve upward. */
export const DEFS = `
	<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#c2c2c2"/><stop offset="1" stop-color="#141414"/>
	</linearGradient>
	<linearGradient id="h" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#3c3c3c"/><stop offset="1" stop-color="#0a0a0a"/>
	</linearGradient>`;

/* Horizontal dissolve overlays: each cluster fades to white — i.e. to no
 * dashes — toward the middle of the page, so the two corners never close ranks
 * behind the copy. Paired with fade="top" below, the field ends up living in
 * the floor and the two side margins. */
export const FADE_L = `<linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
		<stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
		<stop offset="1" stop-color="#fff" stop-opacity="1"/>
	</linearGradient>`;
export const FADE_R = `<linearGradient id="f" x1="1" y1="0" x2="0" y2="0">
		<stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
		<stop offset="1" stop-color="#fff" stop-opacity="1"/>
	</linearGradient>`;

/** Canvas the scene artwork is authored against. Fixed so every scene lands at
 *  the same dash pitch and the same footprint in its band. */
export const LEFT_BOX = { w: 620, h: 430 };
export const RIGHT_BOX = { w: 720, h: 430 };

/* Ported from Twenty's halftone config via the hero — shared verbatim so a
 * tweak here moves every scene at once. */
export const TUNING = {
	cellRatio: 2,
	power: 1.1,
	minTone: 0.05,
	light: 0.9,
	lightRadius: 0.55,
	fade: "top",
} as const;

export function HalftoneCorners({
	left,
	right,
}: {
	/** Omit to run a right-only scene (a band whose left side is spoken for). */
	left?: string;
	right: string;
}) {
	return (
		<div aria-hidden="true" className="absolute inset-0 overflow-hidden">
			{/* Hidden on phones: at that width the left cluster sits under the copy
			    rather than beside it, and the right one carries the scene alone. */}
			{left ? (
				<HalftoneDash
					src={left}
					rows={34}
					{...TUNING}
					className="pointer-events-none absolute bottom-0 left-0 hidden aspect-[620/430] w-[clamp(260px,38vw,720px)] text-(--accent) md:block"
				/>
			) : null}
			<HalftoneDash
				src={right}
				rows={38}
				{...TUNING}
				className="pointer-events-none absolute bottom-0 right-0 aspect-[720/430] w-[clamp(220px,44vw,840px)] text-(--accent)"
			/>
		</div>
	);
}
