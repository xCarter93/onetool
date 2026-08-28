// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
	// Give recharts a real box: jsdom reports 0x0 otherwise, which starves
	// ResponsiveContainer and (combined with animation) can hide marks.
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

import { ReportPieChart } from "../report-pie-chart";

describe("ReportPieChart", () => {
	it("fills a height-constrained canvas: flex-fill root, growable chart box", () => {
		const { container } = render(
			<ReportPieChart
				data={[
					{ name: "A", value: 6 },
					{ name: "B", value: 3 },
				]}
				total={9}
				entityType="tasks"
				groupBy="status"
			/>
		);
		const chart = container.querySelector('[data-slot="chart"]');
		expect(chart).toHaveClass("grow", "shrink-0", "h-[420px]");
		expect(chart?.parentElement).toHaveClass("flex", "flex-1", "flex-col");
	});

	it("regression: renders a sector per nonzero category on initial mount (recharts 3.8.0 animated-Pie mount bug)", () => {
		// Must stay isAnimationActive={false} in report-pie-chart.tsx — recharts
		// 3.8.0 paints zero sectors on first mount when Pie animation is on.
		// This test fails immediately if that guard is ever removed.
		const { container } = render(
			<ReportPieChart
				data={[
					{ name: "A", value: 6 },
					{ name: "B", value: 3 },
					{ name: "C", value: 1 },
				]}
				total={10}
				entityType="tasks"
				groupBy="status"
			/>
		);
		expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(3);
	});

	it("all-zero data renders the no-data hint instead of a blank canvas", () => {
		render(
			<ReportPieChart
				data={[
					{ name: "A", value: 0 },
					{ name: "B", value: 0 },
				]}
				total={0}
				entityType="tasks"
				groupBy="status"
			/>
		);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});

	it("clicking a slice opens that bucket", () => {
		const onBucketClick = vi.fn();
		const { container } = render(
			<ReportPieChart
				data={[
					{ name: "Paid", value: 6, bucketKey: "paid" },
					{ name: "Sent", value: 3, bucketKey: "sent" },
				]}
				total={9}
				entityType="invoices"
				groupBy="status"
				onBucketClick={onBucketClick}
			/>
		);

		fireEvent.click(container.querySelectorAll(".recharts-pie-sector")[1]);
		expect(onBucketClick).toHaveBeenCalledWith("sent", "Sent");
	});
});
