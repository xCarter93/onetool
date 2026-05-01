// @vitest-environment jsdom
//
// Plan 14-12: SignatureCanvasPad tab-switch + ResizeObserver re-scale regression.
//
// Plan 14-06's existing test (signature-canvas-pad.test.tsx) pins the abstract
// invariant "ctx.scale survives every pad.clear()". That test passes both before
// and after a fix to the user-visible bug, which is why the bug shipped. This
// file pins the candidate-(c) contract: when the canvas mounts inside a Radix
// TabsContent that has not yet been laid out (getBoundingClientRect width=0,
// height=0), the production component must observe its own canvas via
// ResizeObserver and re-apply ctx.scale(dpr,dpr) on the first zero->non-zero
// rect transition.
//
// Pinning UAT Gap A re-UAT leading hypothesis: candidate (c) — committed up
// front per plan 14-12 <objective>. The verdict ceremony was abandoned (see
// signature-canvas-pad.diagnostic.test.tsx header) because under jsdom the
// rect-zero branch is mechanically forced.
//
// Ruled out by code inspection (NOT by jsdom verdict ceremony):
// - (a) signature_pad recreates internals on mount — 14-06 tests pin that
//   ctx.scale runs after pad.clear, so scale IS called.
// - (b) DPR mismatch — getDpr() reads window.devicePixelRatio at mount; no
//   race window between read and ctx.scale call.
// - (c) rect=0 at mount inside Radix TabsContent — PICKED. Tested below.
// - (d) WR-05 double-fire — 14-06 tests pin hasMountedRef's single-fire
//   behavior; regression would surface there first.
// - (e) signature_pad pointer-coord math is wrong vs dpr-scaled backing
//   store — residual hypothesis. If real-device UAT after this plan lands
//   does not close UAT Gap A, a follow-up plan opens to investigate (e).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import * as React from "react";
import { SignatureCard } from "../signature-card";
import type { SignaturePayload } from "../signature-card";

// ---- Mock next/dynamic so the lazy SignatureCanvasPad reaches the DOM. ----
// Verbatim copy of the pattern from signature-card.test.tsx lines 73-102.
// Without this mock, `screen.findByRole("img", { name: /Draw your signature/i })`
// times out at the next/dynamic loader boundary (B-N3).
vi.mock("next/dynamic", () => ({
	default: (
		loader: () => Promise<{ default?: unknown } | unknown>,
	) => {
		const Lazy = (props: Record<string, unknown>) => {
			const [Comp, setComp] =
				React.useState<React.ComponentType<unknown> | null>(null);
			React.useEffect(() => {
				let cancelled = false;
				Promise.resolve(loader()).then((mod: unknown) => {
					if (cancelled) return;
					const m = mod as
						| { default?: React.ComponentType<unknown> }
						| React.ComponentType<unknown>;
					const C =
						(m as { default?: React.ComponentType<unknown> }).default ??
						(m as React.ComponentType<unknown>);
					setComp(() => C);
				});
				return () => {
					cancelled = true;
				};
			}, []);
			if (!Comp) return null;
			return React.createElement(Comp, props);
		};
		return Lazy;
	},
}));

type Recorded = {
	setTransformCalls: Array<number[]>;
	scaleCalls: Array<number[]>;
	a: number;
	d: number;
};

let originalGetContext: PropertyDescriptor | undefined;
let originalToDataURL: PropertyDescriptor | undefined;

function installCanvasStub(): { getRecorded: () => Recorded } {
	const recorded: Recorded = {
		setTransformCalls: [],
		scaleCalls: [],
		a: 1,
		d: 1,
	};
	const ctx = {
		setTransform: (...args: number[]) => {
			recorded.setTransformCalls.push(args);
			recorded.a = args[0];
			recorded.d = args[3];
		},
		scale: (sx: number, sy: number) => {
			recorded.scaleCalls.push([sx, sy]);
			recorded.a *= sx;
			recorded.d *= sy;
		},
		getTransform: () => ({
			a: recorded.a,
			b: 0,
			c: 0,
			d: recorded.d,
			e: 0,
			f: 0,
		}),
		fillRect: () => {},
		clearRect: () => {},
		beginPath: () => {},
		moveTo: () => {},
		lineTo: () => {},
		stroke: () => {},
		fill: () => {},
		bezierCurveTo: () => {},
		quadraticCurveTo: () => {},
		arc: () => {},
		save: () => {},
		restore: () => {},
		translate: () => {},
		rotate: () => {},
		closePath: () => {},
		drawImage: () => {},
		fillText: () => {},
		set fillStyle(_: string) {},
		set strokeStyle(_: string) {},
		set lineWidth(_: number) {},
		set lineCap(_: string) {},
		set lineJoin(_: string) {},
		set font(_: string) {},
		set textBaseline(_: string) {},
	} as unknown as CanvasRenderingContext2D;

	originalGetContext = Object.getOwnPropertyDescriptor(
		HTMLCanvasElement.prototype,
		"getContext",
	);
	originalToDataURL = Object.getOwnPropertyDescriptor(
		HTMLCanvasElement.prototype,
		"toDataURL",
	);
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: vi.fn(() => ctx),
	});
	Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
		configurable: true,
		value: () => "data:image/png;base64,STUB",
	});
	return { getRecorded: () => recorded };
}

