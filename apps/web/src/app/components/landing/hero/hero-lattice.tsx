"use client";

import { m, useReducedMotion } from "motion/react";
import { bpTravel, bpViewport } from "../blueprint/blueprint-motion";
import { GuideLines } from "../blueprint/guide-lines";
import { useBpId } from "../blueprint/use-bp-id";
import { HERO_LATTICE } from "./hero-data";

/**
 * The scene's construction lattice, wiped in left to right.
 *
 * The wipe is a clip-rect scaleX, never a dashoffset animation: Motion's
 * pathLength overwrites strokeDasharray outright (which would destroy the dash
 * rhythm that makes these read as guides), and animating dashoffset across a
 * full-width lattice repaints the whole SVG layer every frame. One transform on
 * one clip rect costs one composited layer regardless of line count.
 *
 * Pixel-mapped regime — no viewBox — so `4 6` is literally 4px on and 6px off
 * at every breakpoint. A scaled viewBox stretches dash rhythm even with
 * vector-effect pinning the stroke width.
 *
 * Reduced motion: `initial={false}` leaves the clip rect at its natural
 * scaleX 1 and the lattice renders complete. Gating this by hand is mandatory —
 * MotionConfig's reducedMotion="user" suppresses the animation but keeps
 * `initial` applied, which would strand the clip at scaleX 0 and hide the
 * lattice permanently.
 *
 * No-JS: the clip rect SSRs at scaleX 0, so the lattice is absent without
 * JavaScript. Acceptable here and only here — the lattice is pure texture and
 * carries no fact that is not in the copy. Anything meaningful uses the CSS
 * `.bp-draw` path, which has a <noscript> floor.
 */
export function HeroLattice() {
	const reduce = useReducedMotion();
	const clipId = useBpId("hero-lattice-wipe");

	return (
		// whileInView lives on the RENDERED svg root, never on the clip rect:
		// clipPath contents have no layout box, so an IntersectionObserver on
		// them may never fire and the wipe would strand at scaleX 0. The rect
		// inherits "hidden"/"visible" through variant context instead.
		<m.svg
			aria-hidden="true"
			focusable="false"
			className="pointer-events-none absolute inset-0 h-full w-full"
			// Guides never run under text. The hand-authored coordinates already
			// terminate raggedly inside the frame; this clears the bands the sheet
			// code and the dimension label occupy at the top and bottom of the stage.
			style={{
				maskImage:
					"linear-gradient(to bottom, transparent, #000 14%, #000 82%, transparent)",
			}}
			initial={reduce ? false : "hidden"}
			whileInView={reduce ? undefined : "visible"}
			viewport={bpViewport}
		>
			<defs>
				<clipPath id={clipId}>
					<m.rect
						x={0}
						y={0}
						width="100%"
						height="100%"
						style={{ transformBox: "fill-box", transformOrigin: "left center" }}
						variants={
							reduce
								? undefined
								: {
										hidden: { scaleX: 0 },
										visible: { scaleX: 1, transition: bpTravel },
									}
						}
					/>
				</clipPath>
			</defs>
			<g clipPath={`url(#${clipId})`}>
				<GuideLines guides={HERO_LATTICE} />
			</g>
		</m.svg>
	);
}
