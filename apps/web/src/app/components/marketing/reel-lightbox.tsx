"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
	STORY_REEL_DURATION,
	STORY_SEGMENTS,
	VIDEO_CONFIG,
	type FeatureKey,
} from "@/remotion/manifest";
import { loadStoryReel } from "@/remotion/scene-loaders";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* REEL LIGHTBOX (DIRECTION.md E2) — the hero's secondary CTA opens the existing
 * nine-chapter Remotion story reel as a cinematic overlay: one job travelling
 * from first call to money in the bank, with a chapter strip to jump around.
 * The reel itself is untouched; this is only a stage for it. */

/**
 * Shared Player wiring, copied verbatim from `landing/feature-animation.tsx`.
 * No scene carries audio, and Remotion's audio path is exactly what breaks
 * muted autoplay: unmuted, `usePlayback` parks the frame loop on a pending
 * `AudioContext.resume()` that Chrome never settles without a gesture, so the
 * reel sits on frame 0 while `isPlaying()` still reports true. `initiallyMuted`
 * makes that branch unreachable; the other two drop the audio tags and the
 * volume control that would switch it back on.
 */
const AUDIOLESS = {
	initiallyMuted: true,
	numberOfSharedAudioTags: 0,
	showVolumeControls: false,
} as const;

/** The panel is force-dark, so the reel is pinned dark with it. */
const INPUT_PROPS = { theme: "dark" } as const;

/** The reel's own last frame — `STORY_REEL_DURATION` is exclusive. */
const REEL_LAST_FRAME = STORY_REEL_DURATION - 1;

/**
 * Strip labels: the ledger grammar from the hero (Quoted → Signed → Paid),
 * not the manifest's long-form names ("Invoicing & payment"). Keyed by
 * `FeatureKey`, so adding a chapter to the manifest fails the typecheck here
 * rather than silently rendering an unlabelled button.
 */
const CHAPTER_LABELS: Record<FeatureKey, string> = {
	clients: "Clients",
	"quote-build": "Quote",
	"portal-approve": "Signed",
	tasks: "Scheduled",
	routing: "Routed",
	"invoice-paid": "Paid",
	automations: "Automations",
	assistant: "Assistant",
	reports: "Reports",
};

/** Which chapter owns a reel frame. Segments tile the timeline, so this is a
 *  reverse scan for the last one that has started. */
function chapterIndexAt(frame: number): number {
	for (let i = STORY_SEGMENTS.length - 1; i >= 0; i--) {
		if (frame >= STORY_SEGMENTS[i].from) return i;
	}
	return 0;
}

