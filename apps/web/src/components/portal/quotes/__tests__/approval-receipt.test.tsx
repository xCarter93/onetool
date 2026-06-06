// @vitest-environment jsdom
//
// Plan 14-14 — CodeRabbit Finding 4: replace no-op `reduceMotion ? "" : ""`
// ternary with a meaningful conditional that gates `transition-transform`
// based on the prefers-reduced-motion media query. Both variants must still
// receive `rotate-180` when the receipt is expanded so the visual end-state
// is preserved across motion preferences.

import { describe, expect, it, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ApprovalReceipt } from "../approval-receipt";

const baseReceipt = {
	auditId: "a1",
	action: "approved" as const,
	createdAt: 1700000000000,
	documentVersion: 1,
	lineItemsCount: 2,
	total: 100,
	signatureUrl: null,
};

function mockMatchMedia(matches: boolean) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string) => ({
			matches,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}),
	});
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
	cleanup();
	// Restore matchMedia between tests so parallel suites that rely on the
	// real (or jsdom default) implementation don't see our mock leak.
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: originalMatchMedia,
	});
});

describe("ApprovalReceipt prefers-reduced-motion (Finding 4)", () => {
	it("omits transition-transform when prefers-reduced-motion: reduce, but still rotates on expand", async () => {
		mockMatchMedia(true);
		await act(async () => {
			render(
				<ApprovalReceipt
					receipt={baseReceipt}
					clientName="Jane"
					clientEmail="jane@example.com"
				/>,
			);
		});
		const button = await screen.findByRole("button", {
			name: /view approval receipt/i,
		});
		const icon = button.querySelector("svg");
		expect(icon).not.toBeNull();
		// Reduce-motion users: NO transition class.
		expect(icon!.getAttribute("class") ?? "").not.toMatch(/transition-transform/);
		// But the visual end-state (rotation) MUST still apply on expand.
		fireEvent.click(button);
		const rotatedIcon = button.querySelector("svg");
		expect(rotatedIcon!.getAttribute("class") ?? "").toMatch(/rotate-180/);
	});

	it("includes transition-transform when prefers-reduced-motion: no-preference, and rotates on expand", async () => {
		mockMatchMedia(false);
		await act(async () => {
			render(
				<ApprovalReceipt
					receipt={baseReceipt}
					clientName="Jane"
					clientEmail="jane@example.com"
				/>,
			);
		});
		const button = await screen.findByRole("button", {
			name: /view approval receipt/i,
		});
		const icon = button.querySelector("svg");
		// No-preference: transition class IS present.
		expect(icon!.getAttribute("class") ?? "").toMatch(/transition-transform/);
		fireEvent.click(button);
		const rotatedIcon = button.querySelector("svg");
		expect(rotatedIcon!.getAttribute("class") ?? "").toMatch(/rotate-180/);
	});
});
