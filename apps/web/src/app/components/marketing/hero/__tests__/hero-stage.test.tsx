// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMotionPaused } from "../../motion-pause";
import { DAY, FINAL_STEP, PAID_STEP, RESET_STEP } from "../day";
import { HeroStage } from "../hero-stage";

const TO_PAID_MS = DAY.slice(0, PAID_STEP).reduce((sum, { hold }) => sum + hold, 0) + 100;

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
			<strong data-collected>$11,860.00</strong>
		</HeroStage>
	);
	return container.firstElementChild as HTMLElement;
}

describe("HeroStage", () => {
	it("shows the end of the day at once under reduced motion", () => {
		reduce = true;
		const root = renderStage();
		act(() => intersect(true));
		expect(root.dataset.step).toBe(String(FINAL_STEP));
		expect(root.style.getPropertyValue("--p")).toBe("1");
		expect(root.querySelector("[data-collected]")?.textContent).toBe("$12,942.50");
		act(() => vi.advanceTimersByTime(10000));
		expect(root.dataset.step).toBe(String(FINAL_STEP));
	});

	it("plays the day through to 5 PM, then rewinds within 30 seconds", () => {
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
		expect(playhead.at(FINAL_STEP)).toBe("1");
		expect(playhead.at(RESET_STEP)).toBe(playhead[0]);
		expect(elapsed).toBeLessThanOrEqual(30000);
		expect(root.querySelector("[data-collected]")?.textContent).toBe("$11,860.00");
	});

	it("advances only while on screen", () => {
		const root = renderStage();
		act(() => vi.advanceTimersByTime(5000));
		expect(root.dataset.step).toBe("0");
		expect(root.hasAttribute("data-drawn")).toBe(false);
		act(() => intersect(true));
		expect(root.hasAttribute("data-drawn")).toBe(true);
		act(() => vi.advanceTimersByTime(2000));
		expect(root.dataset.step).toBe("1");
		act(() => intersect(false));
		act(() => vi.advanceTimersByTime(10000));
		expect(root.dataset.step).toBe("1");
	});

	it("holds its step while motion is paused", () => {
		const root = renderStage();
		act(() => intersect(true));
		act(() => vi.advanceTimersByTime(2000));
		expect(root.dataset.step).toBe("1");
		act(() => setMotionPaused(true));
		act(() => vi.advanceTimersByTime(20000));
		expect(root.dataset.step).toBe("1");
		act(() => setMotionPaused(false));
		act(() => vi.advanceTimersByTime(DAY[1].hold));
		expect(root.dataset.step).toBe("2");
	});

	it("stops the collected amount immediately when paused during its count", () => {
		const root = renderStage();
		act(() => intersect(true));
		act(() => vi.advanceTimersByTime(TO_PAID_MS));
		expect(root.dataset.step).toBe("6");
		act(() => setMotionPaused(true));
		const amount = root.querySelector("[data-collected]")?.textContent;
		act(() => vi.advanceTimersByTime(500));
		expect(root.querySelector("[data-collected]")?.textContent).toBe(amount);
	});
});
