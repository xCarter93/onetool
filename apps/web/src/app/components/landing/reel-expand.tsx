"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Scroll-linked presentation for a scene plate: it enters slightly scaled down
 * and grows to full size as it rises through the lower 60% of the viewport.
 * Transform-only (no reflow), rAF-coalesced, and inert under reduced motion —
 * the plate simply renders at full size.
 */
export function ReelExpand({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (reduced) {
			el.style.transform = "";
			return;
		}

		let raf = 0;
		const update = () => {
			raf = 0;
			const rect = el.getBoundingClientRect();
			const vh = window.innerHeight;
			const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.6)));
			el.style.transform = `scale(${0.9 + progress * 0.1})`;
		};
		const onScroll = () => {
			if (!raf) raf = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, [reduced]);

	return (
		<div ref={ref} className="origin-top will-change-transform">
			{children}
		</div>
	);
}
