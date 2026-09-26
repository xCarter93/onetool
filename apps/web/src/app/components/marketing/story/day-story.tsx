"use client";

import { animate, scroll } from "motion";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { StoryBackdrop } from "./backdrops";
import { PinnedCaptions } from "./captions";
import { CHAPTER_OFFSET, CHAPTERS, MINUTES, PACE_VH, SCENE_COUNT } from "./chapters";
import { FRAME_H, FRAME_W } from "./frame/frame-size";
import { OldWayCards } from "./frame/old-way-cards";
import { SCENE_CONTENTS } from "./frame/scene-contents";
import { WorkspaceFrame } from "./frame/workspace-frame";
import { HeroCopy } from "./hero-copy";
import { StackedStory } from "./stacked-story";
import { stepIndex } from "./step-index";
import { TimeRail } from "./time-rail";
import { useStoryMode } from "./use-story-mode";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

export function DayStory() {
	const mode = useStoryMode();
	return (
		<div id="day">
			{mode === "pinned" ? <PinnedStory /> : <StackedStory />}
		</div>
	);
}

function PinnedStory() {
	const storyRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const heroRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const captionRef = useRef<HTMLDivElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);
	const railRef = useRef<HTMLDivElement>(null);
	const cardsRef = useRef<HTMLDivElement>(null);
	const clockRef = useRef<HTMLSpanElement>(null);
	const ampmRef = useRef<HTMLSpanElement>(null);
	const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
	const sceneRef = useRef(0);
	const [scene, setScene] = useState(0);

	useLayoutEffect(() => {
		const content = contentRefs.current[scene];
		const paintEntrance = (progress: number) => {
			content?.style.setProperty(`--a${scene}`, String(progress));
			captionRef.current?.style.setProperty(`--a${scene}`, String(progress));
			if (scene === 1) cardsRef.current?.style.setProperty("--a1", String(progress));
			if (scene === 3) content?.style.setProperty("--g", String(progress * 236));
			if (scene === 8) content?.style.setProperty("--f", String(progress * 292));
		};
		paintEntrance(0);
		const entrance = animate(0, 1, {
			duration: scene === 3 || scene === 8 ? 2.4 : 1.2,
			ease: "linear",
			onUpdate: paintEntrance,
		});
		return () => entrance.stop();
	}, [scene]);

	useEffect(() => {
		const section = storyRef.current;
		const stage = stageRef.current;
		const hero = heroRef.current;
		const frame = frameRef.current;
		const caption = captionRef.current;
		const backdrop = backdropRef.current;
		const rail = railRef.current;
		if (!section || !stage || !hero || !frame || !caption || !backdrop || !rail) return;

		let progress = 0;
		let layout = { x0: 0, y0: 0, s0: 1, x1: 0, y1: 0, s1: 1 };
		let lastMinute = -1;
		const paint = (p: number) => {
			progress = p;
			const x = clamp(p) * SCENE_COUNT;
			const current = stepIndex(sceneRef.current, x);
			const t = clamp((x - 0.12) / 0.88);
			const h = t * t * (3 - 2 * t);
			frame.style.transform = `translate3d(${mix(layout.x0, layout.x1, h) - FRAME_W / 2}px,${mix(layout.y0, layout.y1, h)}px,0) perspective(1800px) rotateX(${(1 - h) * 8}deg) scale(${mix(layout.s0, layout.s1, h) / 2})`;
			hero.style.opacity = String(clamp(1 - h * 1.6));
			hero.style.transform = `translate3d(0,${-h * 24}px,0)`;
			hero.inert = h > 0.5;
			hero.setAttribute("aria-hidden", String(h > 0.5));
			caption.style.opacity = String(h);
			rail.style.opacity = String(h);
			rail.inert = h < 0.8;
			const midday = clamp((x - 4.6) / 1.2);
			const dusk = clamp((x - 9) / 1.2);
			const layers = backdrop.children;
			(layers[0] as HTMLElement).style.opacity = String(1 - midday);
			(layers[1] as HTMLElement).style.opacity = String(midday * (1 - dusk));
			(layers[2] as HTMLElement).style.opacity = String(dusk);

			rail.style.setProperty("--chapter-progress", String(clamp(x - current)));

			const index = Math.min(SCENE_COUNT - 1, Math.floor(x));
			const minute = Math.floor(mix(MINUTES[index], MINUTES[index + 1], x - index));
			if (minute !== lastMinute) {
				lastMinute = minute;
				const hours = Math.floor(minute / 60) % 24;
				if (clockRef.current) clockRef.current.textContent = `${((hours + 11) % 12) + 1}:${String(minute % 60).padStart(2, "0")}`;
				if (ampmRef.current) ampmRef.current.textContent = hours >= 12 ? "PM" : "AM";
			}
			if (current !== sceneRef.current) {
				sceneRef.current = current;
				setScene(current);
			}
		};
		const measure = () => {
			const width = stage.clientWidth;
			const height = stage.clientHeight;
			const gutter = Math.min(40, width * 0.04);
			const inner = Math.min(width, 1560) - gutter * 2;
			const left = (width - inner) / 2;
			const captionWidth = Math.min(360, inner * 0.29);
			const gap = Math.min(64, inner * 0.045);
			const available = inner - captionWidth - gap;
			const contentHeight = height - 144;
			const scale = Math.min(available / FRAME_W, contentHeight / FRAME_H, 1.12);
			const heroScale = Math.min((width - gutter * 2) / FRAME_W, 1.6);
			const heroTop = Math.max(
				hero.offsetTop + hero.offsetHeight + 40,
				height - FRAME_H * heroScale + Math.min(96, height * 0.1),
			);
			layout = {
				x0: (width - FRAME_W) / 2,
				y0: heroTop,
				s0: heroScale,
				x1: left + captionWidth + gap + available / 2 - FRAME_W / 2,
				y1: 24 + (contentHeight - FRAME_H * scale) / 2,
				s1: scale,
			};
			caption.style.left = `${left}px`;
			caption.style.top = "24px";
			caption.style.width = `${captionWidth}px`;
			caption.style.height = `${contentHeight}px`;
			paint(progress);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(stage);
		observer.observe(hero);
		measure();
		const stop = scroll(paint, { target: section, offset: ["start 64px", "end end"] });
		return () => { stop(); observer.disconnect(); };
	}, []);

	const jumpToScene = (index: number, instant = false) => {
		const section = storyRef.current;
		const stage = stageRef.current;
		if (!section || !stage) return;
		const start = section.getBoundingClientRect().top + window.scrollY - 64;
		const distance = section.offsetHeight - stage.offsetHeight;
		const destination = index + (index >= CHAPTER_OFFSET ? 0.001 : 0.2);
		window.scrollTo({ top: start + (destination / SCENE_COUNT) * distance, behavior: instant ? "instant" : "smooth" });
	};

	return (
		<section ref={storyRef} className="lp-story-pinned" aria-label="A day with OneTool" style={{ "--story-distance": `calc(${SCENE_COUNT} * min(${PACE_VH}svh, 620px))` } as CSSProperties}>
			<div ref={stageRef} className="lp-story-stage">
				<StoryBackdrop ref={backdropRef} />
				<div ref={heroRef} className="lp-story-hero"><HeroCopy onWatch={() => jumpToScene(1)} /></div>
				<div ref={captionRef} className="lp-story-caption" aria-hidden={scene === 0}>
					<div className="lp-story-clock" aria-hidden="true">
						<span className="lp-story-clock-label">A day with OneTool</span>
						<div><span ref={clockRef}>5:58</span><span ref={ampmRef} className="lp-story-ampm">AM</span></div>
					</div>
					<PinnedCaptions scene={scene} />
				</div>
				<div ref={frameRef} inert aria-hidden="true" className="lp-story-frame">
					<div className="lp-story-render">
						<WorkspaceFrame scene={scene}>
							{SCENE_CONTENTS.map((Content, index) => (
								<div key={index} ref={element => { contentRefs.current[index] = element; }} className="lp-story-scene" style={{ [`--v${index}`]: scene === index ? 1 : 0 } as CSSProperties}><Content /></div>
							))}
						</WorkspaceFrame>
						<div ref={cardsRef} style={{ "--v1": scene === 1 ? 1 : 0 } as CSSProperties}><OldWayCards /></div>
					</div>
				</div>
				<TimeRail ref={railRef} active={scene < CHAPTER_OFFSET ? -1 : scene - CHAPTER_OFFSET} onJump={jumpToScene} />
				<span className="sr-only">{scene > 1 ? `Chapter ${scene - 1} of ${CHAPTERS.length}` : "Introduction"}</span>
			</div>
		</section>
	);
}
