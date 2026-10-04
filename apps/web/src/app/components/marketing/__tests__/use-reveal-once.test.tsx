// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMotionPaused } from "../motion-pause";
import { useRevealOnce } from "../use-reveal-once";

let reduce: boolean;
let top: number;
let intersect: (visible: boolean) => void;

beforeEach(() => {
	setMotionPaused(false);
	reduce = false;
	top = 2000;
	vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce })));
	vi.stubGlobal("IntersectionObserver", class {
		constructor(callback: IntersectionObserverCallback) {
			intersect = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
		}
		observe() {}
		disconnect() {}
	});
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ top }) as DOMRect);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function Target() {
	const ref = useRef<HTMLDivElement>(null);
	useRevealOnce(ref);
	return <div ref={ref} />;
}

const renderTarget = () => render(<Target />).container.firstElementChild as HTMLElement;

describe("useRevealOnce", () => {
	it("waits below the fold, then plays once", () => {
		const el = renderTarget();
		expect(el.dataset.reveal).toBe("pending");
		act(() => intersect(true));
		expect(el.dataset.reveal).toBe("done");
		act(() => intersect(false));
		expect(el.dataset.reveal).toBe("done");
	});

	it("never hides content that is already on screen, reduced or paused", () => {
		top = 100;
		expect(renderTarget().dataset.reveal).toBeUndefined();
		cleanup();
		top = 2000;
		reduce = true;
		expect(renderTarget().dataset.reveal).toBeUndefined();
		cleanup();
		reduce = false;
		setMotionPaused(true);
		expect(renderTarget().dataset.reveal).toBeUndefined();
	});
});
