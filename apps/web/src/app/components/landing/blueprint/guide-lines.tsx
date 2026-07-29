import { BP_DASH, type Guide } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";

const TONE = {
	guide: "stroke-bp-guide",
	strong: "stroke-bp-guide-strong",
	ink: "stroke-bp-ink",
} as const;

/**
 * Dashed construction guides. Server component, zero JS.
 *
 * Construction ink is always quieter than object ink — that hierarchy is the
 * whole reason the drawing reads as drafted rather than decorated. Guides must
 * also terminate raggedly and never run under text; give them short coordinates
 * (see `lattice({ inset })` / `projectionGuides`) or mask them away, rather than
 * running them edge to edge.
 *
 * strokeLinecap="butt" is not optional: round caps turn dashes into beads.
 *
 * Draw-on: never animate dashoffset here. Motion's pathLength overwrites
 * strokeDasharray and destroys the dash pattern outright, and a dashoffset
 * animation on a full lattice repaints the whole layer every frame. Wrap the
 * group in a clip-rect scaleX wipe instead — one transform, one layer.
 */
export function GuideLines({
	guides,
	dash = BP_DASH.guide,
	tone = "guide",
	weight = "thin",
	className,
	crisp = true,
}: {
	guides: readonly Guide[];
	/** One of BP_DASH, or a custom rhythm. Pass "none" for a solid guide. */
	dash?: string;
	tone?: keyof typeof TONE;
	weight?: "thin" | "med";
	className?: string;
	/**
	 * crispEdges kills antialiasing — correct for axis-aligned lattices, wrong
	 * for anything diagonal or curved (it staircases). Set false for diagonals.
	 */
	crisp?: boolean;
}) {
	return (
		<g
			className={cn(TONE[tone], className)}
			shapeRendering={crisp ? "crispEdges" : undefined}
			style={{
				strokeWidth: weight === "med" ? "var(--lw-med)" : "var(--lw-thin)",
			}}
			fill="none"
		>
			{guides.map((g, i) => (
				<line
					// Guides are a static, index-stable geometry list.
					key={`${g.x1},${g.y1},${g.x2},${g.y2},${i}`}
					x1={g.x1}
					y1={g.y1}
					x2={g.x2}
					y2={g.y2}
					strokeDasharray={dash === "none" ? undefined : dash}
					strokeLinecap="butt"
					vectorEffect="non-scaling-stroke"
				/>
			))}
		</g>
	);
}
