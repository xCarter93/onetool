/**
 * Blueprint motion constants. Drafting motion is plotted, mechanical, decisive:
 * a plotter head moves at constant velocity and stops dead. No bounce, no
 * overshoot, no elastic — any visible overshoot flips the read from
 * "instrument" to "toy".
 *
 * These extend, not replace, the conventions in ../motion-utils.ts (which the
 * older marketing sections use). Blueprint components import from here.
 *
 * NOTE the reduced-motion boundary: MotionConfig reducedMotion="user" disables
 * transform and layout animations only. It does NOT cover pathLength,
 * strokeDashoffset, opacity or filter — every stroke animation in this system
 * carries its own useReducedMotion() gate, and the CSS draw-on technique
 * carries a @media (prefers-reduced-motion: reduce) override in globals.css.
 */

/** Expo-out: fast commit, soft land. Easing the pen looks wrong; easing the arrival looks right. */
export const bpEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Tick/pop easing — sharper in, dead stop. */
export const bpEaseTick: [number, number, number, number] = [0.2, 0, 0, 1];

/** Stroke draw-on. Mirrors the .bp-draw CSS keyframe so both techniques feel identical. */
export const bpDraw = { duration: 0.7, ease: bpEase } as const;

/** Vertex ticks and other small state flips. */
export const bpTick = { duration: 0.18, ease: bpEaseTick } as const;

/** Pen travel — constant speed, because a plotter has no easing. */
export const bpTravel = { duration: 0.55, ease: "linear" } as const;

/** The only permissible spring. bounce: 0 is critically damped — use for scroll smoothing. */
export const bpSpring = { type: "spring", bounce: 0, duration: 0.5 } as const;

/** Scroll-linked smoothing for the sticky rail. Critically damped, no wobble. */
export const bpScrollSpring = {
	stiffness: 120,
	damping: 30,
	mass: 0.4,
	restDelta: 0.001,
} as const;

/**
 * Stagger between vertex ticks. Below 30ms they read as one blob; above 80ms it
 * drags. 45ms reads "plotted in sequence".
 */
export const BP_STAGGER = 0.045;

/**
 * Ticks should land while the outline is still being drawn — roughly half the
 * draw duration. That overlap is what makes it feel like a machine rather than
 * a slideshow.
 */
export const BP_DELAY_CHILDREN = 0.35;

/**
 * Standard whileInView viewport. `once: true` always — re-triggering artwork on
 * scroll-back is the single cheapest-feeling tell. The negative bottom margin
 * holds fire until the scene is genuinely composed on screen.
 */
export const bpViewport = {
	once: true,
	amount: 0.4,
	margin: "0px 0px -10% 0px",
} as const;
