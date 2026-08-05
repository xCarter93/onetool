"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const LENIS_OPTIONS = {
	duration: 1.0,
	easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
	orientation: "vertical" as const,
	gestureOrientation: "vertical" as const,
	smoothWheel: true,
	wheelMultiplier: 1,
	touchMultiplier: 2,
};

/**
 * Sticky-header clearance for anchor landings. Matches the chapter rail's
 * `sticky top-24` (6rem) — one number, or a link lands under the rail.
 */
const ANCHOR_OFFSET = 96;

export function SmoothScroll({ children }: { children: ReactNode }): ReactNode {
	// Live, so toggling the OS setting mid-session tears Lenis down or brings it
	// back rather than leaving the page in whichever mode it happened to load in.
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		if (reduced) return;

		const lenis = new Lenis(LENIS_OPTIONS);

		let rafId: number;

		function raf(time: number) {
			lenis.raf(time);
			rafId = requestAnimationFrame(raf);
		}

		rafId = requestAnimationFrame(raf);

		// Anchor link scroll handling
		function handleAnchorClick(e: MouseEvent) {
			const target = e.target as HTMLElement;
			const anchor = target.closest('a[href^="#"]');
			if (!anchor) return;
			// Opt-out for links that need the browser's own focus move (skip link).
			if (anchor.hasAttribute("data-no-smooth")) return;

			const href = anchor.getAttribute("href");
			if (!href || href === "#") return;

			const element = document.querySelector(href);
			if (!element) return;

			e.preventDefault();
			lenis.scrollTo(element as HTMLElement, { offset: -ANCHOR_OFFSET });
		}

		document.addEventListener("click", handleAnchorClick);

		return () => {
			document.removeEventListener("click", handleAnchorClick);
			cancelAnimationFrame(rafId);
			lenis.destroy();
		};
	}, [reduced]);

	return <>{children}</>;
}
