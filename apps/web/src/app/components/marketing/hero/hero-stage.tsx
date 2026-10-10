"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { formatCurrency } from "@/lib/money";
import { useLandingTokens } from "../landing-tokens";
import { isMotionPaused, subscribeMotionPaused } from "../motion-pause";
import { useBeatDashes } from "./beat-dashes";
import { DAY, FINAL_STEP, PAID_STEP, RESET_HOLD, RESET_STEP } from "./day";

const HOLD_MS = [...DAY.map(({ hold }) => hold), RESET_HOLD];
const COLLECTED_BEFORE = 11860;
const COLLECTED_AFTER = 12942.5;

export function HeroStage({ className, children }: { className?: string; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [outline] = useLandingTokens("--ink-3");
	useBeatDashes(ref, outline);

	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const counters = root.querySelectorAll<HTMLElement>("[data-collected]");
		const title = root.querySelector<HTMLElement>(".lp-hero-head > h1");
		const selection = title?.querySelector<HTMLElement>(".lp-select");
		const label = selection?.querySelector<HTMLElement>(".lp-select-label");
		const beats = title ? [...title.querySelectorAll<HTMLElement>(".lp-beat")] : [];
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
		let step = 0;
		let timer = 0;
		let frame = 0;
		let inView = false;

		const paintCollected = (value: number) => {
			const text = formatCurrency(value);
			counters.forEach((counter) => {
				counter.textContent = text;
			});
		};
		const count = (from: number, to: number) => {
			cancelAnimationFrame(frame);
			const start = performance.now();
			const run = (now: number) => {
				const t = Math.min(1, (now - start) / 900);
				paintCollected(from + (to - from) * (1 - (1 - t) ** 4));
				if (t < 1) frame = requestAnimationFrame(run);
			};
			frame = requestAnimationFrame(run);
		};
		// The selection frame sits on whichever headline beat is lit, labelled with what that beat produced.
		const select = () => {
			if (!title || !selection || !label) return;
			const beat = beats.find((candidate) => candidate.dataset.on?.split(" ").includes(String(step)));
			selection.style.opacity = beat ? "1" : "0";
			if (!beat) return;
			const box = title.getBoundingClientRect();
			const rect = beat.getBoundingClientRect();
			selection.style.setProperty("--sx", `${rect.left - box.left}px`);
			selection.style.setProperty("--sy", `${rect.top - box.top}px`);
			selection.style.setProperty("--sw", `${rect.width}px`);
			selection.style.setProperty("--sh", `${rect.height}px`);
			label.textContent = beat.dataset.label ?? "";
			if (!("placed" in selection.dataset)) requestAnimationFrame(() => (selection.dataset.placed = ""));
		};
		const show = (next: number) => {
			step = next;
			root.dataset.step = String(next);
			root.style.setProperty("--p", String((DAY[next] ?? DAY[0]).at));
			if (next === PAID_STEP) count(COLLECTED_BEFORE, COLLECTED_AFTER);
			if (next === RESET_STEP) count(COLLECTED_AFTER, COLLECTED_BEFORE);
			select();
			if (next === 0) {
				cancelAnimationFrame(frame);
				paintCollected(COLLECTED_BEFORE);
			}
		};
		const settle = () => {
			clearTimeout(timer);
			if (inView) root.dataset.drawn = "";
			if (reduce.matches) {
				cancelAnimationFrame(frame);
				show(FINAL_STEP);
				paintCollected(COLLECTED_AFTER);
				return;
			}
			// The rewind beat clears the console, so a pause there holds the opening frame instead.
			if (isMotionPaused() && step === RESET_STEP) show(0);
			if (!inView || document.hidden || isMotionPaused()) {
				cancelAnimationFrame(frame);
				paintCollected(step >= PAID_STEP && step < RESET_STEP ? COLLECTED_AFTER : COLLECTED_BEFORE);
				return;
			}
			timer = window.setTimeout(() => {
				show((step + 1) % HOLD_MS.length);
				settle();
			}, HOLD_MS[step]);
		};

		const observer = new IntersectionObserver(([entry]) => {
			inView = entry.isIntersecting;
			settle();
		});
		// The console, not the headline above it, is what has to be on screen for the day to start.
		observer.observe(root.querySelector(".lp-job") ?? root);
		const resize = new ResizeObserver(select);
		if (title) resize.observe(title);
		document.addEventListener("visibilitychange", settle);
		reduce.addEventListener("change", settle);
		const unsubscribe = subscribeMotionPaused(settle);
		return () => {
			unsubscribe();
			observer.disconnect();
			resize.disconnect();
			document.removeEventListener("visibilitychange", settle);
			reduce.removeEventListener("change", settle);
			clearTimeout(timer);
			cancelAnimationFrame(frame);
		};
	}, []);

	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const tilt = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
		let frame = 0;
		const reset = () => {
			cancelAnimationFrame(frame);
			root.style.removeProperty("--px");
			root.style.removeProperty("--py");
		};
		const follow = (event: PointerEvent) => {
			if (!tilt.matches || isMotionPaused()) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const box = root.getBoundingClientRect();
				root.style.setProperty("--px", (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3));
				root.style.setProperty("--py", (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3));
			});
		};
		root.addEventListener("pointermove", follow);
		root.addEventListener("pointerleave", reset);
		const unsubscribe = subscribeMotionPaused(reset);
		return () => {
			unsubscribe();
			root.removeEventListener("pointermove", follow);
			root.removeEventListener("pointerleave", reset);
			cancelAnimationFrame(frame);
		};
	}, []);

	return (
		<div ref={ref} data-step="0" className={className} style={{ "--p": DAY[0].at } as CSSProperties}>
			{children}
		</div>
	);
}
