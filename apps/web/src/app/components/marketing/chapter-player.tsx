"use client";

import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SCENE_LOADERS } from "@/remotion/scene-loaders";
import { chapterFor, VIDEO_CONFIG, type FeatureKey } from "@/remotion/manifest";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* Duration and poster frame come from the manifest, which is scene-free by
 * contract — so every chapter works here without this file listing them, and
 * none of them reach the landing bundle statically. */

const FPS = VIDEO_CONFIG.fps;
const STAGE = { width: 1600, height: 1000 } as const;

/* Same audio config as scene-player.tsx: scenes carry no audio, and Remotion's
 * audio path is what breaks muted autoplay. */
const AUDIOLESS = {
	initiallyMuted: true,
	numberOfSharedAudioTags: 0,
	showVolumeControls: false,
} as const;

/**
 * One reel chapter inside a scroll-stack card. Plays (looping) only while
 * `active`; reduced motion renders the chapter's settled last frame instead.
 * The playerReady callback-ref dance mirrors scene-player.tsx — an `active`
 * flip that lands before the Player mounts must re-fire once it does.
 */
export function ChapterPlayer({
	featureKey,
	active,
	label,
	className,
}: {
	featureKey: FeatureKey;
	active: boolean;
	label: string;
	className?: string;
}) {
	const [player, setPlayer] = useState<PlayerRef | null>(null);
	const attachPlayer = useCallback((p: PlayerRef | null) => setPlayer(p), []);
	const reduced = usePrefersReducedMotion();
	const { resolvedTheme } = useTheme();
	const theme = resolvedTheme === "dark" ? "dark" : "light";

	const { durationInFrames, posterFrame } = chapterFor(featureKey);
	const lazyComponent = useCallback(
		() => SCENE_LOADERS[featureKey](),
		[featureKey]
	);

	useEffect(() => {
		if (!player) return;
		if (!active) {
			player.pause();
			return;
		}

		let raf = 0;
		const ensurePlaying = () => {
			cancelAnimationFrame(raf);
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
	}, [active, player]);

	if (reduced) {
		return (
			<div className={className} role="img" aria-label={label}>
				<Thumbnail
					lazyComponent={lazyComponent}
					frameToDisplay={posterFrame}
					durationInFrames={durationInFrames}
					fps={FPS}
					compositionWidth={STAGE.width}
					compositionHeight={STAGE.height}
					inputProps={{ theme }}
					style={{ width: "100%" }}
				/>
			</div>
		);
	}

	return (
		<div className={className} role="img" aria-label={label}>
			<Player
				ref={attachPlayer}
				lazyComponent={lazyComponent}
				durationInFrames={durationInFrames}
				fps={FPS}
				compositionWidth={STAGE.width}
				compositionHeight={STAGE.height}
				inputProps={{ theme }}
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
