"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import type { SquareMatrixHandle } from "@/components/react-bits/square-matrix";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLandingTokens } from "../landing-tokens";
import { useMotionPaused } from "../motion-pause";
import { PAID_STEP } from "./day";

const SquareMatrix = dynamic(() => import("@/components/react-bits/square-matrix"), { ssr: false });

// The step each card's job finishes on (hero/day.ts): signed, route done, paid.
const RIPPLES = new Map([
	["2", { card: 0, strength: 0.7 }],
	["4", { card: 1, strength: 0.7 }],
	[String(PAID_STEP), { card: 2, strength: 1.1 }],
]);

export function HeroMatrix() {
	const area = useRef<HTMLDivElement>(null);
	const ground = useRef<SquareMatrixHandle>(null);
	const desktop = useMediaQuery("(min-width: 1024px)");
	const paused = useMotionPaused();
	const [ink] = useLandingTokens("--ink-3");

	useEffect(() => {
		const node = area.current;
		const stage = node?.closest<HTMLElement>(".lp-hero-stage");
		if (!node || !stage) return;
		const observer = new MutationObserver(() => {
			const hit = RIPPLES.get(stage.dataset.step ?? "");
			const card = hit && stage.querySelectorAll(".lp-job-card")[hit.card];
			if (!hit || !card) return;
			const box = node.getBoundingClientRect();
			const rect = card.getBoundingClientRect();
			ground.current?.ripple((rect.left + rect.width / 2 - box.left) / box.width, (rect.bottom - box.top) / box.height, hit.strength);
		});
		observer.observe(stage, { attributes: true, attributeFilter: ["data-step"] });
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={area} className="lp-hero-matrix" aria-hidden="true">
			{desktop && ink ? (
				<SquareMatrix
					ref={ground}
					colors={[ink, ink]}
					pattern="noise"
					cellSize={14}
					roundness={1}
					glow={0}
					speed={0.2}
					amplitude={0.08}
					opacity={0.45}
					interactive={false}
					paused={paused}
				/>
			) : null}
		</div>
	);
}
