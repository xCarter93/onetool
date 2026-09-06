// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configure = vi.fn();
vi.mock("convex/react", () => ({ useMutation: () => configure }));
vi.mock("@onetool/backend/convex/_generated/api", () => ({ api: { payments: { configurePaymentsWithScope: "configure" } } }));
vi.mock("@/hooks/use-org-today", () => ({ useOrgToday: () => Date.UTC(2026, 8, 6) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("motion/react", () => ({
	motion: { div: ({ children, layout: _layout, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div> },
	AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useReducedMotion: () => true,
}));

import { PaymentsConfigurationModal } from "./payments-configuration-modal";

describe("PaymentsConfigurationModal recurring scope", () => {
	beforeEach(() => configure.mockReset());
	afterEach(cleanup);

	it("asks for invoice or future scope before saving a recurring invoice", () => {
		render(<PaymentsConfigurationModal
			isOpen
			onClose={vi.fn()}
			invoiceId={"invoice-1" as never}
			invoiceTotal={100}
			invoiceDueDate={Date.UTC(2026, 9, 6)}
			existingPayments={[{ _id: "payment-1" as never, paymentAmount: 100, dueDate: Date.UTC(2026, 9, 6), status: "pending", sortOrder: 0 }]}
			recurringPaymentRule={{ type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }}
			paymentRuleSourceRevisionId={"revision-1" as never}
		/>);

		fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
		expect(configure).not.toHaveBeenCalled();
		expect(screen.getByText("Apply this change to")).toBeInTheDocument();
		expect(screen.getByText("This invoice")).toBeInTheDocument();
		expect(screen.getByText("This and future invoices")).toBeInTheDocument();
	});

	it("saves the reusable rule with the expected agreement revision", async () => {
		configure.mockResolvedValue({ paymentIds: ["payment-1"], futureProposal: { quoteIds: ["quote-2"] } });
		render(<PaymentsConfigurationModal
			isOpen onClose={vi.fn()} invoiceId={"invoice-1" as never} invoiceTotal={100}
			invoiceDueDate={Date.UTC(2026, 9, 6)}
			existingPayments={[{ _id: "payment-1" as never, paymentAmount: 100, dueDate: Date.UTC(2026, 9, 6), status: "pending", sortOrder: 0 }]}
			recurringPaymentRule={{ type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }}
			paymentRuleSourceRevisionId={"revision-1" as never}
		/>);

		fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
		fireEvent.click(screen.getByText("This and future invoices"));
		fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));

		await waitFor(() => expect(configure).toHaveBeenCalledWith(expect.objectContaining({
			scope: "future",
			futureRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] },
			expectedPaymentRuleSourceRevisionId: "revision-1",
		})));
		expect(await screen.findByRole("button", { name: "Review agreement revision" })).toHaveAttribute("href", "/quotes/quote-2");
	});
});
