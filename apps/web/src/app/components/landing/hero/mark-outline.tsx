"use client";

import type { CSSProperties } from "react";
import { useBpId } from "../blueprint/use-bp-id";
import { MARK_MASK_BOX, T_MARK } from "./drafted-mark-data";
import { LOGO_CHECK, LOGO_WRENCH } from "./logo-mark-data";

/**
 * The mark's object outline — the real logo's own paths, drafted.
 *
 * NOT revealed with `.bp-draw` on the paths themselves: the pathLength={1}
 * dash technique fragments on paths this long and curve-dense (verified live —
 * the outline rendered as broken dashes). Instead ONE straight plotter-sweep
 * stroke inside a mask carries `.bp-draw` — a two-point path the dash math
 * cannot break — and wipes both outlines in corner to corner. The check sits
 * down-sweep of the wrench, so it arrives second for free.
 *
 * Client only because the mask id is per-instance (same reason as
 * mark-centrelines.tsx).
 */
export function MarkOutline() {
	const maskId = useBpId("bp-mark-outline");

	return (
		<g>
			<defs>
				<mask id={maskId} maskUnits="userSpaceOnUse" {...MARK_MASK_BOX}>
					<path
						d="M-20 -20L316 316"
						fill="none"
						pathLength={1}
						className="bp-draw"
						strokeLinecap="butt"
						// var()/#fff literal, never currentColor: a paint server
						// resolves currentColor against its own ancestors.
						style={
							{
								stroke: "#fff",
								strokeWidth: 460,
								"--bp-delay": `${T_MARK.outline}s`,
							} as CSSProperties
						}
					/>
				</mask>
			</defs>
			<g
				mask={`url(#${maskId})`}
				className="stroke-bp-line-strong"
				fill="none"
				strokeLinejoin="miter"
				strokeMiterlimit={8}
				style={{ strokeWidth: "var(--lw-heavy)" }}
			>
				<path d={LOGO_WRENCH.d} vectorEffect="non-scaling-stroke" />
				<path d={LOGO_CHECK.d} vectorEffect="non-scaling-stroke" />
			</g>
		</g>
	);
}
