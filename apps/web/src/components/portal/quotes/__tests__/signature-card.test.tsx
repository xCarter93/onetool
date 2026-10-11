// @vitest-environment jsdom
//
// Plan 14-03 Task 3: SignatureCard component tests.
//
// Covers:
//  1. Renders Type tab by default with Caveat live preview placeholder
//  2. Toggle to Draw mode emits non-usable drawn payload
//  3. Typed mode requires name.trim().length >= 2
//  4. Disabled prop propagates through SignatureCard to its pads

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(() => {
	cleanup();
});

import {
	SignatureCard,
	type SignaturePayload,
} from "../signature-card";

// Mock the typed renderer so tests never touch document.fonts.
vi.mock("@/lib/portal/quotes/render-typed-signature", () => ({
	renderTypedSignatureToPng: vi.fn(async (name: string) => ({
		dataUrl: "data:image/png;base64,STUBTYPED",
		raw: { typedName: name, font: "Caveat" as const },
	})),
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
