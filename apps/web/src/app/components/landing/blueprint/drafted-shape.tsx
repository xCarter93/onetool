import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** heavy = cut, med = visible edge, thin = annotation/construction. */
export const BP_WEIGHT = {
	thin: "var(--lw-thin)",
	med: "var(--lw-med)",
	heavy: "var(--lw-heavy)",
} as const;

const TONE = {
	line: "stroke-bp-line",
	strong: "stroke-bp-line-strong",
	ink: "stroke-bp-ink",
} as const;

/**
 * A hairline drafted outline. Server component, zero JS even when it draws on.
 *
 * miter joins (not round) are the single biggest "this is drafted, not
 * illustrated" lever; miterlimit >= 8 keeps acute corners pointed.
 *
 * Always takes a `d` string rather than emitting <rect>/<circle> — pathLength on
 * those elements has a broken Safari history, and everything here must stay
 * drawable. Use roundedRectPath/circlePath from lib/blueprint/geometry.
 *
 * `draw` compiles to the CSS technique: pathLength={1} rescales dasharray into
 * 0-1 units, so no getTotalLength(), no measurement, no client component. A
 * <DrawIn> ancestor flips .bp-in and every child fires on its own delay. The
 * reduced-motion override and the no-JS floor both live in CSS.
 */
export function DraftedShape({
	d,
	fill = "none",
	tone = "line",
	weight = "med",
	draw = false,
	delay = 0,
	className,
	style,
	dash,
}: {
	d: string;
	/** "none", "var(--bp-paper)" for a knockout, or a BP_FILL hatch ref. */
	fill?: string;
	tone?: keyof typeof TONE;
	weight?: keyof typeof BP_WEIGHT;
	/** Draw the outline on when the enclosing <DrawIn> enters the viewport. */
	draw?: boolean;
	/** Seconds. Stagger shapes within a scene by 0.15-0.3. */
	delay?: number;
	className?: string;
	style?: CSSProperties;
	/**
	 * Dash rhythm. Mutually exclusive with `draw` — the draw technique owns
	 * dasharray, so a dashed shape reveals via a clip/mask wipe instead.
	 */
	dash?: string;
}) {
	if (process.env.NODE_ENV !== "production" && draw && dash) {
		console.warn(
			"[blueprint] DraftedShape: `draw` overwrites strokeDasharray, so it cannot be combined with `dash`. Reveal dashed shapes with a clip/mask wipe.",
		);
	}

	return (
		<path
			d={d}
			fill={fill}
			className={cn(TONE[tone], draw && "bp-draw", className)}
			pathLength={draw ? 1 : undefined}
			strokeDasharray={!draw && dash ? dash : undefined}
			strokeLinejoin="miter"
			strokeMiterlimit={8}
			strokeLinecap="butt"
			vectorEffect="non-scaling-stroke"
			style={
				{
					strokeWidth: BP_WEIGHT[weight],
					...(draw && delay ? { "--bp-delay": `${delay}s` } : null),
					...style,
				} as CSSProperties
			}
		/>
	);
}
