"use client";

import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SCENE_LOADERS } from "@/remotion/scene-loaders";
import type { FeatureKey } from "@/remotion/manifest";
import {
	CLIENTS_DURATION,
	INVOICE_PAID_DURATION,
	PORTAL_APPROVE_DURATION,
	QUOTE_BUILD_DURATION,
	ROUTING_DURATION,
} from "@/remotion/durations";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* The job-stack's five chapters. Durations come from the scene-free constants
 * module so this file never pulls a scene into the bundle statically. */
const DURATIONS: Partial<Record<FeatureKey, number>> = {
	clients: CLIENTS_DURATION,
	"quote-build": QUOTE_BUILD_DURATION,
	"portal-approve": PORTAL_APPROVE_DURATION,
	routing: ROUTING_DURATION,
	"invoice-paid": INVOICE_PAID_DURATION,
};

const FPS = 30; // manifest stage rate
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

	const durationInFrames = DURATIONS[featureKey] ?? 240;
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
					frameToDisplay={durationInFrames - 8}
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
