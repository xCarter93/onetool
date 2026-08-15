"use client";

import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { CARD_ONLY, DUR, FPS } from "@/remotion/job-scenes/durations";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export type JobSceneKey = "clientRecord" | "weekPlan" | "threadAssistant";

/* Dynamic-import table so the landing bundle ships neither the scenes nor
 * @remotion/player's render graph until a card scrolls near the viewport —
 * the same lazyComponent pattern as src/remotion/scene-loaders.ts. */
const LOADERS: Record<JobSceneKey, () => Promise<{ default: ComponentType }>> = {
	clientRecord: () => import("@/remotion/job-scenes/scenes/ClientRecord"),
	weekPlan: () => import("@/remotion/job-scenes/scenes/WeekPlan"),
	threadAssistant: () => import("@/remotion/job-scenes/scenes/ThreadAssistant"),
};

const CONFIG: Record<JobSceneKey, { durationInFrames: number; height: number }> = {
	clientRecord: { durationInFrames: DUR.clientRecord, height: CARD_ONLY.clientRecord },
	weekPlan: { durationInFrames: DUR.weekPlan, height: CARD_ONLY.weekPlan },
	threadAssistant: { durationInFrames: DUR.threadAssistant, height: CARD_ONLY.threadAssistant },
};

/* Shared Player wiring, copied from feature-animation.tsx: the scenes carry no
 * audio, and Remotion's audio path is what breaks muted autoplay (usePlayback
 * parks the frame loop on a pending AudioContext.resume() that Chrome never
 * settles without a gesture). initiallyMuted keeps that branch unreachable. */
const AUDIOLESS = {
	initiallyMuted: true,
	numberOfSharedAudioTags: 0,
	showVolumeControls: false,
} as const;

/**
 * A "What's inside" card slot playing one job scene as a chromeless ambient
 * loop: plays only while on screen, loops, and re-asserts playback on a
 * dropped play() (Remotion's play() is a void one-shot that early-returns
 * while the player already believes it is playing). Reduced motion renders a
 * settled <Thumbnail> instead of a playback engine.
 */
export function JobScenePlayer({
	scene,
	label,
	className,
}: {
	scene: JobSceneKey;
	/** Accessible description of what the animation shows. */
	label: string;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const playerRef = useRef<PlayerRef>(null);
	const [inView, setInView] = useState(false);
	// Flips when the Player actually mounts — the play-assert effect must re-run
	// then, or an IntersectionObserver callback that landed during the
	// reduced-first hydration render (no Player yet) parks the scene on frame 0
	// forever: inView never changes again, so [inView] alone never re-fires.
	const [playerReady, setPlayerReady] = useState(false);
	const attachPlayer = useCallback((p: PlayerRef | null) => {
		playerRef.current = p;
		setPlayerReady(p !== null);
	}, []);
	const reduced = usePrefersReducedMotion();
	const { durationInFrames, height } = CONFIG[scene];
	const lazyComponent = useCallback(() => LOADERS[scene](), [scene]);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => setInView(entry.isIntersecting),
			{ threshold: 0.35 }
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const player = playerRef.current;
		if (!player || !playerReady) return;

		if (!inView) {
			player.pause();
			return;
		}

		let raf = 0;
		const ensurePlaying = () => {
			cancelAnimationFrame(raf);
			// Next frame, so re-asserting can never recurse inside a pause dispatch.
			raf = requestAnimationFrame(() => {
				if (!document.hidden && !player.isPlaying()) player.play();
			});
		};

		ensurePlaying();
		player.addEventListener("pause", ensurePlaying);
		document.addEventListener("visibilitychange", ensurePlaying);
		return () => {
			cancelAnimationFrame(raf);
			player.removeEventListener("pause", ensurePlaying);
			document.removeEventListener("visibilitychange", ensurePlaying);
		};
	}, [inView, playerReady]);

	if (reduced) {
		return (
			<div ref={ref} className={className} role="img" aria-label={label}>
				<Thumbnail
					lazyComponent={lazyComponent}
					frameToDisplay={durationInFrames - 8}
					durationInFrames={durationInFrames}
					fps={FPS}
					compositionWidth={CARD_ONLY.width}
					compositionHeight={height}
					style={{ width: "100%" }}
				/>
			</div>
		);
	}

	return (
		<div ref={ref} className={className} role="img" aria-label={label}>
			<Player
				ref={attachPlayer}
				lazyComponent={lazyComponent}
				durationInFrames={durationInFrames}
				fps={FPS}
				compositionWidth={CARD_ONLY.width}
				compositionHeight={height}
				style={{ width: "100%" }}
				autoPlay={false}
				loop
				controls={false}
				clickToPlay={false}
				spaceKeyToPlayOrPause={false}
				{...AUDIOLESS}
				acknowledgeRemotionLicense
			/>
		</div>
	);
}
