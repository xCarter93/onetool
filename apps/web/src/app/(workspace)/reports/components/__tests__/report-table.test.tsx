// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one to
// mount. Scoped to this file (save/restore) so it can't leak into other
// test files sharing the same worker.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
});

import { ReportTable } from "../report-table";

describe("ReportTable", () => {
	it("count report (clients by status): Total is the plain record count", () => {
		render(
			<ReportTable
				data={[
					{ name: "Active", value: 7 },
					{ name: "Lead", value: 3 },
				]}
				total={10}
				entityType="clients"
				groupBy="status"
				totalIsCurrency={false}
			/>
		);

		expect(screen.getByText("Total: 10")).toBeInTheDocument();
	});

	it("revenue report (invoices by status): Total is the $ total prop, not a reduce over item counts", () => {
		render(
			<ReportTable
				data={[
					{ name: "Paid", value: 8, totalValue: 35000 },
					{ name: "Sent", value: 4, totalValue: 5000 },
				]}
				total={40000}
				entityType="invoices"
				groupBy="status"
				totalIsCurrency={true}
			/>
		);

		// Regression: 12 invoices (8 + 4) worth $40,000 must render "Total:
		// $40,000", never "Total: $12" (the old code did
		// `data.reduce((sum, d) => sum + d.value, 0)` — a record count —
		// then formatted THAT as currency).
		expect(screen.getByText("Total: $40,000")).toBeInTheDocument();
		expect(screen.queryByText("Total: $12")).not.toBeInTheDocument();
		expect(screen.queryByText("Total: 12")).not.toBeInTheDocument();
	});

	it("per-item dollar Value column always formats as currency (no magnitude threshold)", () => {
		render(
			<ReportTable
				data={[{ name: "Draft", value: 1, totalValue: 50 }]}
				total={50}
				entityType="invoices"
				groupBy="status"
				totalIsCurrency={true}
			/>
		);

		// $50 is under the old ">100" heuristic threshold and would have
		// rendered as the bare number "50" instead of "$50".
		expect(screen.getByText("$50")).toBeInTheDocument();
	});

	describe("detail mode", () => {
		it("renders column headers and formats cells by type (currency, timestamp, boolean, null)", () => {
			render(
				<ReportTable
					data={[]}
					total={2}
					entityType="invoices"
					detail={{
						columns: [
							{ field: "invoiceNumber", label: "Invoice Number", type: "string" },
							{ field: "total", label: "Total", type: "currency" },
							{ field: "issuedDate", label: "Issued Date", type: "timestamp" },
							{ field: "isActive", label: "Active", type: "boolean" },
						],
						rows: [
							{
								invoiceNumber: "INV-001",
								total: 1200,
								issuedDate: new Date(2026, 0, 15).getTime(),
								isActive: true,
							},
							{
								invoiceNumber: "INV-002",
								total: null,
								issuedDate: null,
								isActive: false,
							},
						],
						totalMatched: 2,
						rowsTruncated: false,
					}}
				/>
			);

			expect(screen.getByText("Invoice Number")).toBeInTheDocument();
			expect(screen.getByText("Total")).toBeInTheDocument();
			expect(screen.getByText("Issued Date")).toBeInTheDocument();
			expect(screen.getByText("Active")).toBeInTheDocument();

			expect(screen.getByText("INV-001")).toBeInTheDocument();
			expect(screen.getByText("$1,200")).toBeInTheDocument();
			expect(screen.getByText("Jan 15, 2026")).toBeInTheDocument();
			expect(screen.getByText("Yes")).toBeInTheDocument();

			expect(screen.getByText("INV-002")).toBeInTheDocument();
			expect(screen.getByText("No")).toBeInTheDocument();
			expect(screen.getAllByText("—").length).toBe(2);
		});

		it("shows the truncation line when rowsTruncated is true", () => {
			render(
				<ReportTable
					data={[]}
					total={500}
					entityType="clients"
					detail={{
						columns: [{ field: "companyName", label: "Company Name", type: "string" }],
						rows: [{ companyName: "Acme" }],
						totalMatched: 500,
						rowsTruncated: true,
					}}
				/>
			);

			expect(
				screen.getByText("Showing first 1 of 500 records.")
			).toBeInTheDocument();
		});
	});
});
