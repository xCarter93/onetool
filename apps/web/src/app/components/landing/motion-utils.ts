import type { Variants } from "motion/react";

/** Expo-out. The one easing curve the marketing surface uses. */
export const ease: [number, number, number, number] = [0.23, 1, 0.32, 1];

export const viewportOnce = { once: true } as const;

export const fadeInUp: Variants = {
	hidden: { opacity: 0, y: 30 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

export const fadeInDown: Variants = {
	hidden: { opacity: 0, y: -30 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

export const fadeInScale: Variants = {
	hidden: { opacity: 0, scale: 0.95 },
	visible: { opacity: 1, scale: 1, transition: { duration: 0.8, ease } },
};

export const staggerContainer: Variants = {
	hidden: {},
	visible: {
		transition: {
			staggerChildren: 0.15,
		},
	},
};

/**
 * Scroll-reveal props for a `motion.*` element, with the reduced-motion
 * terminal state baked in. Pass `useReducedMotion()` straight through — when
 * it is true the element mounts already in its end state and never animates.
 */
export function revealProps(
	reduced: boolean | null,
	{ delay = 0, duration = 0.5, y = 20 }: { delay?: number; duration?: number; y?: number } = {}
) {
	if (reduced) {
		return {
			initial: { opacity: 1, y: 0 },
			whileInView: { opacity: 1, y: 0 },
			viewport: viewportOnce,
			transition: { duration: 0 },
		};
	}

	return {
		initial: { opacity: 0, y },
		whileInView: { opacity: 1, y: 0 },
		viewport: viewportOnce,
		transition: { duration, delay, ease },
	};
}
