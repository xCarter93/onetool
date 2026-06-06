// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("framer-motion", () => ({
	useReducedMotion: vi.fn(() => false),
}));
// Avoid pulling in @/hooks/use-toast's provider tree during render.
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
		loading: vi.fn(),
	}),
}));

import {
	PaidStatusPanel,
	type PaidStatusPanelData,
} from "../paid-status-panel";

function makeData(overrides: Partial<PaidStatusPanelData> = {}): PaidStatusPanelData {
	return {
		invoice: {
			_id: "inv_paid_1",
			...overrides.invoice,
		},
		businessName: overrides.businessName ?? "Acme Cleaning Co.",
		payments:
			overrides.payments ??
			[
				{
					_id: "p_1",
					status: "paid",
					description: "Deposit",
					paymentAmount: 250,
					paidAt: new Date("2026-03-15T12:00:00Z").getTime(),
					cardBrand: "visa",
					cardLast4: "4242",
					receiptUrl: "https://receipts.stripe.test/p1",
				},
				{
					_id: "p_2",
					status: "paid",
					description: "Final",
					paymentAmount: 500,
					paidAt: new Date("2026-04-20T12:00:00Z").getTime(),
					cardBrand: "mastercard",
					cardLast4: "5555",
					receiptUrl: "https://receipts.stripe.test/p2",
				},
			],
	};
}

describe("PaidStatusPanel", () => {
	it("renders 'Paid in full' heading and businessName in the body", () => {
		const { container } = render(
			<PaidStatusPanel data={makeData()} hasPdf={true} />,
		);
		expect(container.textContent).toMatch(/Paid in full/);
		expect(container.textContent).toMatch(/Acme Cleaning Co\./);
	});

	it("renders one PaymentReceipt row per payment with status === 'paid'", () => {
		const data = makeData({
			payments: [
				{
					_id: "p_paid_1",
					status: "paid",
					description: "Deposit",
					paymentAmount: 250,
					paidAt: Date.now() - 1000,
					cardBrand: "visa",
					cardLast4: "4242",
					receiptUrl: null,
				},
				{
					_id: "p_pending",
					status: "sent",
					description: "Final",
					paymentAmount: 500,
					paidAt: null,
					cardBrand: null,
					cardLast4: null,
					receiptUrl: null,
				},
				{
					_id: "p_paid_2",
					status: "paid",
					description: "Final",
					paymentAmount: 500,
					paidAt: Date.now() - 500,
					cardBrand: "amex",
					cardLast4: "0005",
					receiptUrl: null,
				},
			],
		});
		const { container } = render(<PaidStatusPanel data={data} hasPdf={true} />);
		// PaymentReceipt rows are buttons exposing "View receipt" toggles.
		const toggles = Array.from(
			container.querySelectorAll('button[aria-expanded]'),
		);
		expect(toggles.length).toBe(2);
	});

	it("renders defensive empty-state copy when no paid payments are present", () => {
		const { container } = render(
			<PaidStatusPanel
				data={makeData({ payments: [] })}
				hasPdf={true}
			/>,
		);
		expect(container.textContent).toMatch(/payment records will appear here/i);
	});

	it("Download PDF affordance is a <button>, NOT a direct <a href> to the JSON route (REVIEWS ISSUE-3)", () => {
		const data = makeData();
		const { container } = render(<PaidStatusPanel data={data} hasPdf={true} />);
		// Reverse check: no anchor pointing at the PDF JSON envelope.
		const directAnchor = container.querySelector(
			`a[href*="/api/portal/invoices/${data.invoice._id}/pdf"]`,
		);
		expect(directAnchor).toBeNull();
		// Positive check: the DownloadPdfButton is rendered as a <button>.
		const buttons = Array.from(container.querySelectorAll("button"));
		const downloadButton = buttons.find((b) =>
			(b.textContent ?? "").toLowerCase().includes("download pdf"),
		);
		expect(downloadButton).toBeDefined();
	});
});
