import { circlePath } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";

/**
 * A registration crosshair. Server component.
 *
 * Use sparingly — 2 to 4 on the whole page, and only at genuine origin points:
 * a corner of the sheet frame, the datum of a dimension chain. Scatter them and
 * the page stops reading as drafting and starts reading as sci-fi HUD.
 *
 * crispEdges is deliberately NOT set: the ring is a curve and would staircase.
 */
export function Crosshair({
	x,
	y,
	r = 10,
	ring = true,
	tone = "line",
	className,
}: {
	x: number;
	y: number;
	r?: number;
	ring?: boolean;
	tone?: "line" | "ink";
	className?: string;
}) {
	return (
		<g
			className={cn(
				tone === "ink" ? "stroke-bp-ink" : "stroke-bp-line-strong",
				className,
			)}
			fill="none"
			style={{ strokeWidth: "var(--lw-thin)" }}
			vectorEffect="non-scaling-stroke"
		>
			<line x1={x - r} y1={y} x2={x + r} y2={y} vectorEffect="non-scaling-stroke" />
			<line x1={x} y1={y - r} x2={x} y2={y + r} vectorEffect="non-scaling-stroke" />
			{ring ? (
				<path d={circlePath(x, y, r * 0.45)} vectorEffect="non-scaling-stroke" />
			) : null}
		</g>
	);
}
