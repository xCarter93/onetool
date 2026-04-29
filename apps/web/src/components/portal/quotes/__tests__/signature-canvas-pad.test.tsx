// @vitest-environment jsdom
//
// Plan 14-06 Task 1: SignatureCanvasPad DPR-scale preservation regression tests.
//
// UAT Gap 1 root cause: the WR-05 reset useEffect fires on initial mount,
// calling pad.clear() which internally invokes ctx.setTransform(1,0,0,1,0,0),
// wiping the ctx.scale(dpr,dpr) that the mount effect just applied. Drawn
// strokes then paint at 1× transform on a 2× backing-store and are invisible
// after CSS downscale. These tests pin the contract that ctx.scale(dpr,dpr)
// MUST survive (or be re-applied after) any pad.clear() that runs during the
// component's lifecycle.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(() => {
	cleanup();
});

// Module-scoped spies so tests can assert call counts and ordering across
// the mount lifecycle. Re-bound in beforeEach so each test starts clean.
let ctxScale: ReturnType<typeof vi.fn>;
let ctxSetTransform: ReturnType<typeof vi.fn>;

beforeEach(() => {
	ctxScale = vi.fn();
	ctxSetTransform = vi.fn();
	HTMLCanvasElement.prototype.getContext = vi.fn(
		() =>
			({
				scale: ctxScale,
				setTransform: ctxSetTransform,
				fillRect: vi.fn(),
				clearRect: vi.fn(),
				fillText: vi.fn(),
				beginPath: vi.fn(),
				moveTo: vi.fn(),
				lineTo: vi.fn(),
				closePath: vi.fn(),
				stroke: vi.fn(),
				fill: vi.fn(),
				bezierCurveTo: vi.fn(),
				arc: vi.fn(),
				translate: vi.fn(),
				save: vi.fn(),
				restore: vi.fn(),
				drawImage: vi.fn(),
				set fillStyle(_v: unknown) {},
				set strokeStyle(_v: unknown) {},
				set lineWidth(_v: unknown) {},
				set lineJoin(_v: unknown) {},
				set lineCap(_v: unknown) {},
				set font(_v: unknown) {},
				set textBaseline(_v: unknown) {},
			}) as unknown as CanvasRenderingContext2D,
	) as unknown as typeof HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.toDataURL = vi.fn(
		() => "data:image/png;base64,STUBDRAWN",
	);
	Object.defineProperty(window, "devicePixelRatio", {
		value: 2,
		configurable: true,
		writable: true,
	});
});

import { SignatureCanvasPad } from "../signature-canvas-pad";
import type { SignaturePayload } from "../signature-card";

const NON_USABLE_DRAWN: SignaturePayload = {
	mode: "drawn",
	dataUrl: null,
	rawData: null,
	isUsable: false,
};

const USABLE_DRAWN: SignaturePayload = {
	mode: "drawn",
	dataUrl: "data:image/png;base64,STUBDRAWN",
	rawData: { strokes: [] },
	isUsable: true,
};

/**
 * Returns true if any setTransform(1,0,0,1,0,0) call appears AFTER the most
 * recent ctx.scale(dpr,dpr) call without a subsequent rescale. This is the
 * "broken transform" signature.
 */
function lastEventIsRescale(
	scaleCalls: unknown[][],
	setTransformCalls: unknown[][],
	scaleInvocationOrder: number[],
	setTransformInvocationOrder: number[],
): boolean {
	const lastScaleOrder =
		scaleInvocationOrder[scaleInvocationOrder.length - 1] ?? -1;
	const lastResetOrder = setTransformInvocationOrder
		.filter((_, idx) => {
			const args = setTransformCalls[idx] ?? [];
			return (
				args[0] === 1 &&
				args[1] === 0 &&
				args[2] === 0 &&
				args[3] === 1 &&
				args[4] === 0 &&
				args[5] === 0
			);
		})
		.pop() ?? -1;
	return lastScaleOrder > lastResetOrder;
}

