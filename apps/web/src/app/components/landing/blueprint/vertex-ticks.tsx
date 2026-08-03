"use client";

import { m, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import type { Point } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";
import {
	BP_DELAY_CHILDREN,
	BP_STAGGER,
	bpTick,
	bpViewport,
} from "./blueprint-motion";
import { BP_FILL_BOX } from "./vertex-tick";

/**
 * Staggered vertex pop-ins — the one Motion component in a typical scene.
 *
 * Uses <m.*> because the marketing route runs LazyMotion in `strict` mode;
 * `motion.*` throws there by design.
 *
 * Variants propagate only through Motion children — a plain <g> anywhere in the
 * chain silently breaks the stagger, so the group is an <m.g>.
 *
 * Reduced motion: MotionConfig's reducedMotion="user" would suppress the scale
 * animation but leave `initial` applied, which would strand every tick at
 * scale 0 — permanently invisible. So the hidden state is gated by hand and the
 * ticks render at their terminal state instead.
 *
 * No-JS caveat: with motion driving the entrance, the SSR'd markup carries
 * `initial` inline (opacity 0), so ticks stay invisible if JS never runs. That
 * is acceptable ONLY because vertex ticks are a decorative flourish — nothing
 * they convey is absent from the copy. Never use this island for a mark that
 * carries meaning; use the CSS `.bp-draw` path, which has a <noscript> floor.
 */
export function VertexTicks({
	points,
	size = 5,
	live,
	className,
	delayChildren = BP_DELAY_CHILDREN,
	stagger = BP_STAGGER,
}: {
	points: readonly Point[];
	size?: number;
	/** Indices rendered as filled sky squares (the live control points). */
	live?: readonly number[];
	className?: string;
	delayChildren?: number;
	stagger?: number;
}) {
	const reduce = useReducedMotion();
	const liveSet = live ? new Set(live) : null;

	const group = {
		hidden: {},
		show: { transition: { staggerChildren: stagger, delayChildren } },
	};
	const tick = {
		hidden: { scale: 0, opacity: 0 },
		show: { scale: 1, opacity: 1, transition: bpTick },
	};

	return (
		<m.g
			className={className}
			variants={reduce ? undefined : group}
			initial={reduce ? false : "hidden"}
			whileInView={reduce ? undefined : "show"}
			viewport={bpViewport}
		>
			{points.map(([x, y], i) => {
				const isLive = liveSet?.has(i) ?? false;
				return (
					<m.rect
						key={`${x},${y},${i}`}
						variants={reduce ? undefined : tick}
						x={x - size / 2}
						y={y - size / 2}
						width={size}
						height={size}
						className={cn(
							isLive
								? "fill-bp-ink stroke-none"
								: "fill-none stroke-bp-line-strong",
						)}
						style={
							{
								strokeWidth: isLive ? undefined : "var(--lw-med)",
								...BP_FILL_BOX,
							} as CSSProperties
						}
						shapeRendering="crispEdges"
					/>
				);
			})}
		</m.g>
	);
}
