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

import { ReportRadialChart } from "../report-radial-chart";

describe("ReportRadialChart", () => {
	it("renders one radial bar per category", () => {
		// Slice 3-D3: the per-item HTML legend (which used to render "A"/"B"/"C"
		// labels) was removed — the data table beneath the chart now carries
		// those labels. Assert against what still renders: the header total
		// and one radial sector per category.
		const { container } = render(
			<ReportRadialChart
				data={[
					{ name: "A", value: 6 },
					{ name: "B", value: 3 },
					{ name: "C", value: 1 },
				]}
				total={10}
				entityType="tasks"
				groupBy="status"
				totalIsCurrency={false}
			/>
		);
		expect(container.querySelectorAll(".recharts-radial-bar-sector")).toHaveLength(3);
		expect(screen.getByText("3 categories")).toBeInTheDocument();
		expect(screen.getByText("Total: 10")).toBeInTheDocument();
	});

	it("all-zero data renders the no-data hint instead of a blank canvas", () => {
		render(
			<ReportRadialChart
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
});
