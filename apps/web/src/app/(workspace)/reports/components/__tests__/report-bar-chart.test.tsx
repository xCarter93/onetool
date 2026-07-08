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
	// @ts-expect-error jsdom has no ResizeObserver
	globalThis.ResizeObserver = ResizeObserverStub;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
});

import { ReportBarChart } from "../report-bar-chart";

describe("ReportBarChart", () => {
	it("count report (tasks by status): Total is the plain record count", () => {
		render(
			<ReportBarChart
				data={[
					{ name: "Pending", value: 5 },
					{ name: "Completed", value: 7 },
				]}
				total={12}
				entityType="tasks"
				groupBy="status"
				totalIsCurrency={false}
				itemValueIsCurrency={false}
			/>
		);

		expect(screen.getByText("Total: 12")).toBeInTheDocument();
		// Legend renders raw counts, not currency.
		expect(screen.getByText("(5)")).toBeInTheDocument();
		expect(screen.getByText("(7)")).toBeInTheDocument();
	});

	it("revenue report (invoices by status): Total comes from the $ total prop, not a reduce over item counts", () => {
		render(
			<ReportBarChart
				data={[
					{ name: "Paid", value: 8 },
					{ name: "Sent", value: 4 },
				]}
				total={40000}
				entityType="invoices"
				groupBy="status"
				totalIsCurrency={true}
				itemValueIsCurrency={false}
			/>
		);

		// Regression: 12 invoices (8 + 4) worth $40,000 must render "Total:
		// $40K", never a currency-formatted "$12" derived from the record count.
		expect(screen.getByText("Total: $40K")).toBeInTheDocument();
		expect(screen.queryByText("Total: $12")).not.toBeInTheDocument();
		// Bars/legend show item counts (not currency) for a status-grouped report.
		expect(screen.getByText("(8)")).toBeInTheDocument();
		expect(screen.getByText("(4)")).toBeInTheDocument();
	});

	it("revenue-by-month report: item values are currency-formatted (not raw counts)", () => {
		render(
			<ReportBarChart
				data={[{ name: "2026-06", value: 12345 }]}
				total={12345}
				entityType="invoices"
				groupBy="month"
				totalIsCurrency={true}
				itemValueIsCurrency={true}
			/>
		);

		expect(screen.getByText("Total: $12.3K")).toBeInTheDocument();
		expect(screen.getByText("($12.3K)")).toBeInTheDocument();
	});
});
