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
let originalOffsetWidth: PropertyDescriptor | undefined;
let originalOffsetHeight: PropertyDescriptor | undefined;
let originalGetBoundingClientRect: PropertyDescriptor | undefined;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub;
	originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
	originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
	originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"getBoundingClientRect"
	);
	// Give recharts a real box: jsdom reports 0x0 otherwise, so bars/ticks
	// never render — needed now that the legend (which rendered outside the
	// measured chart area) is gone and assertions read the SVG itself.
	Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
		configurable: true,
		value: 600,
	});
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		value: 400,
	});
	Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			width: 600,
			height: 400,
			top: 0,
			left: 0,
			right: 600,
			bottom: 400,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}),
	});
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
	if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
	if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
	if (originalGetBoundingClientRect)
		Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
});

import { ReportBarChart } from "../report-bar-chart";

/** Value-axis tick labels (the ones formatted by `formatValue`/itemValueIsCurrency). */
function tickTexts(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll(".recharts-cartesian-axis-tick-value")).map(
		(el) => el.textContent ?? ""
	);
}

describe("ReportBarChart", () => {
	// Slice 3-D3: the per-item HTML legend was removed (the data table now
	// renders beneath the chart and carries labels/values). These assertions
	// are re-anchored to the header total and the rendered bars/axis ticks.
	it("count report (tasks by status): Total is the plain record count, one bar per category, no $ on the value axis", () => {
		const { container } = render(
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
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
		expect(tickTexts(container).some((t) => t.includes("$"))).toBe(false);
	});

	it("revenue report (invoices by status): Total comes from the $ total prop, not a reduce over item counts; bars stay count-formatted", () => {
		const { container } = render(
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
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
		// Status-grouped: item values are counts, not currency — the value axis
		// must not show $ even though the header total is currency.
		expect(tickTexts(container).some((t) => t.includes("$"))).toBe(false);
	});

	it("revenue-by-month report: item values are currency-formatted (value axis shows $, not raw counts)", () => {
		const { container } = render(
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
		expect(tickTexts(container).some((t) => t.includes("$"))).toBe(true);
	});

	it("all-zero data renders the no-data hint instead of a blank canvas", () => {
		render(
			<ReportBarChart
				data={[
					{ name: "Pending", value: 0 },
					{ name: "Completed", value: 0 },
				]}
				total={0}
				entityType="tasks"
				groupBy="status"
			/>
		);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});

	it("empty data array renders the no-data hint", () => {
		render(<ReportBarChart data={[]} total={0} entityType="tasks" groupBy="status" />);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});
});
