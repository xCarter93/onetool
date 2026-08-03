"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import {
	FEATURE_VIDEOS,
	VIDEO_CONFIG,
	type FeatureKey,
} from "@/remotion/compositions";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export type { FeatureKey };

interface FeatureAnimationProps {
	feature: FeatureKey;
	/** Show playback controls (default: chromeless ambient loop). */
	controls?: boolean;
	/** Pin the scene to one theme regardless of the site theme (night chapter). */
	forceTheme?: "light" | "dark";
	className?: string;
}

/**
 * Embeds a OneTool Remotion feature animation. Plays only while on screen,
 * loops, muted-ambient by default, and follows the site theme.
 */
export function FeatureAnimation({
	feature,
	controls = false,
	forceTheme,
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

	// Reduced motion: never auto-play the ambient loop — the CSS reduced-motion
	// rules cannot reach Remotion playback, and the chromeless embed offers no
	// pause control. The user still gets the still first frame (and can play
	// explicitly where controls are enabled).
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const player = playerRef.current;
		if (!player) return;

		if (!inView || reduced) {
			player.pause();
			return;
		}

		/*
		 * Assert playback rather than firing a single play(). Remotion's play() is
		 * a void one-shot that early-returns when the player already believes it is
		 * playing, so one dropped start strands an ambient embed on a still frame
		 * with no control a visitor could use to recover it.
		 *
		 * isPlaying() is a trustworthy signal here *specifically* because nothing
		 * in these compositions can reach Remotion's buffering gate — the one state
		 * that freezes frames while isPlaying() stays true. That gate is only fed
		 * by <Audio>/<Video> elements and by <Img> when passed `pauseWhenLoading`;
		 * our scenes use plain <Img> and no media. If a scene ever gains audio or
		 * video, this check stops being sufficient on its own.
		 */
		let raf = 0;
		const ensurePlaying = () => {
			cancelAnimationFrame(raf);
			// Next frame, so re-asserting can never recurse inside a pause dispatch.
			raf = requestAnimationFrame(() => {
				if (!document.hidden && !player.isPlaying()) player.play();
			});
		};

		ensurePlaying();

		// Controls embeds opt out: there, a pause is the visitor's own choice.
		if (controls) return () => cancelAnimationFrame(raf);

		player.addEventListener("pause", ensurePlaying);
		// Backgrounding stops the rAF loop; returning shouldn't need a scroll.
		document.addEventListener("visibilitychange", ensurePlaying);
		return () => {
			cancelAnimationFrame(raf);
			player.removeEventListener("pause", ensurePlaying);
			document.removeEventListener("visibilitychange", ensurePlaying);
		};
	}, [inView, reduced, controls]);

	const video = FEATURE_VIDEOS[feature];

	return (
		<div ref={ref} className={className}>
			<Player
				ref={playerRef}
				component={video.component}
				inputProps={{
					theme: forceTheme ?? (resolvedTheme === "dark" ? "dark" : "light"),
				}}
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
