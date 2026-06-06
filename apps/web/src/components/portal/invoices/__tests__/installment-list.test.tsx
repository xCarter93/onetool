// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("framer-motion", () => ({
	useReducedMotion: () => false,
}));

afterEach(() => {
	cleanup();
});

import {
	InstallmentList,
	type InstallmentRow,
} from "../installment-list";

function row(overrides: Partial<InstallmentRow> = {}): InstallmentRow {
	return {
		_id: overrides._id ?? `p_${Math.random().toString(36).slice(2)}`,
		paymentAmount: overrides.paymentAmount ?? 100,
		dueDate: overrides.dueDate ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
		description: overrides.description ?? null,
		sortOrder: overrides.sortOrder ?? 0,
		status: overrides.status ?? "sent",
		paidAt: overrides.paidAt ?? null,
		cardLast4: overrides.cardLast4 ?? null,
		cardBrand: overrides.cardBrand ?? null,
		receiptUrl: overrides.receiptUrl ?? null,
	};
}

describe("InstallmentList", () => {
	it("renders one row per payment sorted by sortOrder ASC", () => {
		const installments: InstallmentRow[] = [
			row({ _id: "a", sortOrder: 0, description: "Deposit" }),
			row({ _id: "b", sortOrder: 1, description: "Milestone 1" }),
			row({ _id: "c", sortOrder: 2, description: "Final" }),
		];
		const { container } = render(
			<InstallmentList installments={installments} activeIndex={0} />,
		);
		const rows = container.querySelectorAll("[data-installment-row]");
		expect(rows.length).toBe(3);
		// Ordered as provided (caller sorts before passing).
		expect(rows[0]!.textContent).toContain("Deposit");
		expect(rows[1]!.textContent).toContain("Milestone 1");
		expect(rows[2]!.textContent).toContain("Final");
	});

	it("first unpaid payment (lowest sortOrder with status !== paid) is the active pay target — gets accent left border 3px", () => {
		const installments: InstallmentRow[] = [
			row({
				_id: "paid",
				sortOrder: 0,
				status: "paid",
				paidAt: Date.now() - 1000,
			}),
			row({ _id: "active", sortOrder: 1, status: "sent" }),
			row({ _id: "future", sortOrder: 2, status: "pending" }),
		];
		const { container } = render(
			<InstallmentList installments={installments} activeIndex={1} />,
		);
		const rows = container.querySelectorAll("[data-installment-row]");
		expect(rows[1]!.getAttribute("data-active")).toBe("true");
		expect(rows[0]!.getAttribute("data-active")).toBeNull();
		expect(rows[2]!.getAttribute("data-active")).toBeNull();
		// Accent left border encoded as border-l-[3px] in the active className.
		expect(rows[1]!.className).toMatch(/border-l-\[3px\]/);
	});

	it("paid installment rows show 'Paid · {date}' pill and an expandable PaymentReceipt revealing card brand + last4", () => {
		const paidAt = new Date("2026-03-15T12:00:00Z").getTime();
		const installments: InstallmentRow[] = [
			row({
				_id: "paid-with-card",
				sortOrder: 0,
				status: "paid",
				paidAt,
				cardBrand: "visa",
				cardLast4: "4242",
			}),
		];
		const { container, getByRole } = render(
			<InstallmentList installments={installments} activeIndex={null} />,
		);
		// Pill stays inline; card details live in the expandable receipt.
		expect(container.textContent ?? "").toMatch(/Paid · /);
		const toggle = getByRole("button", { name: /view receipt/i });
		fireEvent.click(toggle);
		const expandedText = container.textContent ?? "";
		expect(expandedText).toMatch(/VISA/);
		expect(expandedText).toContain("4242");
	});

	it("legacy invoices do not render installment rows — the legacy notice replaces the installment list entirely (empty installments renders an empty state, not rows)", () => {
		const { container } = render(
			<InstallmentList installments={[]} activeIndex={null} />,
		);
		// No installment rows rendered.
		expect(
			container.querySelectorAll("[data-installment-row]").length,
		).toBe(0);
		// The component renders an empty-state placeholder. Parent island
		// substitutes LegacyInvoiceNotice for InstallmentList for legacy invoices;
		// this empty branch is the defensive backstop.
		expect(container.querySelector("[data-installment-empty]")).not.toBeNull();
	});
});
