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

import { ReportRadarChart } from "../report-radar-chart";

const THREE_BUCKETS = [
	{ name: "A", value: 6 },
	{ name: "B", value: 3 },
	{ name: "C", value: 1 },
];

describe("ReportRadarChart", () => {
	it("renders a radar polygon for 3+ buckets", () => {
		const { container } = render(
			<ReportRadarChart data={THREE_BUCKETS} total={10} entityType="tasks" groupBy="status" />
		);
		expect(container.querySelectorAll(".recharts-radar-polygon")).toHaveLength(1);
	});

	it("fewer than 3 buckets shows the 'needs at least three groups' hint instead of a chart", () => {
		render(
			<ReportRadarChart
				data={[
					{ name: "A", value: 6 },
					{ name: "B", value: 3 },
				]}
				total={9}
				entityType="tasks"
				groupBy="status"
			/>
		);
		expect(
			screen.getByText("Radar needs at least three groups — try another chart type.")
		).toBeInTheDocument();
	});

	it("all-zero data renders the no-data hint instead of a blank canvas", () => {
		render(
			<ReportRadarChart
				data={[
					{ name: "A", value: 0 },
					{ name: "B", value: 0 },
					{ name: "C", value: 0 },
				]}
				total={0}
				entityType="tasks"
				groupBy="status"
			/>
		);
		expect(screen.getByText("No data for this date range.")).toBeInTheDocument();
	});
});
