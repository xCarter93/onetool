"use client";

import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	chapterFor,
	STORY_REEL_DURATION,
	STORY_SEGMENTS,
	VIDEO_CONFIG,
	type FeatureKey,
} from "@/remotion/manifest";
import { loadStoryReel, SCENE_LOADERS } from "@/remotion/scene-loaders";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export type { FeatureKey };

/** Shared Player wiring — see the long note on <Player> below for why. */
const AUDIOLESS = {
	initiallyMuted: true,
	numberOfSharedAudioTags: 0,
	showVolumeControls: false,
} as const;

/**
 * The lg+ rail's plate: ONE persistent Player running the whole story reel.
 * Activating a chapter seeks to its segment and plays to the segment's end,
 * where it holds — the reel never loops and never rewinds on its own, so the
 * shell chrome (sidebar pill, page title) carries continuously between
 * chapters instead of remounting.
 */
export function StoryReelPlayer({
	feature,
	className,
}: {
	feature: FeatureKey;
	className?: string;
}) {
	const { resolvedTheme } = useTheme();
	const reduced = usePrefersReducedMotion();
	const playerRef = useRef<PlayerRef>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const [inView, setInView] = useState(false);
	// Looked up by key, not by the rail's index: reordering the rail copy can
	// never silently point a chapter at the wrong stretch of the reel.
	const segment =
		STORY_SEGMENTS.find((s) => s.key === feature) ?? STORY_SEGMENTS[0];
	const from = segment.from;
	// `to` is the next segment's exclusive start; the reel's own last frame is
	// duration - 1, so clamp or the final chapter would never reach its stop.
	const stopAt = Math.min(segment.to, STORY_REEL_DURATION - 1);
	const lazyComponent = useCallback(() => loadStoryReel(), []);
	const inputProps = {
		theme: resolvedTheme === "dark" ? "dark" : "light",
	} as const;

	useEffect(() => {
		const node = wrapRef.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => setInView(entry.isIntersecting),
			{ threshold: 0.35 },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const player = playerRef.current;
		if (!player || reduced) return;

		// Off-screen the reel rests: no playback, and no listeners that could
		// restart it on a visibilitychange while it's scrolled out of view.
		if (!inView) {
			player.pause();
			return;
		}

		// Segments tile the timeline (`to[i] === from[i + 1]`), so arriving from
		// the previous chapter needs no seek at all — just keep rolling through
		// the sweep. Any other arrival (jump, scroll-back) seeks first.
		if (player.getCurrentFrame() !== from) player.seekTo(from);

		let held = false;
		let raf = 0;
		// Same dropped-play() guard as the ambient embeds: play() is a one-shot
		// that early-returns when the Player already thinks it is playing, and the
		// reel has no visitor-reachable control to recover from a missed start.
		const ensurePlaying = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				if (held || document.hidden) return;
				if (!player.isPlaying()) player.play();
			});
		};
		const onFrame = (e: { detail: { frame: number } }) => {
			if (held || e.detail.frame < stopAt) return;
			held = true;
			player.pause();
			// Land exactly on the boundary: a fully-entered scene, never a blend.
			player.seekTo(stopAt);
			player.pause();
		};

		ensurePlaying();
		player.addEventListener("frameupdate", onFrame);
		player.addEventListener("pause", ensurePlaying);
		document.addEventListener("visibilitychange", ensurePlaying);
		return () => {
			cancelAnimationFrame(raf);
			player.removeEventListener("frameupdate", onFrame);
			player.removeEventListener("pause", ensurePlaying);
			document.removeEventListener("visibilitychange", ensurePlaying);
		};
	}, [reduced, from, stopAt, inView]);

	// Reduced motion: a still of the settled chapter, and no playback engine.
	if (reduced) {
		return (
			<div ref={wrapRef} className={className}>
				<Thumbnail
					lazyComponent={lazyComponent}
					inputProps={inputProps}
					frameToDisplay={stopAt}
					durationInFrames={STORY_REEL_DURATION}
					fps={VIDEO_CONFIG.fps}
					compositionWidth={VIDEO_CONFIG.width}
					compositionHeight={VIDEO_CONFIG.height}
					style={{ width: "100%" }}
				/>
			</div>
		);
	}

	return (
		<div ref={wrapRef} className={className}>
			<Player
				ref={playerRef}
				lazyComponent={lazyComponent}
				inputProps={inputProps}
				durationInFrames={STORY_REEL_DURATION}
				fps={VIDEO_CONFIG.fps}
				compositionWidth={VIDEO_CONFIG.width}
				compositionHeight={VIDEO_CONFIG.height}
				style={{ width: "100%" }}
				autoPlay={false}
				loop={false}
				moveToBeginningWhenEnded={false}
				controls={false}
				clickToPlay={false}
				spaceKeyToPlayOrPause={false}
				{...AUDIOLESS}
				acknowledgeRemotionLicense
			/>
		</div>
	);
}

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
 *
 * The scene module is loaded through `lazyComponent`, so nothing but the
 * manifest (keys, durations, poster frames) is reachable from the landing
 * bundle — one chunk per scene, fetched when the embed mounts.
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
	// pause control. Instead of a Player parked on frame 0 (which reads as a
	// blank plate), render a <Thumbnail> of the scene's settled poster frame:
	// same picture the scene ends on, and no playback engine at all.
	const reduced = usePrefersReducedMotion();

	useEffect(() => {
		const player = playerRef.current;
		if (!player) return;

		if (!inView) {
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
	}, [inView, controls]);

	const chapter = chapterFor(feature);
	const lazyComponent = useCallback(() => SCENE_LOADERS[feature](), [feature]);
	const inputProps = {
		theme: forceTheme ?? (resolvedTheme === "dark" ? "dark" : "light"),
	} as const;

	if (reduced) {
		return (
			<div ref={ref} className={className}>
				<Thumbnail
					lazyComponent={lazyComponent}
					inputProps={inputProps}
					frameToDisplay={chapter.posterFrame}
					durationInFrames={chapter.durationInFrames}
					fps={VIDEO_CONFIG.fps}
					compositionWidth={VIDEO_CONFIG.width}
					compositionHeight={VIDEO_CONFIG.height}
					style={{ width: "100%" }}
				/>
			</div>
		);
	}

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
				lazyComponent={lazyComponent}
				inputProps={inputProps}
				durationInFrames={chapter.durationInFrames}
				fps={VIDEO_CONFIG.fps}
				compositionWidth={VIDEO_CONFIG.width}
				compositionHeight={VIDEO_CONFIG.height}
				style={{ width: "100%" }}
				autoPlay={false}
				loop
				controls={controls}
				clickToPlay={controls}
				spaceKeyToPlayOrPause={controls}
				{...AUDIOLESS}
				acknowledgeRemotionLicense
			/>
		</div>
	);
}
