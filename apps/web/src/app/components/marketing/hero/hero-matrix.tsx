"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import type { SquareMatrixHandle } from "@/components/react-bits/square-matrix";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLandingTokens } from "../landing-tokens";
import { useMotionPaused } from "../motion-pause";
import { PAID_STEP, SIGNED_STEP } from "./day";

const SquareMatrix = dynamic(() => import("@/components/react-bits/square-matrix"), { ssr: false });

const RIPPLES = new Map([
	[String(SIGNED_STEP), { target: ".lp-sig", strength: 0.6 }],
	[String(PAID_STEP), { target: ".lp-stamp", strength: 1.1 }],
]);

/** The dot floor the sheet sits on; it ripples out from the signature and from the stamp landing. */
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
			const target = hit && stage.querySelector(hit.target);
			if (!hit || !target) return;
			const box = node.getBoundingClientRect();
			const rect = target.getBoundingClientRect();
			ground.current?.ripple(
				(rect.left + rect.width / 2 - box.left) / box.width,
				(rect.top + rect.height / 2 - box.top) / box.height,
				hit.strength,
			);
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
