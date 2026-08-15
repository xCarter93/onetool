"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/* Fallback reveal for headings whose children carry JSX (RoughMark spans) —
 * StaggeredText only takes a plain string. Same 0.6s blur-rise voice as the
 * staggered word reveal, applied to the block at once, so the two read as one
 * motion system. */
export function HeadingReveal({ children }: { children: ReactNode }) {
	const reduced = useReducedMotion();
	return (
		<motion.span
			className="block"
			initial={reduced ? false : { opacity: 0, y: 14, filter: "blur(4px)" }}
			whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
			viewport={{ once: true, amount: 0.3 }}
			transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
		>
			{children}
		</motion.span>
	);
}
