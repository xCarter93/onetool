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
		 * NOTE: isPlaying() only reports that play() was called — it can stay true
		 * while frames are frozen (see the `initiallyMuted` comment on <Player>).
		 * This loop guards a dropped play(), not a stalled frame loop.
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

	/*
	 * initiallyMuted / numberOfSharedAudioTags / showVolumeControls are what
	 * actually make autoplay work. No scene here contains <Audio> or <Video>, so
	 * Remotion's audio path is dead weight that only ever breaks playback:
	 *
	 * Unmuted, the Player builds an AudioContext, and usePlayback parks the whole
	 * frame loop on `getIsResumingAudioContext()` *before* it queues a rAF.
	 * Without a user gesture Chrome leaves resume() pending forever rather than
	 * rejecting it, and Remotion's waitUntilActuallyResumed() polls a clock that
	 * never advances — so the promise never settles, no frame is ever queued, and
	 * the scene sits on frame 0 while isPlaying() still reports true. Any click
	 * anywhere on the page releases it, which is why clicking a rail button
	 * looked like the trigger.
	 *
	 * initiallyMuted makes shouldCreateAudioContext false, so no context is built
	 * and that branch is unreachable. numberOfSharedAudioTags drops the 5 warm-up
	 * <audio> tags Remotion mounts for <Html5Audio>. The volume control goes with
	 * them — it would flip the audio path back on, and there is no audio for it
	 * to control.
	 */
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
				initiallyMuted
				numberOfSharedAudioTags={0}
				showVolumeControls={false}
				acknowledgeRemotionLicense
			/>
		</div>
	);
}
