"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { isMotionPaused, subscribeMotionPaused } from "../motion-pause";

// Frames waiting offscreen stay part-drawn, so a fast scroll never meets an empty panel.
const START = 0.3;
const HOLD_MS = 900;
const MIN_STEP_MS = 450;

type Pacing = { sweepMs: number; stops: number[] };
const SWEEP: Pacing = { sweepMs: 1200, stops: [1] };
// Progress values a scene stops at for HOLD_MS; sweepMs is the pace of a full START-to-1 run.
const PACING: Record<string, Pacing> = {
	// Holds on Sent; --record-done turns it Approved between 0.78 and 0.95.
	"5": { sweepMs: 1200, stops: [0.78, 1] },
	// --f = progress * 292: trigger fired (110), loop on invoice 1 (124), condition answered Yes (146), then both actions and the result.
	"8": { sweepMs: 2400, stops: [0.377, 0.425, 0.5, 1] },
};

function paint(frame: HTMLElement, progress: number) {
	const scene = Number(frame.dataset.howScene);
	frame.style.setProperty(`--a${scene}`, String(progress));
	if (scene === 8) frame.style.setProperty("--f", String(progress * 292));
}

function segments({ sweepMs, stops }: Pacing) {
	let from = START;
	let start = 0;
	return stops.map((to) => {
		const duration = Math.max(MIN_STEP_MS, ((to - from) / (1 - START)) * sweepMs);
		const segment = { from, to, start, end: start + duration };
		from = to;
		start = segment.end + HOLD_MS;
		return segment;
	});
}

export function HowStage({ className, children }: { className?: string; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const frames = Array.from(root.querySelectorAll<HTMLElement>("[data-how-scene]"));
		const running = new Map<HTMLElement, number>();

		const play = (frame: HTMLElement) => {
			const steps = segments(PACING[frame.dataset.howScene ?? ""] ?? SWEEP);
			const end = steps[steps.length - 1].end;
			const start = performance.now();
			const run = (now: number) => {
				const elapsed = now - start;
				const step = steps.find((segment) => elapsed < segment.end) ?? steps[steps.length - 1];
				const t = Math.min(1, Math.max(0, (elapsed - step.start) / (step.end - step.start)));
				paint(frame, step.from + (step.to - step.from) * t);
				if (elapsed < end) running.set(frame, requestAnimationFrame(run));
				else running.delete(frame);
			};
			running.set(frame, requestAnimationFrame(run));
		};
		const frameObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					frameObserver.unobserve(entry.target);
					play(entry.target as HTMLElement);
				}
			},
			{ threshold: 0.2 }
		);
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const still = reduceMotion.matches || isMotionPaused();
		for (const frame of frames) {
			if (still) {
				paint(frame, 1);
				continue;
			}
			// Scenes already on screen keep their finished state to avoid a flash.
			if (frame.getBoundingClientRect().top < window.innerHeight) {
				paint(frame, 1);
				continue;
			}
			paint(frame, START);
			frameObserver.observe(frame);
		}

		const stopAll = () => {
			frameObserver.disconnect();
			running.forEach((id) => cancelAnimationFrame(id));
			running.clear();
		};
		const settle = () => {
			stopAll();
			frames.forEach((frame) => paint(frame, 1));
		};
		const onReducedMotionChange = () => {
			if (reduceMotion.matches) settle();
		};
		const onVisibilityChange = () => {
			if (document.hidden) settle();
		};
		reduceMotion.addEventListener("change", onReducedMotionChange);
		document.addEventListener("visibilitychange", onVisibilityChange);
		// A one-shot entrance has nothing to resume, so pausing lands every scene.
		const unsubscribe = subscribeMotionPaused(() => {
			if (!isMotionPaused()) return;
			settle();
		});
		return () => {
			unsubscribe();
			reduceMotion.removeEventListener("change", onReducedMotionChange);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			stopAll();
		};
	}, []);

	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	);
}
