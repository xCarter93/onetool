import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Every scalable SVG node in this system carries this. SVG's default
 * transform-origin is the user-space origin (0,0), not the element's centre, so
 * a scaled tick launches toward the top-left corner. Motion does not set
 * transform-box for you either — even with originX/originY, keep this.
 */
export const BP_FILL_BOX: CSSProperties = {
	transformBox: "fill-box",
	transformOrigin: "center",
};

/**
 * A square vertex tick — the drafted control point. Server component.
 *
 * Two flavours read as drafting: hollow (an unset control point) and filled sky
 * (the live/selected point). Alternate them for hierarchy; a field of all-filled
 * ticks reads as a HUD, not a drawing.
 *
 * crispEdges is correct here (axis-aligned squares) and is what makes them feel
 * plotted rather than rendered.
 */
export function VertexTick({
	x,
	y,
	size = 5,
	live = false,
	className,
	style,
}: {
	x: number;
	y: number;
	size?: number;
	/** Filled sky square instead of a hollow outline. */
	live?: boolean;
	className?: string;
	style?: CSSProperties;
}) {
	return (
		<rect
			x={x - size / 2}
			y={y - size / 2}
			width={size}
			height={size}
			className={cn(
				live ? "fill-bp-ink stroke-none" : "fill-none stroke-bp-line-strong",
				className,
			)}
			style={{
				strokeWidth: live ? undefined : "var(--lw-med)",
				...BP_FILL_BOX,
				...style,
			}}
			shapeRendering="crispEdges"
		/>
	);
}
