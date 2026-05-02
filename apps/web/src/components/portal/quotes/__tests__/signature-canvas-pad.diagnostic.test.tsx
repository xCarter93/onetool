// @vitest-environment jsdom
//
// Plan 14-12 Task 1: Forensic-capture harness for UAT Gap A re-UAT.
//
// Drawn signatures are still invisible after 14-06's fix landed. This file
// mounts <SignatureCard> in jsdom, drives the full Type->Draw tab-switch +
// pointer-stroke flow, and records lifecycle state (getBoundingClientRect,
// ctx.getTransform, recorded scale/setTransform calls) at each moment.
//
// IMPORTANT: this test does NOT classify between root-cause candidates
// (a)/(b)/(c)/(d)/(e). An earlier draft of plan 14-12 tried — but jsdom's
// getBoundingClientRect() returns {0,0} for unstyled elements, so the
// rect-zero branch (candidate (c)) deterministically dominates. A ceremony
// that always reports (c) under jsdom is false assurance, not diagnosis.
//
// Plan 14-12 commits to candidate (c) up front based on code inspection
// (see <objective> in 14-12-PLAN.md). This test ships as a permanent
// forensic artefact: future regressions can be re-diagnosed by extending
// this harness with real-device probes or richer ResizeObserver mocks.
//
// The test PASSES — its job is to capture state, not gate execution.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import * as React from "react";
import { SignatureCard } from "../signature-card";
import type { SignaturePayload } from "../signature-card";

// ---- Mock next/dynamic so the lazy SignatureCanvasPad reaches the DOM. ----
// Verbatim copy of the pattern from signature-card.test.tsx lines 73-102.
// Without this mock, `screen.findByRole("img", { name: /Draw your signature/i })`
// times out at the next/dynamic loader boundary and the test produces a
// wrong-reason failure.
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
		// signature_pad reads many additional methods — provide no-op stubs
		// that match the existing signature-card.test.tsx pattern.
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
		// No prior descriptor — delete the override.
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

// Controlled wrapper so we can drive value/onChange and re-render at will.
function Harness() {
	const [value, setValue] = useState<SignaturePayload>({
		mode: "typed",
		dataUrl: null,
		rawData: null,
		isUsable: false,
	});
	return <SignatureCard value={value} onChange={setValue} />;
}

describe("Plan 14-12 / Gap A forensic capture", () => {
	beforeEach(() => {
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: 2,
		});
	});
	afterEach(() => {
		cleanup();
		restoreCanvasStub();
		vi.restoreAllMocks();
	});

	it("captures lifecycle state for the Type->Draw tab-switch + stroke flow", async () => {
		const { getRecorded } = installCanvasStub();
		render(<Harness />);

		// Default tab is Type — pad is NOT mounted yet.
		expect(
			screen.queryByRole("img", { name: /Draw your signature/i }),
		).toBeNull();

		// Click Draw tab. Radix Tabs in jsdom requires BOTH mouseDown + click
		// to fire onValueChange (per project convention — see decision logged
		// in 14-03 SUMMARY: pointer events alone don't trigger Radix's
		// onValueChange under jsdom).
		const drawTab = screen.getByRole("tab", { name: /Draw/i });
		fireEvent.mouseDown(drawTab);
		fireEvent.click(drawTab);

		const canvas = (await screen.findByRole("img", {
			name: /Draw your signature/i,
		})) as HTMLCanvasElement;

		// === Lifecycle moment 1: post-mount ===
		const mountState = {
			rect: canvas.getBoundingClientRect(),
			canvasW: canvas.width,
			canvasH: canvas.height,
			styleW: canvas.style.width,
			styleH: canvas.style.height,
			recorded: {
				setTransformCalls: [...getRecorded().setTransformCalls],
				scaleCalls: [...getRecorded().scaleCalls],
				a: getRecorded().a,
				d: getRecorded().d,
			},
			transformA: getRecorded().a,
			transformD: getRecorded().d,
		};

		// === Drive a stroke ===
		fireEvent.pointerDown(canvas, {
			clientX: 50,
			clientY: 30,
			pointerType: "mouse",
			pointerId: 1,
		});
		fireEvent.pointerMove(canvas, {
			clientX: 100,
			clientY: 60,
			pointerType: "mouse",
			pointerId: 1,
		});
		fireEvent.pointerMove(canvas, {
			clientX: 150,
			clientY: 90,
			pointerType: "mouse",
			pointerId: 1,
		});
		fireEvent.pointerUp(canvas, {
			clientX: 150,
			clientY: 90,
			pointerType: "mouse",
			pointerId: 1,
		});

		// === Lifecycle moment 2: post-stroke ===
		const postStrokeState = {
			rect: canvas.getBoundingClientRect(),
			recorded: {
				setTransformCalls: [...getRecorded().setTransformCalls],
				scaleCalls: [...getRecorded().scaleCalls],
				a: getRecorded().a,
				d: getRecorded().d,
			},
			transformA: getRecorded().a,
			transformD: getRecorded().d,
		};

		// Emit forensic state — executor copies these lines into the SUMMARY
		// verbatim. The plan does NOT classify a verdict (see header comment).
		// eslint-disable-next-line no-console
		console.log(
			`[FORENSIC-DETAIL] mountState=${JSON.stringify({
				rectW: mountState.rect.width,
				rectH: mountState.rect.height,
				canvasW: mountState.canvasW,
				canvasH: mountState.canvasH,
				styleW: mountState.styleW,
				styleH: mountState.styleH,
				scaleCalls: mountState.recorded.scaleCalls,
				setTransformCalls: mountState.recorded.setTransformCalls.length,
				transformA: mountState.transformA,
				transformD: mountState.transformD,
			})}`,
		);
		// eslint-disable-next-line no-console
		console.log(
			`[FORENSIC-DETAIL] postStrokeState=${JSON.stringify({
				rectW: postStrokeState.rect.width,
				rectH: postStrokeState.rect.height,
				scaleCalls: postStrokeState.recorded.scaleCalls,
				setTransformCalls: postStrokeState.recorded.setTransformCalls.length,
				transformA: postStrokeState.transformA,
				transformD: postStrokeState.transformD,
			})}`,
		);

		// The test always passes — it captures state, not gates execution.
		// Sanity: scale was called at least once (14-06's contract) and the
		// canvas mounted with explicit width/height attrs.
		expect(mountState.recorded.scaleCalls.length).toBeGreaterThanOrEqual(1);
		expect(canvas.width).toBe(600 * 2);
		expect(canvas.height).toBe(160 * 2);
	});
});