function restoreCanvasStub() {
	if (originalGetContext) {
		Object.defineProperty(
			HTMLCanvasElement.prototype,
			"getContext",
			originalGetContext,
		);
		originalGetContext = undefined;
	} else {
		delete (HTMLCanvasElement.prototype as { getContext?: unknown }).getContext;
	}
	if (originalToDataURL) {
		Object.defineProperty(
			HTMLCanvasElement.prototype,
			"toDataURL",
			originalToDataURL,
		);
		originalToDataURL = undefined;
	} else {
		delete (HTMLCanvasElement.prototype as { toDataURL?: unknown }).toDataURL;
	}
}

// ---- ResizeObserver stub: capture callbacks for Case 3 manual fire. ----
let resizeObserverCallbacks: Array<ResizeObserverCallback> = [];
let originalResizeObserver: typeof ResizeObserver | undefined;

class StubResizeObserver implements ResizeObserver {
	private cb: ResizeObserverCallback;
	constructor(cb: ResizeObserverCallback) {
		this.cb = cb;
		resizeObserverCallbacks.push(cb);
	}
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {
		resizeObserverCallbacks = resizeObserverCallbacks.filter(
			(c) => c !== this.cb,
		);
	}
}

function installResizeObserverStub() {
	originalResizeObserver = (
		globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }
	).ResizeObserver;
	(
		globalThis as unknown as { ResizeObserver: typeof ResizeObserver }
	).ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
}

function restoreResizeObserver() {
	if (originalResizeObserver) {
		(
			globalThis as unknown as { ResizeObserver: typeof ResizeObserver }
		).ResizeObserver = originalResizeObserver;
		originalResizeObserver = undefined;
	} else {
		delete (
			globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }
		).ResizeObserver;
	}
	resizeObserverCallbacks = [];
}

function Harness() {
	const [value, setValue] = useState<SignaturePayload>({
		mode: "typed",
		dataUrl: null,
		rawData: null,
		isUsable: false,
	});
	return <SignatureCard value={value} onChange={setValue} />;
}

describe("Plan 14-12 / Gap A — tab-switch ResizeObserver re-scale", () => {
	beforeEach(() => {
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: 2,
		});
		installResizeObserverStub();
	});

	afterEach(() => {
		cleanup();
		restoreCanvasStub();
		restoreResizeObserver();
		vi.restoreAllMocks();
	});

	// Radix Tabs in jsdom needs both mouseDown + click to fire onValueChange
	// (per project convention — see decision logged in 14-03 SUMMARY).
	function clickDrawTab() {
		const drawTab = screen.getByRole("tab", { name: /Draw/i });
		fireEvent.mouseDown(drawTab);
		fireEvent.click(drawTab);
	}

	it("Case 1 (tab-switch mount path): ctx.scale(dpr,dpr) is applied on Type->Draw mount", async () => {
		const { getRecorded } = installCanvasStub();
		render(<Harness />);

		// Default tab is Type — pad not mounted yet.
		expect(
			screen.queryByRole("img", { name: /Draw your signature/i }),
		).toBeNull();

		clickDrawTab();
		await screen.findByRole("img", { name: /Draw your signature/i });

		const dprScaleCalls = getRecorded().scaleCalls.filter(
			([sx, sy]) => sx === 2 && sy === 2,
		);
		expect(dprScaleCalls.length).toBeGreaterThanOrEqual(1);
	});

	it("Case 2 (rect/style consistency at mount): backing-store == css * dpr", async () => {
		installCanvasStub();
		render(<Harness />);
		clickDrawTab();
		const canvas = (await screen.findByRole("img", {
			name: /Draw your signature/i,
		})) as HTMLCanvasElement;

		expect(canvas.style.width).toBe("600px");
		expect(canvas.style.height).toBe("160px");
		expect(canvas.width).toBe(600 * 2);
		expect(canvas.height).toBe(160 * 2);
	});

	it("Case 3 (RED): re-applies ctx.scale on first zero->non-zero rect transition", async () => {
		const { getRecorded } = installCanvasStub();
		// Force getBoundingClientRect to return 0x0 for the canvas at mount.
		const origGBCR = HTMLCanvasElement.prototype.getBoundingClientRect;
		HTMLCanvasElement.prototype.getBoundingClientRect = function () {
			return {
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				top: 0,
				right: 0,
				bottom: 0,
				left: 0,
				toJSON: () => ({}),
			} as DOMRect;
		};
		try {
			render(<Harness />);
			clickDrawTab();
			await screen.findByRole("img", { name: /Draw your signature/i });

			const beforeCount = getRecorded().scaleCalls.length;
			expect(beforeCount).toBeGreaterThanOrEqual(1); // baseline: mount applied scale once

			// Simulate layout settling: rect is now non-zero, ResizeObserver fires.
			expect(resizeObserverCallbacks.length).toBeGreaterThanOrEqual(1);
			const cb = resizeObserverCallbacks[0];
			// Restore real GBCR so the production code's check sees non-zero.
			HTMLCanvasElement.prototype.getBoundingClientRect = origGBCR;
			cb(
				[
					{
						contentRect: {
							width: 600,
							height: 160,
							top: 0,
							left: 0,
							bottom: 160,
							right: 600,
							x: 0,
							y: 0,
							toJSON: () => ({}),
						} as DOMRectReadOnly,
						target: {} as Element,
						borderBoxSize: [],
						contentBoxSize: [],
						devicePixelContentBoxSize: [],
					} as ResizeObserverEntry,
				],
				{} as ResizeObserver,
			);

			const afterCount = getRecorded().scaleCalls.length;
			// RED on current code: no ResizeObserver wired in production.
			expect(afterCount).toBeGreaterThan(beforeCount);
		} finally {
			HTMLCanvasElement.prototype.getBoundingClientRect = origGBCR;
		}
	});
});
