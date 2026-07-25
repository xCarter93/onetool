// Class → react-native-svg prop resolver, replacing the web CSS cascade for the
// empty-state illustrations (apps/web globals.css `.ot-illo` rules, ported
// verbatim). Pure TS — no RN imports — so vitest can run it in node.

export type IlloSize = "sm" | "md" | "hero";

/** Colors injected by the component; knockout is the surface the art sits on. */
export interface IlloPalette {
	surface: string;
	line: string;
	accent: string;
	celebrate: string;
	knockout: string;
	destructive: string;
}

export interface IlloPaint {
	fill?: string;
	fillOpacity?: number;
	stroke?: string;
	strokeWidth?: number;
	strokeLinecap?: "round";
	strokeLinejoin?: "round";
	/** RN-svg takes an array, not the CSS "4 3.5" string. */
	strokeDasharray?: number[];
	opacity?: number;
}

const ILLO_CLASSES = [
	"illo-surface",
	"illo-knock",
	"illo-accent",
	"illo-accent-soft",
	"illo-celebrate",
	"illo-celebrate-soft",
	"illo-mote",
	"illo-face-left",
	"illo-face-right",
	"illo-outline",
	"illo-hair",
	"illo-dash",
	"illo-accent-line",
	"illo-celebrate-line",
	"illo-ground",
	"illo-bar",
	"illo-bar-quiet",
	"illo-bar-accent",
	"illo-on-accent",
	"illo-fill-knock",
	"illo-fill-surface",
	"illo-fill-accent-soft",
	"illo-fill-celebrate",
] as const;

export type IlloClass = (typeof ILLO_CLASSES)[number];

// `.ot-illo-sm` re-declares stroke widths so the 80x48 canvas still renders
// ~1.5px lines. Keys absent here keep the base width at every size (there is
// no hero override block in the web CSS — hero uses base widths).
const SM_STROKE_WIDTH: Partial<Record<IlloClass, number>> = {
	"illo-outline": 2.2,
	"illo-accent-line": 2.2,
	"illo-celebrate-line": 2.2,
	"illo-dash": 2.2,
	"illo-hair": 1.1,
	"illo-ground": 2,
	"illo-bar": 5,
	"illo-bar-quiet": 5,
	"illo-bar-accent": 5,
	"illo-on-accent": 1.4,
};

function basePaint(cls: IlloClass, p: IlloPalette): IlloPaint {
	switch (cls) {
		// --- fills ---
		case "illo-surface":
			return { fill: p.surface };
		case "illo-knock":
			return { fill: p.knockout };
		case "illo-accent":
			return { fill: p.accent };
		case "illo-accent-soft":
			return { fill: p.accent, opacity: 0.14 };
		case "illo-celebrate":
			return { fill: p.celebrate };
		case "illo-celebrate-soft":
			return { fill: p.celebrate, opacity: 0.16 };
		case "illo-mote":
			return { fill: p.line, opacity: 0.22 };
		case "illo-face-left":
			return { fill: p.line, opacity: 0.2 };
		case "illo-face-right":
			return { fill: p.line, opacity: 0.32 };
		// --- strokes ---
		case "illo-outline":
			return {
				fill: "none",
				stroke: p.line,
				strokeWidth: 1.5,
				strokeLinejoin: "round",
				strokeLinecap: "round",
			};
		case "illo-hair":
			return {
				fill: "none",
				stroke: p.line,
				strokeWidth: 0.75,
				strokeLinecap: "round",
				opacity: 0.55,
			};
		case "illo-dash":
			return {
				fill: "none",
				stroke: p.line,
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeDasharray: [4, 3.5],
				opacity: 0.55,
			};
		case "illo-accent-line":
			return {
				fill: "none",
				stroke: p.accent,
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			};
		case "illo-celebrate-line":
			return {
				fill: "none",
				stroke: p.celebrate,
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			};
		case "illo-ground":
			return {
				fill: "none",
				stroke: p.line,
				strokeWidth: 1.5,
				strokeLinecap: "round",
				opacity: 0.2,
			};
		// --- content bars (skeleton text; drawn as <line>, so no fill key) ---
		case "illo-bar":
			return {
				stroke: p.line,
				strokeWidth: 4,
				strokeLinecap: "round",
				opacity: 0.3,
			};
		case "illo-bar-quiet":
			return {
				stroke: p.line,
				strokeWidth: 4,
				strokeLinecap: "round",
				opacity: 0.16,
			};
		case "illo-bar-accent":
			return { stroke: p.accent, strokeWidth: 4, strokeLinecap: "round" };
		case "illo-on-accent":
			return {
				fill: "none",
				stroke: p.knockout,
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			};
		// --- fill overrides for stroked shapes (merged last on the web too) ---
		case "illo-fill-knock":
			return { fill: p.knockout };
		case "illo-fill-surface":
			return { fill: p.surface };
		case "illo-fill-accent-soft":
			return { fill: p.accent, fillOpacity: 0.14 };
		case "illo-fill-celebrate":
			return { fill: p.celebrate, fillOpacity: 0.16 };
	}
}

/**
 * Resolves a web `className` string (one class, or space-separated as in
 * "illo-accent-line illo-fill-knock") into RN-svg props. Later classes win on
 * conflicting keys — same as the web stylesheet's source order, where the
 * `illo-fill-*` overrides come last.
 *
 * Inline `style={{ strokeWidth, opacity }}` overrides from the web art beat
 * everything (including the sm re-declares) — pass those as explicit JSX props
 * AFTER spreading this result.
 */
export function resolvePaint(
	className: string,
	size: IlloSize,
	palette: IlloPalette,
): IlloPaint {
	const out: IlloPaint = {};
	for (const cls of className.split(/\s+/).filter(Boolean)) {
		if (!(ILLO_CLASSES as readonly string[]).includes(cls)) {
			throw new Error(`Unknown illustration class: ${cls}`);
		}
		const paint = basePaint(cls as IlloClass, palette);
		if (size === "sm") {
			const sm = SM_STROKE_WIDTH[cls as IlloClass];
			if (sm !== undefined && paint.strokeWidth !== undefined) {
				paint.strokeWidth = sm;
			}
		}
		Object.assign(out, paint);
	}
	return out;
}
