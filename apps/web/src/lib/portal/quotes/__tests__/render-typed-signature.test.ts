// @vitest-environment jsdom
//
// Plan 14-03 Task 1: render-typed-signature lib tests.
// Asserts (1) await order load → ready → fillText, (2) DPR-scaled backing
// store, (3) PNG dataUrl prefix, (4) raw object shape.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { renderTypedSignatureToPng } from "../render-typed-signature";

describe("renderTypedSignatureToPng", () => {
	let callOrder: string[];
	let originalDpr: number;

	beforeEach(() => {
		callOrder = [];
		originalDpr = window.devicePixelRatio;
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: 3,
		});

		// document.fonts may be undefined in jsdom — install a stub.
		(document as unknown as { fonts: FontFaceSet }).fonts = {
			load: vi.fn(async (_descriptor: string) => {
				callOrder.push("load");
				return [] as FontFace[];
			}),
			get ready() {
				return (async () => {
					callOrder.push("ready");
					return this as unknown as FontFaceSet;
				})();
			},
			check: () => true,
			values: () => [][Symbol.iterator]() as IterableIterator<FontFace>,
			forEach: () => undefined,
		} as unknown as FontFaceSet;

		// Mock canvas context + toDataURL.
		const realGetContext = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...rest: unknown[]
		) {
			if (type === "2d") {
				return {
					scale: vi.fn(),
					fillText: vi.fn(() => {
						callOrder.push("fillText");
					}),
					set fillStyle(_v: string) {},
					set font(_v: string) {},
					set textBaseline(_v: string) {},
				} as unknown as CanvasRenderingContext2D;
			}
			return realGetContext.call(
				this,
				type as "2d",
				...(rest as []),
			) as unknown as RenderingContext;
		} as typeof HTMLCanvasElement.prototype.getContext;

		HTMLCanvasElement.prototype.toDataURL = vi.fn(
			() => "data:image/png;base64,STUBBYTES",
		);
	});

	afterEach(() => {
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: originalDpr,
		});
	});

	it("awaits document.fonts.load + document.fonts.ready before fillText", async () => {
		await renderTypedSignatureToPng("Patrick Carter");
		const loadIdx = callOrder.indexOf("load");
		const readyIdx = callOrder.indexOf("ready");
		const fillIdx = callOrder.indexOf("fillText");
		expect(loadIdx).toBeGreaterThanOrEqual(0);
		expect(readyIdx).toBeGreaterThan(loadIdx);
		expect(fillIdx).toBeGreaterThan(readyIdx);
	});

	it("scales canvas backing-store by devicePixelRatio", async () => {
		const createSpy = vi.spyOn(document, "createElement");
		await renderTypedSignatureToPng("Patrick Carter");
		const canvasCalls = createSpy.mock.results.filter(
			(r) => (r.value as HTMLElement).tagName === "CANVAS",
		);
		expect(canvasCalls.length).toBeGreaterThan(0);
		const canvas = canvasCalls[0]!.value as HTMLCanvasElement;
		// Default width=600, height=160; dpr=3.
		expect(canvas.width).toBe(600 * 3);
		expect(canvas.height).toBe(160 * 3);
	});

	it("returns dataUrl matching /^data:image\\/png;base64,/", async () => {
		const result = await renderTypedSignatureToPng("Patrick Carter");
		expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
	});

	it("returns raw object with typedName and font='Caveat'", async () => {
		const result = await renderTypedSignatureToPng("Patrick Carter");
		expect(result.raw).toEqual({
			typedName: "Patrick Carter",
			font: "Caveat",
		});
	});

	it("throws if name.trim().length < 2", async () => {
		await expect(renderTypedSignatureToPng("a")).rejects.toThrow();
		await expect(renderTypedSignatureToPng("   ")).rejects.toThrow();
	});
});
