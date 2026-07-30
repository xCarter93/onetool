"use client";

import type { CSSProperties } from "react";
import { BP_DASH } from "@/lib/blueprint/geometry";
import { useBpId } from "../blueprint/use-bp-id";
import {
	MARK_CENTRELINES,
	MARK_MASK_BOX,
	T_MARK,
} from "./drafted-mark-data";

/**
 * The mark's three centrelines, revealed by a mask wipe.
 *
 * A dashed line NEVER animates through dasharray/pathLength — the draw
 * technique owns both properties and would erase the ISO rhythm that makes
 * these read as centrelines rather than dotted borders. So the same trick
 * revision-cloud-draw.tsx uses applies here: a fat white stroke inside a mask
 * carries `.bp-draw`, the dashed line underneath keeps its own dasharray, and
 * the reveal still costs zero Motion.
 *
 * ONE mask holds all three wipes (staggered by their own `--bp-delay`) rather
 * than three masks: each mask is an offscreen buffer repainted while it reveals,
 * and there is no reason to pay for three.
 *
 * Client only because a mask id depends on this instance and cannot be hoisted
 * into the global <BlueprintDefs/> sprite.
 */
export function MarkCentrelines() {
	const maskId = useBpId("bp-mark-centrelines");

	return (
		<g>
			<defs>
				<mask id={maskId} maskUnits="userSpaceOnUse" {...MARK_MASK_BOX}>
					{MARK_CENTRELINES.map((line, i) => (
						<path
							key={line.d}
							d={line.d}
							fill="none"
							pathLength={1}
							className="bp-draw"
							strokeLinecap="round"
							// var()/#fff literal, never currentColor: a paint server
							// resolves currentColor against its own ancestors.
							style={
								{
									stroke: "#fff",
									strokeWidth: 10,
									"--bp-delay": `${T_MARK.centrelines[i]}s`,
								} as CSSProperties
							}
						/>
					))}
				</mask>
			</defs>
			<g
				mask={`url(#${maskId})`}
				className="stroke-bp-ink"
				fill="none"
				style={{ strokeWidth: "var(--lw-thin)" }}
			>
				{MARK_CENTRELINES.map((line) => (
					<path
						key={line.d}
						d={line.d}
						strokeDasharray={BP_DASH.centreLong}
						// Phased so a long dash straddles the crossing at the head centre.
						strokeDashoffset={line.dashOffset}
						strokeLinecap="butt"
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</g>
		</g>
	);
}
