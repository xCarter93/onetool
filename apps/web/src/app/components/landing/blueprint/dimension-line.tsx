import { BP_DASH } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";

/**
 * A dimension string: extension lines back to the measured feature, the
 * dimension run itself, and 45-degree slash ticks at each end.
 *
 * Architectural convention is slash ticks (lighter, more premium); engineering
 * convention is filled arrowheads (more legible small). Slashes are the default;
 * arrows are for the one or two hero measurements on the page.
 *
 * This component draws GEOMETRY ONLY. The value string is real DOM text placed
 * by an <Annotation> — SVG <text> does not wrap, ignores font-feature settings
 * inconsistently, and is a screen-reader liability. Use `gap` to break the run
 * in the middle so the label sits inside the dimension, the way a real sheet
 * does, and `dimensionAnchor()` to position it.
 *
 * A dimension exists because it MEASURES something. Never emit one carrying an
 * invented figure — no fake spans, no decorative diameter callouts.
 */
export function DimensionLine({
	x1,
	y1,
	x2,
	y2,
	offset = 0,
	ends = "tick",
	gap = 0,
	extension = 0,
	className,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	/** Distance from the measured feature to the dimension run. */
	offset?: number;
	ends?: "tick" | "arrow";
	/** Width of the break left in the middle of the run for the HTML label. */
	gap?: number;
	/** Length of the extension lines projecting back to the feature. */
	extension?: number;
	className?: string;
}) {
	const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
	const mx = (x1 + x2) / 2;
	const my = (y1 + y2) / 2;
	const arrow = ends === "arrow" ? "url(#bp-arrow)" : undefined;

	return (
		<g
			transform={offset ? `translate(0 ${offset})` : undefined}
			className={cn("stroke-bp-line-strong", className)}
			fill="none"
			style={{ strokeWidth: "var(--lw-med)" }}
		>
			{extension > 0 ? (
				<g
					className="stroke-bp-guide-strong"
					style={{ strokeWidth: "var(--lw-thin)" }}
				>
					<line
						x1={x1}
						y1={y1 - offset - extension}
						x2={x1}
						y2={y1 + 4}
						strokeDasharray={BP_DASH.guide}
						strokeLinecap="butt"
						vectorEffect="non-scaling-stroke"
					/>
					<line
						x1={x2}
						y1={y2 - offset - extension}
						x2={x2}
						y2={y2 + 4}
						strokeDasharray={BP_DASH.guide}
						strokeLinecap="butt"
						vectorEffect="non-scaling-stroke"
					/>
				</g>
			) : null}

			{gap > 0 ? (
				<>
					<line
						x1={x1}
						y1={y1}
						x2={mx - gap / 2}
						y2={my}
						markerStart={arrow}
						vectorEffect="non-scaling-stroke"
					/>
					<line
						x1={mx + gap / 2}
						y1={my}
						x2={x2}
						y2={y2}
						markerEnd={arrow}
						vectorEffect="non-scaling-stroke"
					/>
				</>
			) : (
				<line
					x1={x1}
					y1={y1}
					x2={x2}
					y2={y2}
					markerStart={arrow}
					markerEnd={arrow}
					vectorEffect="non-scaling-stroke"
				/>
			)}

			{ends === "tick"
				? (
						[
							[x1, y1],
							[x2, y2],
						] as const
					).map(([px, py]) => (
						<line
							key={`${px},${py}`}
							x1={px - 4}
							y1={py + 4}
							x2={px + 4}
							y2={py - 4}
							transform={`rotate(${angle} ${px} ${py})`}
							vectorEffect="non-scaling-stroke"
						/>
					))
				: null}
		</g>
	);
}
