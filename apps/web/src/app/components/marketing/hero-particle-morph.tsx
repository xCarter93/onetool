"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const ParticleMorph = dynamic(
	() => import("@/components/react-bits/particle-morph"),
	{ ssr: false },
);

const FRAMES = [
	"/landing/morph/quote.png",
	"/landing/morph/signed.png",
	"/landing/morph/scheduled.png",
	"/landing/morph/invoiced.png",
	"/landing/morph/paid.png",
	"/landing/morph/onetool-mark.svg",
];

const LOGO = FRAMES.length - 1;

const TRANSITION_MS = 1200;
const STAGE_HOLD_MS = 800;
const LOGO_HOLD_MS = 6000;

export function HeroParticleMorph({ className }: { className?: string }) {
	const reduced = usePrefersReducedMotion();
	const [index, setIndex] = useState(0);

	// Driven here rather than via the component's autoplay, which only has one
	// interval for every frame and can't hold longer on the logo.
	useEffect(() => {
		if (reduced) return;
		const hold = index === LOGO ? LOGO_HOLD_MS : STAGE_HOLD_MS;
		const timer = setTimeout(
			() => setIndex((i) => (i + 1) % FRAMES.length),
			TRANSITION_MS + hold,
		);
		return () => clearTimeout(timer);
	}, [index, reduced]);

	return (
		<div
			role="img"
			aria-label="OneTool logo"
			className={`aspect-square w-full ${className ?? ""}`}
		>
			<ParticleMorph
				images={FRAMES}
				activeIndex={reduced ? LOGO : index}
				autoplay={false}
				transitionDuration={TRANSITION_MS}
				backgroundColor="transparent"
				// Idle drift keeps a 30fps loop alive on every hold; without it the
				// renderer parks once a frame settles.
				idleDrift={0}
				// Additive glow and RGB fringing are tuned for a black stage; both wash
				// out the brand hexes on the light paper.
				glow={0.25}
				aberration={0}
			/>
		</div>
	);
}
