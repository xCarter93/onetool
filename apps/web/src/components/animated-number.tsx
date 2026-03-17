"use client";

import { useEffect, useRef } from "react";
import { useSpring, useTransform, motion } from "motion/react";

interface AnimatedNumberProps {
	value: number;
	format: (val: number) => string;
	duration?: number;
	delay?: number;
}

export function AnimatedNumber({
	value,
	format,
	duration = 600,
	delay = 0,
}: AnimatedNumberProps) {
	const spring = useSpring(0, { duration, bounce: 0 });
	const display = useTransform(spring, (current) =>
		format(Math.round(current))
	);
	const hasAnimatedRef = useRef(false);

	useEffect(() => {
		if (!hasAnimatedRef.current) {
			// Initial mount: apply delay before starting animation
			hasAnimatedRef.current = true;
			if (delay > 0) {
				const timer = setTimeout(() => {
					spring.set(value);
				}, delay);
				return () => clearTimeout(timer);
			}
			spring.set(value);
			return;
		}

		// Subsequent value changes: animate immediately
		spring.set(value);
	}, [spring, value, delay]);

	return <motion.span>{display}</motion.span>;
}
