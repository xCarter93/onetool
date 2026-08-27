// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

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
	// Give recharts a real box: jsdom reports 0x0 otherwise, so the axis labels
	// and reference line asserted below never render.
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

import { ReportLineChart } from "../report-line-chart";

describe("ReportLineChart", () => {
	it("renders the trend summary for real data", () => {
		render(
			<ReportLineChart
				data={[
					{ name: "Jan", value: 5 },
					{ name: "Feb", value: 9 },
				]}
				total={14}
				entityType="invoices"
				groupBy="month"
			/>
		);
		expect(screen.getByText("2 data points")).toBeInTheDocument();
	});

	it("all-zero data renders the no-data hint instead of a blank canvas", () => {
		render(
			<ReportLineChart
				data={[
					{ name: "Jan", value: 0 },
					{ name: "Feb", value: 0 },
				]}
				total={0}
				entityType="invoices"
				groupBy="month"
			/>
		);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});

	it("empty data array renders the no-data hint", () => {
		render(<ReportLineChart data={[]} total={0} entityType="invoices" groupBy="month" />);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});

	const trendData = [
		{ name: "Jan", value: 5 },
		{ name: "Feb", value: 9 },
	];

	it("axisLabels renders both axis titles; targetLine renders a reference line", () => {
		const { container } = render(
			<ReportLineChart
				data={trendData}
				total={14}
				entityType="invoices"
				groupBy="month"
				axisLabels={{ x: "Revenue by Month", y: "Sum of Total" }}
				targetLine={100}
			/>
		);

		expect(container.textContent).toContain("Revenue by Month");
		expect(container.textContent).toContain("Sum of Total");
		expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(1);
	});

	it("neither prop set: no axis titles and no reference line", () => {
		const { container } = render(
			<ReportLineChart data={trendData} total={14} entityType="invoices" groupBy="month" />
		);

		expect(container.textContent).not.toContain("Revenue by Month");
		expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
	});
});
