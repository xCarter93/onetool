// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
	cleanup();
});

// Reduced-motion gate is a module-level mutable flag the framer-motion mock
// reads at call time so individual tests can flip it without re-rendering.
const reduceMotionFlag = { value: false };
vi.mock("framer-motion", () => ({
	useReducedMotion: () => reduceMotionFlag.value,
}));

import { PaymentReceipt, type ReceiptPayment } from "../payment-receipt";

function payment(overrides: Partial<ReceiptPayment> = {}): ReceiptPayment {
	return {
		_id: overrides._id ?? "p_1",
		description: overrides.description ?? "Deposit",
		paymentAmount: overrides.paymentAmount ?? 250,
		paidAt: overrides.paidAt ?? new Date("2026-04-12T15:30:00Z").getTime(),
		cardBrand: overrides.cardBrand ?? "visa",
		cardLast4: overrides.cardLast4 ?? "4242",
		receiptUrl:
			overrides.receiptUrl === undefined
				? "https://receipts.stripe.test/abc"
				: overrides.receiptUrl,
	};
}

describe("PaymentReceipt", () => {
	it("collapsed by default; expanding sets aria-expanded=true and reveals card brand + last4", () => {
		const { getByRole, container } = render(
			<PaymentReceipt payment={payment()} />,
		);
		const toggle = getByRole("button", { name: /view receipt/i });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		// Card details not yet visible.
		expect(container.textContent).not.toMatch(/4242/);
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(container.textContent).toMatch(/VISA/);
		expect(container.textContent).toContain("4242");
	});

	it("expanded panel renders 'View full receipt' link to receiptUrl when present", () => {
		const { getByRole } = render(
			<PaymentReceipt payment={payment()} />,
		);
		fireEvent.click(getByRole("button", { name: /view receipt/i }));
		const link = getByRole("link", {
			name: /view full receipt/i,
		}) as HTMLAnchorElement;
		expect(link.href).toBe("https://receipts.stripe.test/abc");
	});

	it("expanded panel shows graceful copy when receiptUrl is absent", () => {
		const { getByRole, container } = render(
			<PaymentReceipt payment={payment({ receiptUrl: null })} />,
		);
		fireEvent.click(getByRole("button", { name: /view receipt/i }));
		expect(container.textContent).toMatch(/receipt details not yet available/i);
	});

	it("'View full receipt' link opens in a new tab with rel=noopener noreferrer", () => {
		const { getByRole } = render(
			<PaymentReceipt payment={payment()} />,
		);
		fireEvent.click(getByRole("button", { name: /view receipt/i }));
		const link = getByRole("link", {
			name: /view full receipt/i,
		}) as HTMLAnchorElement;
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("when prefers-reduced-motion: reduce, the expanded panel has no transition class (instant swap) — REVIEWS ISSUE-11", () => {
		reduceMotionFlag.value = true;
		try {
			const { getByRole, container } = render(
				<PaymentReceipt payment={payment()} />,
			);
			fireEvent.click(getByRole("button", { name: /view receipt/i }));
			const expanded = container.querySelector(
				"[data-payment-receipt-details]",
			);
			expect(expanded).not.toBeNull();
			expect(expanded!.className).not.toMatch(/transition/);
		} finally {
			reduceMotionFlag.value = false;
		}
	});
});
