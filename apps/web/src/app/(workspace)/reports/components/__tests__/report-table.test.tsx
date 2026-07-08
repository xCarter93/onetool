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
});
