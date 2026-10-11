// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { SignaturePayload } from "../signature-card";
import { SignatureDrawnPad } from "../signature-drawn-pad";

const NON_USABLE_DRAWN: SignaturePayload = {
	mode: "drawn",
	dataUrl: null,
	rawData: null,
	isUsable: false,
};

let fillStyles: unknown[];
let exportedSizes: [number, number][];

beforeEach(() => {
	fillStyles = [];
	exportedSizes = [];
	// jsdom has no canvas or Path2D; the PNG export needs both.
	vi.stubGlobal(
		"Path2D",
		class {
			constructor(public d?: string) {}
		},
	);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
		(() => ({
			scale: vi.fn(),
			translate: vi.fn(),
			fillRect: vi.fn(),
			fill: vi.fn(),
			set fillStyle(v: unknown) {
				fillStyles.push(v);
			},
		})) as unknown as HTMLCanvasElement["getContext"],
	);
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
		function (this: HTMLCanvasElement) {
			exportedSizes.push([this.width, this.height]);
			return "data:image/png;base64,STUBDRAWN";
		},
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.documentElement.classList.remove("dark");
});

function getArea() {
	return screen.getByRole("application", { name: "Draw your signature" });
}

function drawStroke(pointCount: number, pointerId = 1, stepX = 12) {
	const area = getArea();
	const base = { isPrimary: true, pointerType: "mouse", button: 0, pointerId };
	act(() => {
		fireEvent.pointerDown(area, { ...base, clientX: 10, clientY: 40 });
		for (let i = 1; i < pointCount; i++) {
			fireEvent.pointerMove(area, {
				...base,
				clientX: 10 + i * stepX,
				clientY: 40 + (i % 2) * 8,
			});
		}
		fireEvent.pointerUp(area, base);
	});
}

function lastPayload(onChange: ReturnType<typeof vi.fn>): SignaturePayload {
	return onChange.mock.calls.at(-1)?.[0] as SignaturePayload;
}

describe("SignatureDrawnPad", () => {
	it("emits a usable payload with tagged strokes once a stroke has enough points", () => {
		const onChange = vi.fn();
		render(<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />);

		drawStroke(8);

		const payload = lastPayload(onChange);
		expect(payload.isUsable).toBe(true);
		expect(payload.mode).toBe("drawn");
		expect(payload.dataUrl).toBe("data:image/png;base64,STUBDRAWN");
		expect(payload.rawData).toMatchObject({ format: "reui-signature-pad" });
		const { strokes } = payload.rawData as {
			strokes: { points: unknown[] }[];
		};
		expect(strokes).toHaveLength(1);
		expect(strokes[0].points.length).toBeGreaterThanOrEqual(5);
	});

	it("exports black ink when the signer is in dark mode", () => {
		document.documentElement.classList.add("dark");
		const onChange = vi.fn();
		render(<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />);

		drawStroke(8);

		expect(lastPayload(onChange).isUsable).toBe(true);
		expect(fillStyles).toContain("#000000");
		expect(fillStyles).not.toContain("#f8fafc");
	});

	it("crops the export to the pad when a stroke runs past its edge", () => {
		const onChange = vi.fn();
		render(<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />);
		Object.defineProperty(getArea(), "clientWidth", { value: 120 });
		Object.defineProperty(getArea(), "clientHeight", { value: 160 });

		// Ends at x=220; pointer capture records it, the pad clips it.
		drawStroke(8, 1, 30);

		expect(lastPayload(onChange).isUsable).toBe(true);
		// 2x export scale: 120 CSS px of visible pad.
		expect(exportedSizes.at(-1)?.[0]).toBe(240);
	});

	it("treats a stray tap as no signature", () => {
		const onChange = vi.fn();
		render(<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />);

		drawStroke(1);

		expect(lastPayload(onChange)).toEqual(NON_USABLE_DRAWN);
	});

	it("Clear empties the pad and emits a non-usable payload", () => {
		const onChange = vi.fn();
		render(<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />);
		drawStroke(8);

		fireEvent.click(screen.getByRole("button", { name: "Clear signature" }));

		expect(lastPayload(onChange)).toEqual(NON_USABLE_DRAWN);
		expect(getArea().hasAttribute("data-empty")).toBe(true);
	});

	it("Undo removes only the last stroke", () => {
		const onChange = vi.fn();
		render(<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />);
		drawStroke(8, 1);
		drawStroke(8, 2);

		fireEvent.click(screen.getByRole("button", { name: "Undo" }));

		const payload = lastPayload(onChange);
		expect(payload.isUsable).toBe(true);
		expect(
			(payload.rawData as { strokes: unknown[] }).strokes,
		).toHaveLength(1);
	});

	it("clears the ink when the parent resets to a fresh non-usable value", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />,
		);
		drawStroke(8);
		const signed = lastPayload(onChange);
		rerender(<SignatureDrawnPad value={signed} onChange={onChange} />);
		expect(getArea().hasAttribute("data-empty")).toBe(false);

		rerender(
			<SignatureDrawnPad value={{ ...NON_USABLE_DRAWN }} onChange={onChange} />,
		);

		expect(getArea().hasAttribute("data-empty")).toBe(true);
	});

	it("keeps sub-threshold ink when the parent echoes our own non-usable payload", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} />,
		);
		drawStroke(2);

		rerender(
			<SignatureDrawnPad value={lastPayload(onChange)} onChange={onChange} />,
		);

		expect(getArea().hasAttribute("data-empty")).toBe(false);
	});

	it("ignores input and disables its controls when disabled", () => {
		const onChange = vi.fn();
		render(
			<SignatureDrawnPad value={NON_USABLE_DRAWN} onChange={onChange} disabled />,
		);

		drawStroke(8);

		expect(onChange).not.toHaveBeenCalled();
		expect(getArea().hasAttribute("data-disabled")).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Clear signature" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled,
		).toBe(true);
	});
});
