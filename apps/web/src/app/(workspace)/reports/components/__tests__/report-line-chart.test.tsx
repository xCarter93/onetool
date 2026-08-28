// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
	// getBoundingClientRect is inherited from Element.prototype, so there is no
	// HTMLElement descriptor to restore — deleting the stub restores inheritance.
	if (originalGetBoundingClientRect) {
		Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
	} else {
		delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
	}
});

import { ReportLineChart } from "../report-line-chart";

describe("ReportLineChart", () => {
	it("fills a height-constrained canvas: flex-fill root, growable chart box", () => {
		const { container } = render(
			<ReportLineChart
				data={[
					{ name: "Jan", value: 5 },
					{ name: "Feb", value: 9 },
				]}
				total={14}
				groupBy="month"
			/>
		);
		const chart = container.querySelector('[data-slot="chart"]');
		expect(chart).toHaveClass("grow", "shrink-0", "min-h-[300px]");
		expect(chart?.parentElement).toHaveClass("flex", "flex-1", "flex-col");
	});

	it("renders the trend summary for real data", () => {
		render(
			<ReportLineChart
				data={[
					{ name: "Jan", value: 5 },
					{ name: "Feb", value: 9 },
				]}
				total={14}
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
				groupBy="month"
			/>
		);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});

	it("empty data array renders the no-data hint", () => {
		render(<ReportLineChart data={[]} total={0} groupBy="month" />);
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
			<ReportLineChart data={trendData} total={14} groupBy="month" />
		);

		expect(container.textContent).not.toContain("Revenue by Month");
		expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
	});
});

describe("ReportLineChart — currency is an explicit flag, never inferred", () => {
	const data = [
		{ name: "Jan", value: 700 },
		{ name: "Feb", value: 800 },
	];

	it("currency report: the summary total renders as compact dollars", () => {
		render(
			<ReportLineChart
				data={data}
				total={1500}
				groupBy="month"
				totalIsCurrency
				itemValueIsCurrency
			/>
		);

		expect(screen.getByText("Total: $1.5K")).toBeInTheDocument();
	});

	it("count report: the summary total renders as a plain number", () => {
		render(<ReportLineChart data={data} total={1500} groupBy="month" />);

		expect(screen.getByText("Total: 1,500")).toBeInTheDocument();
	});
});

describe("ReportLineChart — bucket drill-down", () => {
	it("clicking a point opens that bucket", () => {
		const onBucketClick = vi.fn();
		const { container } = render(
			<ReportLineChart
				data={[
					{ name: "Jan", value: 700, bucketKey: "2026-01" },
					{ name: "Feb", value: 800, bucketKey: "2026-02" },
				]}
				total={1500}
				groupBy="month"
				onBucketClick={onBucketClick}
			/>
		);

		const dots = container.querySelectorAll(".cursor-pointer");
		fireEvent.click(dots[1]);
		expect(onBucketClick).toHaveBeenCalledWith("2026-02", "Feb");
	});

	it("without a handler the points render as plain dots", () => {
		const { container } = render(
			<ReportLineChart
				data={[{ name: "Jan", value: 700, bucketKey: "2026-01" }]}
				total={700}
				groupBy="month"
			/>
		);

		expect(container.querySelectorAll(".cursor-pointer")).toHaveLength(0);
	});
});
