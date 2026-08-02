"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import {
	FEATURE_VIDEOS,
	VIDEO_CONFIG,
	type FeatureKey,
} from "@/remotion/compositions";

export type { FeatureKey };

interface FeatureAnimationProps {
	feature: FeatureKey;
	/** Show playback controls (default: chromeless ambient loop). */
	controls?: boolean;
	className?: string;
}

/**
 * Embeds a OneTool Remotion feature animation. Plays only while on screen,
 * loops, muted-ambient by default, and follows the site theme.
 */
export function FeatureAnimation({
	feature,
	controls = false,
	className,
}: FeatureAnimationProps) {
	const { resolvedTheme } = useTheme();
	const ref = useRef<HTMLDivElement>(null);
	const playerRef = useRef<PlayerRef>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => setInView(entry.isIntersecting),
			{ threshold: 0.35 },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (inView) {
			playerRef.current?.play();
		} else {
			playerRef.current?.pause();
		}
	}, [inView]);

	const video = FEATURE_VIDEOS[feature];

	return (
		<div ref={ref} className={className}>
			<Player
				ref={playerRef}
				component={video.component}
				inputProps={{ theme: resolvedTheme === "dark" ? "dark" : "light" }}
				durationInFrames={video.durationInFrames}
				fps={VIDEO_CONFIG.fps}
				compositionWidth={VIDEO_CONFIG.width}
				compositionHeight={VIDEO_CONFIG.height}
				style={{ width: "100%" }}
				autoPlay={false}
				loop
				controls={controls}
				clickToPlay={controls}
				spaceKeyToPlayOrPause={controls}
				acknowledgeRemotionLicense
			/>
		</div>
	);
}
