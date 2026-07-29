"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion runtime for the marketing route. Mounted once, in
 * app/(marketing)/layout.tsx.
 *
 * `domAnimation` is ~15KB gzip against ~34KB for the full motion bundle, and
 * `strict` throws if anything renders `motion.*` instead of `<m.*>` — which is
 * exactly the enforcement we want, because a stray `motion.*` import silently
 * pulls the whole bundle back in. Every blueprint client island uses `m.*`.
 *
 * `domAnimation` excludes layout animations. This system needs none.
 * useScroll/useTransform/useSpring/useInView/useReducedMotion are hooks and
 * work regardless of the feature bundle.
 *
 * `reducedMotion="user"` covers transform and layout animations ONLY — not
 * pathLength, not strokeDashoffset, not opacity, not filter. Those carry their
 * own gates (useReducedMotion in the islands, a prefers-reduced-motion media
 * block in globals.css for the CSS draw-on technique).
 *
 * Deliberately NOT setting a default `transition` here: it would silently
 * retune every other animation on the marketing surface. Blueprint components
 * pass explicit transitions from blueprint-motion.ts.
 *
 * `children` stays a server subtree — passing it through a client component
 * does not make it client.
 */
export function BlueprintMotionProvider({ children }: { children: ReactNode }) {
	return (
		<LazyMotion features={domAnimation} strict>
			<MotionConfig reducedMotion="user">{children}</MotionConfig>
		</LazyMotion>
	);
}
