"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { formatCurrency } from "@/lib/money";
import { isMotionPaused, subscribeMotionPaused } from "../motion-pause";
import { DAY, FINAL_STEP, PAID_STEP, RESET_HOLD, RESET_STEP } from "./day";

const HOLD_MS = [...DAY.map(({ hold }) => hold), RESET_HOLD];
const COLLECTED_BEFORE = 11860;
const COLLECTED_AFTER = 12942.5;

export function HeroStage({ className, children }: { className?: string; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const counters = root.querySelectorAll<HTMLElement>("[data-collected]");
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
		const show = (next: number) => {
			step = next;
			root.dataset.step = String(next);
			root.style.setProperty("--p", String((DAY[next] ?? DAY[0]).at));
			if (next === PAID_STEP) count(COLLECTED_BEFORE, COLLECTED_AFTER);
			if (next === RESET_STEP) count(COLLECTED_AFTER, COLLECTED_BEFORE);
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
		document.addEventListener("visibilitychange", settle);
		reduce.addEventListener("change", settle);
		const unsubscribe = subscribeMotionPaused(settle);
		return () => {
			unsubscribe();
			observer.disconnect();
			document.removeEventListener("visibilitychange", settle);
			reduce.removeEventListener("change", settle);
			clearTimeout(timer);
			cancelAnimationFrame(frame);
		};
	}, []);

	return (
		<div ref={ref} data-step="0" className={className} style={{ "--p": DAY[0].at } as CSSProperties}>
			{children}
		</div>
	);
}
