import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { EASE_OUT } from "./lib/anim";
import { themed } from "./lib/themed";
import { REEL_TRANSITION, STORY_CHAPTERS, STORY_SEGMENTS } from "./manifest";
import { SCENE_PARTS } from "./scene-parts";
import { blueprintSweep } from "./transitions/blueprint-sweep";
import { AppFrame, NAV_INDEX } from "./ui/app-frame";
import { resolveShellValue, type SceneShell } from "./ui/scene-shell";
import { useTheme } from "./ui/primitives";

const T = REEL_TRANSITION;
const LAST = STORY_CHAPTERS.length - 1;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Index of the chapter whose own sequence has started at reel frame `f`. */
const chapterAt = (f: number) => {
	let i = 0;
	while (i < LAST && f >= STORY_SEGMENTS[i + 1].from) i++;
	return i;
};

/** Nearest shell chapter at or before `i` — full-bleed chapters have no shell. */
const shellChapterAt = (i: number) => {
	let j = i;
	while (j > 0 && STORY_CHAPTERS[j].layout !== "shell") j--;
	return j;
};

/** Nearest shell chapter strictly before `i`, or `i` when there is none. */
const shellChapterBefore = (i: number) => {
	let j = i - 1;
	while (j > 0 && STORY_CHAPTERS[j].layout !== "shell") j--;
	return j < 0 ? i : j;
};

const navIndexOf = (shell: SceneShell, localFrame: number) =>
	shell.activeIndex
		? shell.activeIndex(localFrame)
		: (NAV_INDEX[resolveShellValue(shell.active, localFrame)] ?? 0);

/** Chapter-local fade: in over the entry sweep, out over the exit sweep. */
const ChapterFade: React.FC<{
	index: number;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}> = ({ index, style, children }) => {
	const local = useCurrentFrame();
	const d = STORY_CHAPTERS[index].durationInFrames;
	const fadeIn = index === 0 ? 1 : clamp01(local / T);
	const fadeOut = index === LAST ? 1 : clamp01((d - local) / T);
	return <div style={{ ...style, opacity: fadeIn * fadeOut }}>{children}</div>;
};

/** Per-chapter header controls, each on its own chapter-local clock. */
const ReelHeaderActions: React.FC = () => (
	<>
		{STORY_CHAPTERS.map((chapter, i) => {
			const { HeaderAction } = SCENE_PARTS[chapter.key].shell;
			if (!HeaderAction || chapter.layout !== "shell") return null;
			return (
				<Sequence
					key={chapter.key}
					from={STORY_SEGMENTS[i].from}
					durationInFrames={chapter.durationInFrames}
					layout="none"
				>
					<ChapterFade
						index={i}
						style={{ display: "flex", alignItems: "center", gap: 14 }}
					>
						<HeaderAction />
					</ChapterFade>
				</Sequence>
			);
		})}
	</>
);

/** Composition-scale overlays (scene cursors) above everything. */
const ReelOverlays: React.FC = () => (
	<>
		{STORY_CHAPTERS.map((chapter, i) => {
			const { Overlay } = SCENE_PARTS[chapter.key].shell;
			if (!Overlay || chapter.layout !== "shell") return null;
			return (
				<Sequence
					key={chapter.key}
					from={STORY_SEGMENTS[i].from}
					durationInFrames={chapter.durationInFrames}
					layout="none"
				>
					<ChapterFade index={i} style={{ position: "absolute", inset: 0 }}>
						<Overlay />
					</ChapterFade>
				</Sequence>
			);
		})}
	</>
);

/**
 * The workspace shell around one shell-layout chapter.
 *
 * Every prop it renders is a pure function of the REEL frame, never of which
 * chapter is hosting it. That is what makes the shell pixel-identical on both
 * sides of a shell→shell sweep: the sweep clips two identical shells against
 * each other, so only the canvas underneath appears to change, exactly as when
 * a single AppFrame stayed mounted for the whole reel.
 */
const ReelShell: React.FC<{
	/** Reel frame this chapter's sequence starts on. */
	reelFrom: number;
	children?: React.ReactNode;
}> = ({ reelFrom, children }) => {
	const frame = useCurrentFrame() + reelFrom;

	const at = chapterAt(frame);
	const i = shellChapterAt(at);
	const prev = shellChapterBefore(i);
	const cur = SCENE_PARTS[STORY_CHAPTERS[i].key].shell;
	const before = SCENE_PARTS[STORY_CHAPTERS[prev].key].shell;

	// Glide only between CONTIGUOUS shell chapters. Chapter 0 has no entry, and
	// arriving from a full-bleed chapter means the previous nav row was never on
	// screen — sliding a pill away from it would be a move the viewer can't read.
	const glides =
		at === i && i > 0 && STORY_CHAPTERS[i - 1].layout === "shell";
	const raw = glides ? clamp01((frame - STORY_SEGMENTS[i].from) / T) : 1;
	const mix = interpolate(raw, [0, 1], [0, 1], { easing: EASE_OUT });

	const curLocal = frame - STORY_SEGMENTS[i].from;
	const prevLocal = frame - STORY_SEGMENTS[prev].from;

	const activeFloat = interpolate(
		mix,
		[0, 1],
		[navIndexOf(before, prevLocal), navIndexOf(cur, curLocal)],
	);

	return (
		<AppFrame
			active={resolveShellValue(cur.active, curLocal)}
			activeFloat={activeFloat}
			title={resolveShellValue(before.title, prevLocal)}
			titleB={resolveShellValue(cur.title, curLocal)}
			titleMix={mix}
			headerRight={
				/* Negative `from` restores the reel clock inside this sequence, so the
				   header stack below can keep using absolute reel positions and stays
				   a pure function of the reel frame. */
				<Sequence from={-reelFrom} layout="none">
					<ReelHeaderActions />
				</Sequence>
			}
		>
			{children}
		</AppFrame>
	);
};

/**
 * The landing rail's single composition: every chapter in one
 * `<TransitionSeries>`, swept between by `blueprintSweep`.
 *
 * Shell chapters wrap their canvas in `<ReelShell>`; a `layout: "full"` chapter
 * renders bare and owns the whole 1600×1000 stage. Because the shell is a pure
 * function of the reel frame, repeating it per sequence costs nothing visually
 * — but it lets the sweep carry shell AND canvas out together when the next
 * chapter is full-bleed, which a single hoisted AppFrame could not do.
 */
export const StoryReel: React.FC = () => {
	const t = useTheme();

	return (
		<AbsoluteFill>
			<TransitionSeries>
				{STORY_CHAPTERS.flatMap((chapter, index) => {
					const { Content } = SCENE_PARTS[chapter.key];
					const sequence = (
						<TransitionSeries.Sequence
							key={chapter.key}
							durationInFrames={chapter.durationInFrames}
							name={chapter.label}
						>
							{chapter.layout === "full" ? (
								<Content />
							) : (
								<ReelShell reelFrom={STORY_SEGMENTS[index].from}>
									<Content />
								</ReelShell>
							)}
						</TransitionSeries.Sequence>
					);
					if (index === 0) return [sequence];
					return [
						<TransitionSeries.Transition
							key={`sweep-${chapter.key}`}
							timing={linearTiming({ durationInFrames: T })}
							presentation={blueprintSweep({ line: t.border })}
						/>,
						sequence,
					];
				})}
			</TransitionSeries>
			<ReelOverlays />
		</AbsoluteFill>
	);
};

export default themed(StoryReel);
