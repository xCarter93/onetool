"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { isMotionPaused, subscribeMotionPaused } from "../motion-pause";
import { DAY, FINAL_STEP, RESET_HOLD, RESET_STEP } from "./day";

const HOLD_MS = [...DAY.map(({ hold }) => hold), RESET_HOLD];

export function HeroStage({ className, children }: { className?: string; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const beats = [...root.querySelectorAll<HTMLElement>(".lp-beat")];
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
		let step = 0;
		let timer = 0;
		let inView = false;

		const show = (next: number) => {
			step = next;
			root.dataset.step = String(next);
			root.style.setProperty("--p", String((DAY[next] ?? DAY[0]).at));
			const lit = beats.findIndex((beat) => beat.dataset.on?.split(" ").includes(String(next)));
			beats.forEach((beat, i) => beat.toggleAttribute("data-past", i < lit));
		};
		const settle = () => {
			clearTimeout(timer);
			if (inView) root.dataset.drawn = "";
			if (reduce.matches) {
				show(FINAL_STEP);
				return;
			}
			// The rewind beat clears the sheet, so a pause there holds the opening frame instead.
			if (isMotionPaused() && step === RESET_STEP) show(0);
			if (!inView || document.hidden || isMotionPaused()) return;
			timer = window.setTimeout(() => {
				const next = (step + 1) % HOLD_MS.length;
				// The first paint is the finished quote; only a quote that follows a rewind writes itself in.
				if (next === 0) root.dataset.replay = "";
				show(next);
				settle();
			}, HOLD_MS[step]);
		};

		const observer = new IntersectionObserver(([entry]) => {
			inView = entry.isIntersecting;
			settle();
		});
		observer.observe(root.querySelector(".lp-job") ?? root);
		document.addEventListener("visibilitychange", settle);
		reduce.addEventListener("change", settle);
		const unsubscribe = subscribeMotionPaused(settle);
		return () => {
			unsubscribe();
			observer.disconnect();
			document.removeEventListener("visibilitychange", settle);
			reduce.removeEventListener("change", settle);
			clearTimeout(timer);
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
