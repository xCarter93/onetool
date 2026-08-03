"use client";

import type { CSSProperties } from "react";
import { revisionCloud, type Point } from "@/lib/blueprint/geometry";
import { cn } from "@/lib/utils";
import { useBpId } from "./use-bp-id";

/**
 * Draw-on revision cloud.
 *
 * Client only because a <mask> id is geometry-dependent and cannot be hoisted
 * into the global sprite — it goes through useBpId instead. No Motion: a fat
 * white stroke inside the mask carries the same CSS `.bp-draw` technique as
 * every other mark, so this ships a few hundred bytes rather than an animation
 * runtime.
 *
 * Why a mask and not dashoffset on the cloud itself: dashoffset would either
 * destroy the dash pattern or repaint ~40 arcs every frame. The mask animates
 * one stroke and leaves the cloud's own dash rhythm intact.
 *
 * Cost: an offscreen buffer repainted while it reveals. Keep the masked bbox
 * under roughly 400x400 CSS px, and never more than two concurrent.
 */
export function RevisionCloudDraw({
	points,
	bump = 14,
	dash,
	delay = 0,
	className,
	padding = 24,
}: {
	points: readonly Point[];
	bump?: number;
	dash?: string;
	/** Seconds. */
	delay?: number;
	className?: string;
	/** Mask bbox padding around the cloud, in viewBox units. */
	padding?: number;
}) {
	const maskId = useBpId("bp-cloud-mask");
	const d = revisionCloud(points, bump);
	if (!d) return null;

	const xs = points.map((p) => p[0]);
	const ys = points.map((p) => p[1]);
	const x = Math.min(...xs) - padding;
	const y = Math.min(...ys) - padding;
	const w = Math.max(...xs) - Math.min(...xs) + padding * 2;
	const h = Math.max(...ys) - Math.min(...ys) + padding * 2;

	const delayStyle = delay
		? ({ "--bp-delay": `${delay}s` } as CSSProperties)
		: undefined;

	return (
		<g>
			<defs>
				<mask id={maskId} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
					{/* var(), not currentColor: paint servers resolve currentColor
					    against their own ancestors, not the referencing element. */}
					<path
						d={d}
						fill="none"
						pathLength={1}
						className="bp-draw"
						style={{ stroke: "#fff", strokeWidth: bump, ...delayStyle }}
						strokeLinecap="round"
					/>
				</mask>
			</defs>
			<path
				d={d}
				mask={`url(#${maskId})`}
				fill="none"
				className={cn("stroke-bp-ink", className)}
				strokeDasharray={dash}
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
				style={{ strokeWidth: 1.25 }}
			/>
		</g>
	);
}
