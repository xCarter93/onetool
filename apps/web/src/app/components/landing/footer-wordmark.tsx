"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const ParticleText = dynamic(
	() => import("@/components/react-bits/particle-text"),
	{ ssr: false },
);

/**
 * The sheet-bottom OneTool wordmark as settling graphite: particles assemble
 * into the name and scatter under the pointer. Mostly quiet zinc with a
 * sparse sky fleck so it stays sheet furniture, not a light show.
 */
const LIGHT_COLORS = ["#d4d4d8", "#d4d4d8", "#a1a1aa", "#0284c7"];
const DARK_COLORS = ["#3f3f46", "#3f3f46", "#52525b", "#00a6f4"];

/** Static fallback — reduced motion, no JS settling yet, and SSR. */
function StaticWordmark() {
	return (
		<p className="select-none text-[16vw] font-semibold leading-[0.78] tracking-[-0.05em] text-bp-guide-strong">
			OneTool
		</p>
	);
}

export function FooterWordmark() {
	const { resolvedTheme } = useTheme();
	const reduced = usePrefersReducedMotion();
	const [fontFamily, setFontFamily] = useState<string | null>(null);

	useEffect(() => {
		// Outfit ships under next/font's hashed family name — read the real
		// value off the DOM, and wait for it to load so the canvas doesn't
		// rasterize the fallback font.
		const family = getComputedStyle(document.body).fontFamily;
		let cancelled = false;
		document.fonts.ready.then(() => {
			if (!cancelled) setFontFamily(family);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const ready = !reduced && fontFamily !== null;

	return (
		<div aria-hidden="true" className="mt-10 h-[clamp(140px,20vw,340px)]">
			{ready ? (
				<ParticleText
					text="OneTool"
					colors={resolvedTheme === "dark" ? DARK_COLORS : LIGHT_COLORS}
					fontFamily={fontFamily}
					fontWeight={600}
					fontSize={340}
					particleSize={2}
					particleGap={2}
					ease={0.06}
					friction={0.82}
					mouseControls={{ enabled: true, radius: 130, strength: 4 }}
				/>
			) : (
				<StaticWordmark />
			)}
		</div>
	);
}
