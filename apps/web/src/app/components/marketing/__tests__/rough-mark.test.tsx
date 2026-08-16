// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { RoughMark } from "../rough-mark";

/* jsdom has no layout engine and no SVG geometry, so the draw path needs the
 * handful of browser APIs RoughMark actually reads. The one that matters here
 * is ResizeObserver: real implementations invoke the callback once, straight
 * away, with the element's initial size. */

const RECT = { left: 0, top: 0, width: 200, height: 40 } as DOMRect;
let rect: DOMRect;

let animateSpy: ReturnType<typeof vi.fn>;
let resizeCallbacks: ResizeObserverCallback[];

beforeEach(() => {
	resizeCallbacks = [];

	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockReturnValue({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}),
	);

	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(private cb: IntersectionObserverCallback) {}
			observe(el: Element) {
				this.cb(
					[{ isIntersecting: true, target: el } as IntersectionObserverEntry],
					this as unknown as IntersectionObserver,
				);
			}
			disconnect() {}
			unobserve() {}
		},
	);

	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(private cb: ResizeObserverCallback) {
				resizeCallbacks.push(cb);
			}
			observe() {
				// Browsers deliver an initial observation as soon as observe() runs.
				this.cb([], this as unknown as ResizeObserver);
			}
			disconnect() {}
			unobserve() {}
		},
	);

	rect = RECT;
	Element.prototype.getBoundingClientRect = () => rect;
	Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
	// @ts-expect-error jsdom's SVGElement has no geometry interface
	SVGElement.prototype.getTotalLength = () => 210;

	animateSpy = vi.fn(() => ({ finished: Promise.resolve() }));
	// @ts-expect-error partial Animation stub
	Element.prototype.animate = animateSpy;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("RoughMark", () => {
	it("keeps the animated strokes mounted after the ResizeObserver's initial observation", () => {
		const { container } = render(
			<RoughMark type="underline">before lunch</RoughMark>,
		);

		// Flush the initial ResizeObserver delivery the same way a browser would.
		act(() => {
			for (const cb of resizeCallbacks)
				cb([], undefined as unknown as ResizeObserver);
		});

		const paths = [...container.querySelectorAll("path")];
		expect(paths.length).toBeGreaterThan(0);

		// Every stroke on screen must be one the draw-on animation is running.
		// A redraw triggered by the initial resize observation swaps them for
		// fresh, fully-drawn paths — the mark then pops in instead of drawing.
		const animated = new Set(animateSpy.mock.instances);
		for (const p of paths) expect(animated.has(p)).toBe(true);
	});

	it("draws each stroke from its start point (left to right)", () => {
		render(<RoughMark type="underline">before lunch</RoughMark>);

		expect(animateSpy).toHaveBeenCalled();
		const [keyframes] = animateSpy.mock.calls[0];
		const frames = keyframes as { strokeDashoffset: number }[];
		// full offset -> 0 reveals the path from its first command onward
		expect(frames[0].strokeDashoffset).toBeGreaterThan(0);
		expect(frames[frames.length - 1].strokeDashoffset).toBe(0);
	});

	it("still redraws when the text actually reflows", () => {
		const { container } = render(
			<RoughMark type="underline">before lunch</RoughMark>,
		);
		const before = [...container.querySelectorAll("path")].map((p) =>
			p.getAttribute("d"),
		);

		// The mark wrapped onto two lines: same host, taller box, new geometry.
		rect = { left: 0, top: 0, width: 120, height: 80 } as DOMRect;
		act(() => {
			for (const cb of resizeCallbacks)
				cb([], undefined as unknown as ResizeObserver);
		});

		const after = [...container.querySelectorAll("path")].map((p) =>
			p.getAttribute("d"),
		);
		expect(after).not.toEqual(before);
	});
});
