"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const BlinkingSquares = dynamic(
	() => import("@/components/react-bits/blinking-squares"),
	{ ssr: false },
);

/**
 * next-themes toggles `.dark` on <html>; the canvas needs concrete hex colors,
 * so the theme has to be observed rather than read from CSS.
 */
function subscribeTheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
	return () => observer.disconnect();
}

const isDarkSnapshot = () =>
	document.documentElement.classList.contains("dark");

/**
 * The final CTA's live lattice: grid cells blinking like automation runs
 * firing after hours. Canvas showpiece under the PRD's contained-island rule —
 * lazy-loaded, mounted only near the viewport, absent entirely under reduced
 * motion (the plate reads as a still sheet without it). Theme-following: the
 * dark sheet takes the brand sky, light paper takes the AA solid sky at lower
 * opacity so the form stays the loudest thing on the plate.
 */
export function NightSquares() {
	const ref = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState(false);
	const reduced = usePrefersReducedMotion();
	const dark = useSyncExternalStore(
		subscribeTheme,
		isDarkSnapshot,
		() => false,
	);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => setActive(entry.isIntersecting),
			{ rootMargin: "25% 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={ref} aria-hidden="true" className="absolute inset-0">
			{active && !reduced ? (
				<BlinkingSquares
					className="absolute inset-0"
					direction="bottom"
					gridSize={44}
					// --cta-solid / brand sky, kept literal — the canvas cannot
					// resolve CSS custom properties.
					squareColor={dark ? "#00a6f4" : "#0275b8"}
					opacity={dark ? 0.4 : 0.34}
					intensity={dark ? 0.55 : 0.65}
					squareSize={0.32}
					minBrightness={dark ? 0.2 : 0.3}
					twinkleSpeed={0.7}
					twinkleStrength={0.9}
					fadeStart={0.25}
					fadeEnd={1}
					falloff={1.8}
					dpr={1.5}
				/>
			) : null}
		</div>
	);
}
