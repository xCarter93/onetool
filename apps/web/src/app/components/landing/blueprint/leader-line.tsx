import type { CSSProperties } from "react";
import type { Point } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";

/**
 * A callout leader: one bend, then a horizontal shoulder the label lands on.
 * The shoulder is what makes it read as a real annotation rather than an arrow.
 *
 * Keep the leader angle consistent across a composition (45 degrees is the
 * house angle) and keep the label anchored to the END of the shoulder, in HTML
 * space, via <Annotation> — use `leaderAnchor()` to get that coordinate.
 *
 * The terminus dot sits on the thing being pointed AT, not on the label.
 */
export function LeaderLine({
	from,
	to,
	shoulder = 28,
	dot = true,
	draw = false,
	delay = 0,
	className,
}: {
	/** The point on the drawing being called out. */
	from: Point;
	/** The bend. The shoulder runs horizontally from here. */
	to: Point;
	/** Shoulder length; sign follows the direction of travel. */
	shoulder?: number;
	dot?: boolean;
	draw?: boolean;
	/** Seconds. */
	delay?: number;
	className?: string;
}) {
	const dir = to[0] >= from[0] ? 1 : -1;
	const d = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]} L ${to[0] + shoulder * dir} ${to[1]}`;

	return (
		<g className={cn("stroke-bp-line-strong", className)} fill="none">
			<path
				d={d}
				className={draw ? "bp-draw" : undefined}
				pathLength={draw ? 1 : undefined}
				strokeLinejoin="miter"
				strokeMiterlimit={8}
				strokeLinecap="butt"
				vectorEffect="non-scaling-stroke"
				style={
					{
						strokeWidth: "var(--lw-med)",
						...(draw && delay ? { "--bp-delay": `${delay}s` } : null),
					} as CSSProperties
				}
			/>
			{dot ? (
				<circle
					cx={from[0]}
					cy={from[1]}
					r={2.5}
					className={cn("fill-bp-ink stroke-none", draw && "bp-fade-in")}
					style={
						draw && delay
							? ({ "--bp-delay": `${delay + 0.35}s` } as CSSProperties)
							: undefined
					}
				/>
			) : null}
		</g>
	);
}

/** Where the label for this leader belongs, in viewBox units. */
export function leaderAnchor(
	from: Point,
	to: Point,
	shoulder = 28,
): [number, number] {
	const dir = to[0] >= from[0] ? 1 : -1;
	return [to[0] + shoulder * dir, to[1]];
}
