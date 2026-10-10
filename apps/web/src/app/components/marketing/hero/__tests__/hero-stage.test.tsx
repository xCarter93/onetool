// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMotionPaused } from "../../motion-pause";
import { DAY, FINAL_STEP, PAID_STEP, RESET_STEP } from "../day";
import { HeroStage } from "../hero-stage";

let reduce: boolean;
let intersect: (visible: boolean) => void;

beforeEach(() => {
	vi.useFakeTimers();
	setMotionPaused(false);
	reduce = false;
	vi.stubGlobal("matchMedia", vi.fn(() => ({
		matches: reduce,
		addEventListener: () => {},
		removeEventListener: () => {},
	})));
	vi.stubGlobal("IntersectionObserver", class {
		constructor(callback: IntersectionObserverCallback) {
			intersect = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
		}
		observe() {}
		disconnect() {}
	});
	vi.stubGlobal("ResizeObserver", class {
		observe() {}
		disconnect() {}
	});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function renderStage() {
	const { container } = render(
		<HeroStage>
			<h1>
				<span className="lp-beat" data-on="0">Quote it.</span>
				<span className="lp-beat" data-on="1 2">Get it signed.</span>
				<span className="lp-beat" data-on="3 4">Get paid.</span>
			</h1>
		</HeroStage>
	);
	return container.firstElementChild as HTMLElement;
}

const past = (root: HTMLElement) => [...root.querySelectorAll(".lp-beat")].map((beat) => beat.hasAttribute("data-past"));

describe("HeroStage", () => {
	it("shows the end of the day at once under reduced motion", () => {
		reduce = true;
		const root = renderStage();
		act(() => intersect(true));
		expect(root.dataset.step).toBe(String(FINAL_STEP));
		expect(root.style.getPropertyValue("--p")).toBe(String(DAY[FINAL_STEP].at));
		expect(past(root)).toEqual([true, true, false]);
		act(() => vi.advanceTimersByTime(10000));
		expect(root.dataset.step).toBe(String(FINAL_STEP));
	});

	it("plays the job through to paid, then rewinds within 30 seconds", () => {
		const root = renderStage();
		act(() => intersect(true));
		const seen = [root.dataset.step];
		const playhead = [root.style.getPropertyValue("--p")];
		let elapsed = 0;
		while (elapsed < 60000 && seen.length < RESET_STEP + 2) {
			act(() => vi.advanceTimersByTime(100));
			elapsed += 100;
			if (root.dataset.step !== seen.at(-1)) {
				seen.push(root.dataset.step);
				playhead.push(root.style.getPropertyValue("--p"));
			}
		}
		expect(seen).toEqual([...Array.from({ length: RESET_STEP + 1 }, (_, i) => String(i)), "0"]);
		expect(playhead.at(PAID_STEP)).toBe(String(DAY[PAID_STEP].at));
		expect(playhead.at(RESET_STEP)).toBe(playhead[0]);
		expect(elapsed).toBeLessThanOrEqual(30000);
	});

	it("writes the sheet in only on replays, after the first rewind", () => {
		const root = renderStage();
		act(() => intersect(true));
		expect(root.hasAttribute("data-replay")).toBe(false);
		act(() => vi.advanceTimersByTime(DAY.reduce((sum, { hold }) => sum + hold, 0) + 100));
		expect(root.dataset.step).toBe(String(RESET_STEP));
		expect(root.hasAttribute("data-replay")).toBe(false);
		act(() => vi.advanceTimersByTime(1000));
		expect(root.dataset.step).toBe("0");
		expect(root.hasAttribute("data-replay")).toBe(true);
	});

	it("marks the beats already done and clears them on the rewind", () => {
		const root = renderStage();
		act(() => intersect(true));
		expect(past(root)).toEqual([false, false, false]);
		act(() => vi.advanceTimersByTime(DAY.slice(0, PAID_STEP).reduce((sum, { hold }) => sum + hold, 0) + 100));
		expect(root.dataset.step).toBe(String(PAID_STEP));
		expect(past(root)).toEqual([true, true, false]);
		act(() => vi.advanceTimersByTime(DAY[PAID_STEP].hold));
		expect(root.dataset.step).toBe(String(RESET_STEP));
		expect(past(root)).toEqual([false, false, false]);
	});

	it("advances only while on screen", () => {
		const root = renderStage();
		act(() => vi.advanceTimersByTime(5000));
		expect(root.dataset.step).toBe("0");
		expect(root.hasAttribute("data-drawn")).toBe(false);
		act(() => intersect(true));
		expect(root.hasAttribute("data-drawn")).toBe(true);
		act(() => vi.advanceTimersByTime(DAY[0].hold));
		expect(root.dataset.step).toBe("1");
		act(() => intersect(false));
		act(() => vi.advanceTimersByTime(10000));
		expect(root.dataset.step).toBe("1");
	});

	it("holds its step while motion is paused", () => {
		const root = renderStage();
		act(() => intersect(true));
		act(() => vi.advanceTimersByTime(DAY[0].hold));
		expect(root.dataset.step).toBe("1");
		act(() => setMotionPaused(true));
		act(() => vi.advanceTimersByTime(20000));
		expect(root.dataset.step).toBe("1");
		act(() => setMotionPaused(false));
		act(() => vi.advanceTimersByTime(DAY[1].hold));
		expect(root.dataset.step).toBe("2");
	});
});
