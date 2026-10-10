// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, type CSSProperties } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMotionPaused } from "../../motion-pause";
import { HowStage } from "../how-stage";

let observers: { callback: IntersectionObserverCallback; targets: Set<Element> }[];
let top: number;
let reducedMotion: boolean;
let mediaListeners: Set<() => void>;

const setReducedMotion = (matches: boolean) => {
	reducedMotion = matches;
	mediaListeners.forEach((listener) => listener());
};

const intersect = (target: Element) => {
	for (const observer of observers) {
		if (observer.targets.has(target)) {
			observer.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], observer as never);
		}
	}
};

beforeEach(() => {
	vi.useFakeTimers();
	setMotionPaused(false);
	observers = [];
	top = 2000;
	reducedMotion = false;
	mediaListeners = new Set();
	vi.stubGlobal("matchMedia", vi.fn(() => ({
		get matches() { return reducedMotion; },
		addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
		removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
	})));
	vi.stubGlobal("IntersectionObserver", class {
		targets = new Set<Element>();
		constructor(public callback: IntersectionObserverCallback) {
			observers.push(this);
		}
		observe(target: Element) {
			this.targets.add(target);
		}
		unobserve(target: Element) {
			this.targets.delete(target);
		}
		disconnect() {
			this.targets.clear();
		}
	});
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ top }) as DOMRect);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	setMotionPaused(false);
});

function renderStage() {
	const { container } = render(
		<HowStage>
			<nav>
				<a href="#win" data-how-link="0" aria-current="true">Win</a>
				<a href="#run" data-how-link="1">Run</a>
			</nav>
			<ol>
				<li data-how-step="0">
					<div data-how-scene="5" style={{ "--a5": 1 } as CSSProperties} />
				</li>
				<li data-how-step="1" />
			</ol>
		</HowStage>
	);
	const get = (selector: string) => container.querySelector<HTMLElement>(selector)!;
	return { frame: get("[data-how-scene]"), chapter: get('[data-how-step="1"]'), get };
}

const progress = (frame: HTMLElement) => Number(frame.style.getPropertyValue("--a5"));

describe("HowStage", () => {
	it("finishes a linked scene that enters the viewport between StrictMode effect setups", () => {
		vi.mocked(HTMLElement.prototype.getBoundingClientRect)
			.mockReturnValueOnce({ top: 2000 } as DOMRect)
			.mockReturnValue({ top: 100 } as DOMRect);
		const { container } = render(
			<StrictMode>
				<HowStage><div data-how-scene="5" style={{ "--a5": 1 } as CSSProperties} /></HowStage>
			</StrictMode>,
		);
		expect(progress(container.querySelector<HTMLElement>("[data-how-scene]")!)).toBe(1);
	});
	it("plays a scene's entrance once, when it scrolls into view", () => {
		const { frame } = renderStage();
		expect(progress(frame)).toBe(0.3);
		act(() => intersect(frame));
		act(() => vi.advanceTimersByTime(3000));
		expect(progress(frame)).toBe(1);
		act(() => intersect(frame));
		expect(progress(frame)).toBe(1);
	});

	it("leaves scenes finished when they are already on screen or motion is paused", () => {
		top = 100;
		expect(progress(renderStage().frame)).toBe(1);
		cleanup();
		top = 2000;
		setMotionPaused(true);
		expect(progress(renderStage().frame)).toBe(1);
	});

	it("lands the entrance when paused mid-way", () => {
		const { frame } = renderStage();
		act(() => intersect(frame));
		act(() => vi.advanceTimersByTime(300));
		expect(progress(frame)).toBeLessThan(1);
		act(() => setMotionPaused(true));
		expect(progress(frame)).toBe(1);
		act(() => vi.advanceTimersByTime(2000));
		expect(progress(frame)).toBe(1);
	});

	it("lands an active entrance when reduced motion turns on", () => {
		const { frame } = renderStage();
		act(() => intersect(frame));
		act(() => vi.advanceTimersByTime(300));
		expect(progress(frame)).toBeGreaterThan(0);
		expect(progress(frame)).toBeLessThan(1);
		act(() => setReducedMotion(true));
		expect(progress(frame)).toBe(1);
		act(() => vi.advanceTimersByTime(2000));
		expect(progress(frame)).toBe(1);
	});

	it("lands an active entrance when the document becomes hidden", () => {
		const { frame } = renderStage();
		act(() => intersect(frame));
		act(() => vi.advanceTimersByTime(300));
		expect(progress(frame)).toBeLessThan(1);
		vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(progress(frame)).toBe(1);
	});

});
