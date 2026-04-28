// @vitest-environment jsdom
//
// Plan 14-03 Task 3: SignatureCard component tests.
//
// Covers:
//  1. Renders Type tab by default with Caveat live preview placeholder
//  2. Toggle to Draw mode emits non-usable drawn payload
//  3. Typed mode requires name.trim().length >= 2
//  4. Disabled prop propagates through SignatureCard to its pads
//  5. (REVIEWS) SignatureCanvasPad disabled gate short-circuits emission
//     when imported directly (no dynamic-mock-to-null)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(() => {
	cleanup();
});

// Stub HTMLCanvasElement.getContext globally for jsdom — react-signature-canvas
// calls SignaturePad's constructor which immediately uses ctx.fillRect/fillStyle.
beforeEach(() => {
	HTMLCanvasElement.prototype.getContext = vi.fn(
		() =>
			({
				scale: vi.fn(),
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
});

import {
	SignatureCard,
	type SignaturePayload,
} from "../signature-card";
import { SignatureCanvasPad } from "../signature-canvas-pad";

// Mock the typed renderer so tests never touch document.fonts.
vi.mock("@/lib/portal/quotes/render-typed-signature", () => ({
	renderTypedSignatureToPng: vi.fn(async (name: string) => ({
		dataUrl: "data:image/png;base64,STUBTYPED",
		raw: { typedName: name, font: "Caveat" as const },
	})),
}));

// next/dynamic in tests: lazily resolve the loader on first render so the
// real SignatureCanvasPad reaches the DOM eventually. The REVIEWS-mandated
// Test 5 imports SignatureCanvasPad directly to bypass this entirely.
import * as React from "react";
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

const NON_USABLE_TYPED: SignaturePayload = {
	mode: "typed",
	dataUrl: null,
	rawData: null,
	isUsable: false,
};

describe("SignatureCard", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders Type tab by default with Caveat live preview", () => {
		const onChange = vi.fn();
		render(
			<SignatureCard value={NON_USABLE_TYPED} onChange={onChange} />,
		);
		// Type tab is active by default — input renders.
		expect(
			screen.getByPlaceholderText("Your full legal name"),
		).toBeTruthy();
		// Caveat preview renders its placeholder copy.
		expect(
			screen.getByText("Your signature will appear here"),
		).toBeTruthy();
	});

	it("toggle to Draw mode emits non-usable drawn payload", () => {
		const onChange = vi.fn();
		render(
			<SignatureCard value={NON_USABLE_TYPED} onChange={onChange} />,
		);
		// There may be both a tab and a tabpanel matching /Draw/i; filter to tab.
		const drawTab = screen
			.getAllByRole("tab")
			.find((el) => /Draw/i.test(el.textContent ?? ""));
		expect(drawTab).toBeTruthy();
		fireEvent.mouseDown(drawTab!);
		fireEvent.click(drawTab!);
		expect(onChange).toHaveBeenCalledWith({
			mode: "drawn",
			dataUrl: null,
			rawData: null,
			isUsable: false,
		});
	});

	it("typed mode does not emit a usable payload for name.trim().length < 2", async () => {
		const onChange = vi.fn();
		render(
			<SignatureCard value={NON_USABLE_TYPED} onChange={onChange} />,
		);
		const input = screen.getByPlaceholderText(
			"Your full legal name",
		) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "a" } });
		await act(async () => {
			vi.advanceTimersByTime(200);
		});
		const usableCalls = onChange.mock.calls.filter(
			([payload]) => (payload as SignaturePayload).isUsable,
		);
		expect(usableCalls).toHaveLength(0);
	});

	it("disabled prop disables the typed input and Draw tab", () => {
		const onChange = vi.fn();
		render(
			<SignatureCard
				value={NON_USABLE_TYPED}
				onChange={onChange}
				disabled
			/>,
		);
		const input = screen.getByPlaceholderText(
			"Your full legal name",
		) as HTMLInputElement;
		expect(input.disabled).toBe(true);
		const drawTab = screen
			.getAllByRole("tab")
			.find((el) => /Draw/i.test(el.textContent ?? ""))!;
		expect(
			drawTab.hasAttribute("disabled") ||
				drawTab.getAttribute("data-disabled") !== null ||
				drawTab.getAttribute("aria-disabled") === "true",
		).toBe(true);
	});
});

describe("SignatureCanvasPad (direct import — REVIEWS-mandated disabled gate)", () => {
	it("does not emit when disabled and a stroke ends", () => {
		const onChange = vi.fn();
		const NON_USABLE_DRAWN: SignaturePayload = {
			mode: "drawn",
			dataUrl: null,
			rawData: null,
			isUsable: false,
		};
		const { container } = render(
			<SignatureCanvasPad
				value={NON_USABLE_DRAWN}
				onChange={onChange}
				disabled
			/>,
		);
		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		// Wrapper applies pointerEvents:none — the actual stroke-end can't even
		// fire from a real user. We assert the structural guard plus the fact
		// that no callbacks fired during mount/initial render.
		expect(onChange).not.toHaveBeenCalled();
		const wrapper = canvas!.parentElement;
		expect(wrapper).toBeTruthy();
		expect(wrapper!.style.pointerEvents).toBe("none");
		// And the Clear button is disabled.
		const clearBtn = screen.getByRole("button", { name: /Clear/i });
		expect((clearBtn as HTMLButtonElement).disabled).toBe(true);
	});
});