describe("SignatureCanvasPad — DPR-scale preservation (UAT Gap 1)", () => {
	it("Test A: mount-time WR-05 effect must NOT clobber the dpr scale", () => {
		// Initial value satisfies the WR-05 reset predicate. On the bug, this
		// fires pad.clear() right after the mount-effect's ctx.scale(2,2),
		// leaving the canvas at 1× transform.
		const onChange = vi.fn();
		render(
			<SignatureCanvasPad
				value={NON_USABLE_DRAWN}
				onChange={onChange}
			/>,
		);

		// At minimum, ctx.scale(2,2) must have been called at least once.
		const scaleCalls = ctxScale.mock.calls;
		const dprScaleCalls = scaleCalls.filter(
			([sx, sy]) => sx === 2 && sy === 2,
		);
		expect(dprScaleCalls.length).toBeGreaterThanOrEqual(1);

		// Either the WR-05 effect short-circuits on initial mount (no
		// setTransform reset observed beyond mount), OR it ran clear+rescale
		// (a second ctx.scale(2,2) follows the reset). Both implementations
		// satisfy the contract: the LAST transform-affecting event must leave
		// the canvas at dpr scale.
		// Failing case (current bug): mount scale(2,2) -> setTransform(1,0,0,1,0,0)
		// from pad.clear() -> nothing. lastEventIsRescale returns false.
		const setTransformResets = ctxSetTransform.mock.calls.filter(
			(args) =>
				args[0] === 1 &&
				args[1] === 0 &&
				args[2] === 0 &&
				args[3] === 1 &&
				args[4] === 0 &&
				args[5] === 0,
		);
		// If a reset happened, a rescale to (2,2) must follow it (count of
		// dpr-scale calls > count of resets).
		expect(dprScaleCalls.length).toBeGreaterThan(setTransformResets.length - 1);
		// Specifically: dpr scale count must be >= reset count + 1 OR there
		// were no resets at all.
		if (setTransformResets.length > 0) {
			expect(dprScaleCalls.length).toBeGreaterThanOrEqual(
				setTransformResets.length + 1,
			);
		}
	});

	it("Test B: clicking Clear re-applies ctx.scale(dpr, dpr) after pad.clear()", () => {
		const onChange = vi.fn();
		render(
			<SignatureCanvasPad
				value={NON_USABLE_DRAWN}
				onChange={onChange}
			/>,
		);

		const dprScaleCallsBefore = ctxScale.mock.calls.filter(
			([sx, sy]) => sx === 2 && sy === 2,
		).length;

		const clearBtn = screen.getByRole("button", { name: /Clear/i });
		fireEvent.click(clearBtn);

		const dprScaleCallsAfter = ctxScale.mock.calls.filter(
			([sx, sy]) => sx === 2 && sy === 2,
		).length;

		// Strictly increased: handleClear must rescale.
		expect(dprScaleCallsAfter).toBeGreaterThan(dprScaleCallsBefore);
	});

	it("Test C: legitimate parent reset (after usable -> non-usable transition) clears AND rescales", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<SignatureCanvasPad value={USABLE_DRAWN} onChange={onChange} />,
		);

		const dprScaleCallsBefore = ctxScale.mock.calls.filter(
			([sx, sy]) => sx === 2 && sy === 2,
		).length;

		// Parent transitions to non-usable — WR-05 reset path fires for real.
		rerender(
			<SignatureCanvasPad
				value={NON_USABLE_DRAWN}
				onChange={onChange}
			/>,
		);

		const dprScaleCallsAfter = ctxScale.mock.calls.filter(
			([sx, sy]) => sx === 2 && sy === 2,
		).length;

		// After a real reset, rescale must follow.
		expect(dprScaleCallsAfter).toBeGreaterThan(dprScaleCallsBefore);
	});
});
