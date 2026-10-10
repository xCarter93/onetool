"use client";

import dynamic from "next/dynamic";
import { useLandingTokens } from "../landing-tokens";
import { useMotionPaused } from "../motion-pause";

const TechText = dynamic(() => import("@/components/react-bits/tech-text"), { ssr: false });

const withAlpha = (hex: string, alpha: number) => {
	const value = parseInt(hex.replace("#", ""), 16);
	return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

export function FooterMark() {
	const paused = useMotionPaused();
	const [ink, accent] = useLandingTokens("--ink", "--accent-ink");

	return (
		<div className="lp-foot-mark" aria-hidden="true">
			{ink && accent ? (
				<TechText
					text="OneTool"
					color={withAlpha(ink, 0.22)}
					accentColor={accent}
					fontWeight={600}
					fontSize={320}
					letterSpacing={-0.04}
					sweep={!paused}
				/>
			) : null}
		</div>
	);
}
