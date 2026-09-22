// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

import { InvoicesRenderer } from "../record-list-renderer";

function invoice(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "inv1",
		invoiceNumber: "1001",
		status: "sent",
		total: 500,
		dueDate: "2026-10-01",
		...overrides,
	};
}

describe("InvoicesRenderer (record-list-renderer)", () => {
	it("renders a row per invoice with its status badge and amount", () => {
		render(<InvoicesRenderer input={{}} output={{ items: [invoice()], totalCount: 1 }} />);

		expect(screen.getByText("Invoice 1001")).toBeInTheDocument();
		expect(screen.getByText("$500.00")).toBeInTheDocument();
		expect(screen.getByText("Sent")).toBeInTheDocument();
	});

	it("caps rows at 8 and shows a +N more line", () => {
		const items = Array.from({ length: 12 }, (_, i) =>
			invoice({ id: `inv${i}`, invoiceNumber: String(1000 + i) })
		);
		render(<InvoicesRenderer input={{}} output={{ items, totalCount: 12 }} />);

		expect(screen.getAllByText(/^Invoice /)).toHaveLength(8);
		expect(screen.getByText("+4 more")).toBeInTheDocument();
	});

	it("shows a single muted line when there are no results", () => {
		render(<InvoicesRenderer input={{}} output={{ items: [], totalCount: 0 }} />);

		expect(screen.getByText("No invoices found.")).toBeInTheDocument();
	});
});