export function ReelLightbox({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const reduced = usePrefersReducedMotion();
	const playerRef = useRef<PlayerRef>(null);
	const rafRef = useRef(0);
	// Once the reel reaches its end it holds there: without this, the `pause`
	// re-assert below would immediately restart it.
	const endedRef = useRef(false);
	// Chapter index, not the raw frame — `frameupdate` fires 30×/sec and this
	// state sits above the Player. Setting the same value bails out of render.
	const [activeIndex, setActiveIndex] = useState(0);

	const lazyComponent = useCallback(() => loadStoryReel(), []);

	/*
	 * Assert playback rather than firing a single play(). Remotion's play() is a
	 * void one-shot that early-returns when the player already believes it is
	 * playing, so one dropped start would strand the reel on a still frame.
	 */
	const ensurePlaying = useCallback(() => {
		cancelAnimationFrame(rafRef.current);
		// Next frame, so re-asserting can never recurse inside a pause dispatch.
		rafRef.current = requestAnimationFrame(() => {
			const player = playerRef.current;
			if (!player || endedRef.current || document.hidden) return;
			if (!player.isPlaying()) player.play();
		});
	}, []);

	useEffect(() => {
		if (!open) return;
		const player = playerRef.current;
		if (!player) return;

		endedRef.current = false;
		player.seekTo(STORY_SEGMENTS[0].from);
		setActiveIndex(0);

		const onEnded = () => {
			endedRef.current = true;
		};
		const onFrame = (e: { detail: { frame: number } }) => {
			setActiveIndex(chapterIndexAt(e.detail.frame));
			if (endedRef.current || e.detail.frame < REEL_LAST_FRAME) return;
			// Hold on the last frame instead of snapping back to the start.
			endedRef.current = true;
			player.pause();
			player.seekTo(REEL_LAST_FRAME);
		};

		player.addEventListener("frameupdate", onFrame);
		player.addEventListener("ended", onEnded);

		// Reduced motion: no autoplay. The Player renders its own controls in that
		// mode, so a visitor still has a play button and a scrubber.
		if (reduced) {
			return () => {
				player.removeEventListener("frameupdate", onFrame);
				player.removeEventListener("ended", onEnded);
			};
		}

		ensurePlaying();
		player.addEventListener("pause", ensurePlaying);
		document.addEventListener("visibilitychange", ensurePlaying);
		return () => {
			cancelAnimationFrame(rafRef.current);
			player.removeEventListener("frameupdate", onFrame);
			player.removeEventListener("ended", onEnded);
			player.removeEventListener("pause", ensurePlaying);
			document.removeEventListener("visibilitychange", ensurePlaying);
		};
	}, [open, reduced, ensurePlaying]);

	// A chapter click is an explicit request for that stretch of the reel, so it
	// plays in both motion modes — reduced motion governs unsolicited movement.
	const goToChapter = useCallback(
		(index: number) => {
			const player = playerRef.current;
			if (!player) return;
			endedRef.current = false;
			player.seekTo(STORY_SEGMENTS[index].from);
			setActiveIndex(index);
			ensurePlaying();
		},
		[ensurePlaying]
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* The page's own scrim. ui/dialog's built-in overlay is bg-black/10 —
			    right for a form, far too light under a cinematic panel — and
			    DialogContent gives no way to restyle it, so this is a second
			    backdrop in its own portal. Dismissal is outside-press on the popup,
			    which this still is. z-[70] clears the sticky nav's z-[60]. */}
			<DialogPortal>
				{/* No backdrop-filter: blurring the whole (compositor-heavy) page every
				    frame while a 1920×1080 composition plays can stall the renderer. */}
				<DialogOverlay className="z-[70] bg-black/80 motion-reduce:animate-none" />
			</DialogPortal>

			<DialogContent
				showCloseButton={false}
				className="dc-landing z-[80] w-full max-w-[min(1200px,92vw)] gap-0 rounded-2xl p-0 text-base ring-0 motion-reduce:animate-none"
				/* landing.css is unlayered, so `.dc-landing { background: var(--paper) }`
				   beats every Tailwind utility (layered styles always lose to
				   unlayered ones). Only an inline style can clear it — the visible
				   panel is the `lp-scheme-dark` child below. */
				style={{ background: "transparent" }}
			>
				<DialogDescription className="sr-only">
					A nine-chapter walkthrough of one job moving through OneTool, from the
					first client record to the payment landing.
				</DialogDescription>

				{/* `.dc-landing .lp-scheme-dark` re-inks the panel dark in BOTH themes
				    and paints its own --paper background. */}
				<div className="lp-scheme-dark flex max-h-[92dvh] flex-col overflow-hidden rounded-2xl border border-(--rule-2) shadow-[0_30px_90px_-30px_rgba(0,0,0,0.75)]">
					<div className="flex flex-none items-center justify-between gap-4 border-b border-(--rule) py-2 pl-[clamp(14px,2.5vw,24px)] pr-2">
						<span className="inline-flex items-center gap-[9px]">
							<span
								aria-hidden="true"
								className="inline-block h-[7px] w-[14px] flex-none rounded-[1px] bg-(--accent)"
							/>
							<DialogTitle className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-(--accent-ink)">
								One job, start to finish
							</DialogTitle>
						</span>

						<DialogClose
							type="button"
							className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-[10px] text-(--ink-3) transition-colors hover:bg-(--rule) hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
						>
							<span aria-hidden="true" className="text-[15px] leading-none">
								✕
							</span>
							<span className="sr-only">Close</span>
						</DialogClose>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-[clamp(12px,2vw,20px)]">
						{/* Height-aware width cap: the reel is 16:10, so this keeps the
						    whole panel inside the viewport without cropping. The
						    scroller above is the backstop when the strip wraps. */}
						<div className="mx-auto w-full max-w-[calc((92dvh-230px)*1.6)] overflow-hidden rounded-[10px] border border-(--rule) bg-black">
							{/* Mounted only while open, so closing stops playback and frees
							    the render loop rather than leaving it running behind. */}
							{open ? (
								<Player
									ref={playerRef}
									lazyComponent={lazyComponent}
									inputProps={INPUT_PROPS}
									durationInFrames={STORY_REEL_DURATION}
									fps={VIDEO_CONFIG.fps}
									compositionWidth={VIDEO_CONFIG.width}
									compositionHeight={VIDEO_CONFIG.height}
									style={{ width: "100%" }}
									autoPlay={false}
									loop={false}
									moveToBeginningWhenEnded={false}
									controls={reduced}
									clickToPlay={reduced}
									spaceKeyToPlayOrPause={reduced}
									{...AUDIOLESS}
									acknowledgeRemotionLicense
								/>
							) : null}
						</div>
					</div>

					<div className="flex flex-none flex-wrap items-center gap-x-0.5 border-t border-(--rule) px-[clamp(8px,1.5vw,14px)]">
						{STORY_SEGMENTS.map((segment, i) => {
							const active = i === activeIndex;
							return (
								<button
									key={segment.key}
									type="button"
									aria-pressed={active}
									onClick={() => goToChapter(i)}
									className={cn(
										"inline-flex min-h-11 items-center gap-[7px] rounded-[8px] px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)",
										active
											? "text-(--ink)"
											: "text-(--ink-3) hover:text-(--ink-2)"
									)}
								>
									{/* Always rendered so the row never reflows on a chapter change. */}
									<span
										aria-hidden="true"
										className={cn(
											"inline-block h-[7px] w-[14px] flex-none rounded-[1px] transition-colors",
											active ? "bg-(--accent)" : "bg-transparent"
										)}
									/>
									{CHAPTER_LABELS[segment.key]}
								</button>
							);
						})}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
