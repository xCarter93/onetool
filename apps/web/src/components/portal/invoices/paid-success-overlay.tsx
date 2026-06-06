"use client";

import { motion, useReducedMotion } from "framer-motion";

const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export interface PaidSuccessOverlayProps {
	message: string;
	subline?: string;
}

export function PaidSuccessOverlay({
	message,
	subline,
}: PaidSuccessOverlayProps) {
	const reduce = useReducedMotion() ?? false;

	return (
		<motion.div
			data-paid-success-overlay
			role="status"
			aria-live="polite"
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
			transition={{
				duration: reduce ? 0.12 : 0.25,
				ease: EASE_OUT_QUART,
			}}
			className="flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
		>
			<motion.svg
				viewBox="0 0 52 52"
				className="h-14 w-14 text-emerald-600 dark:text-emerald-400"
				aria-hidden="true"
				initial="hidden"
				animate="visible"
			>
				<motion.circle
					cx="26"
					cy="26"
					r="24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeOpacity="0.35"
					variants={{
						hidden: { pathLength: 0, opacity: 0 },
						visible: {
							pathLength: 1,
							opacity: 1,
							transition: {
								duration: reduce ? 0 : 0.45,
								ease: EASE_OUT_QUINT,
							},
						},
					}}
				/>
				<motion.path
					d="M14 27 L23 36 L39 18"
					fill="none"
					stroke="currentColor"
					strokeWidth="3.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					variants={{
						hidden: { pathLength: 0 },
						visible: {
							pathLength: 1,
							transition: {
								delay: reduce ? 0 : 0.2,
								duration: reduce ? 0 : 0.4,
								ease: EASE_OUT_QUINT,
							},
						},
					}}
				/>
			</motion.svg>
			<p className="text-[15px] font-semibold">{message}</p>
			{subline ? (
				<p className="text-[13px] text-emerald-800/80 dark:text-emerald-200/80">
					{subline}
				</p>
			) : null}
		</motion.div>
	);
}
