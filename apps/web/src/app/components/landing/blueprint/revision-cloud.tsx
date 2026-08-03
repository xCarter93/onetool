import { revisionCloud, type Point } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";

/**
 * A revision cloud — a REGULAR arc chain around a region that changed.
 *
 * Regular, never wobbly: rough.js-style hand jitter is off-limits in this
 * language. The scallops are exact arcs; the drafting register comes from the
 * convention, not from fake imprecision.
 *
 * Use at most ONE per page. It is the loudest blueprint signifier and turns
 * kitsch immediately. The good use is circling one live metric or the single
 * "this is what changed" moment.
 *
 * Static by default (server component, zero JS). For the draw-on variant use
 * <RevisionCloudDraw> — a cloud is ~40 arcs, so it reveals through a mask,
 * never through dashoffset.
 */
export function RevisionCloud({
	points,
	bump = 14,
	tone = "ink",
	dash,
	className,
}: {
	/** Closed polygon to scallop around, in viewBox units. */
	points: readonly Point[];
	/** Scallop pitch. */
	bump?: number;
	tone?: "ink" | "line";
	dash?: string;
	className?: string;
}) {
	const d = revisionCloud(points, bump);
	if (!d) return null;

	return (
		<path
			d={d}
			fill="none"
			className={cn(tone === "ink" ? "stroke-bp-ink" : "stroke-bp-line-strong", className)}
			strokeDasharray={dash}
			strokeLinejoin="round"
			strokeLinecap="butt"
			vectorEffect="non-scaling-stroke"
			style={{ strokeWidth: 1.25 }}
		/>
	);
}
