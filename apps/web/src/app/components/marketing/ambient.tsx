"use client";

import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * The one mount path for every decorative canvas/WebGL background on the
 * landing page. Mounts its children only while the host section is within
 * `rootMargin` of the viewport (and fully unmounts them again off-screen, so
 * a page with a dozen ambients never runs more than the visible few), renders
 * nothing under prefers-reduced-motion, and pins the layer behind the
 * section's content with pointer-events off.
 *
 * Usage: the parent section element must be `relative`; content that should
 * sit above the ambient needs its own stacking context (`relative`).
 *
 *   <AmbientLayer opacity={0.08}><HalftoneWave …/></AmbientLayer>
 */
export function AmbientLayer({
	children,
	className,
	opacity = 1,
	rootMargin = "200px",
	style,
}: {
	children: ReactNode;
	className?: string;
	/** Whisper knob — applied to the whole layer so shaders keep their own math. */
	opacity?: number;
	rootMargin?: string;
	style?: CSSProperties;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [near, setNear] = useState(false);
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const node = ref.current;
		if (!node || reduced) return;
		const observer = new IntersectionObserver(
			([entry]) => setNear(entry.isIntersecting),
			{ rootMargin }
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [rootMargin, reduced]);

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 overflow-hidden",
				className
			)}
			style={{ opacity, ...style }}
		>
			{near && !reduced ? children : null}
		</div>
	);
}
