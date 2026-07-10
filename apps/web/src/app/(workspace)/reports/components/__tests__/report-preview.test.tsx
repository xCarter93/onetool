// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

// jsdom has no ResizeObserver, and reports 0x0 element boxes, so recharts'
// ResponsiveContainer never renders an inner SVG without this fuller stub
// (see report-bar-chart.test.tsx for the same pattern).
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
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
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

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

import { useQuery } from "convex/react";
import { ReportPreview } from "../report-preview";

const mockedUseQuery = vi.mocked(useQuery);

afterEach(() => {
	mockedUseQuery.mockReset();
});

describe("ReportPreview — Slice 3-D3 (chart renders above the data table)", () => {
	it("chart + groupBy set: renders BOTH the chart and the grouped table from one query result", () => {
		mockedUseQuery.mockReturnValue({
			data: [
				{ label: "Active", value: 5, metadata: {} },
				{ label: "Lead", value: 3, metadata: {} },
			],
			total: 8,
			metadata: {},
		});

		const { container } = render(
			<ReportPreview
				config={{ entityType: "clients", groupBy: ["status"] }}
				visualization={{ type: "bar" }}
			/>
		);

		// Chart-specific evidence: one rendered bar per category (the chart's
		// own per-item HTML legend was removed — the table now carries labels).
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
		// Table-specific evidence: ReportTable's grouped-mode row summary,
		// per-row "%"-of-category column, and the group label cell — none of
		// which the chart itself renders now that its legend is gone.
		expect(screen.getByText("2 rows")).toBeInTheDocument();
		expect(screen.getByText("62.5%")).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
	});

	it("vizType 'table': renders only the table, no chart", () => {
		mockedUseQuery.mockReturnValue({
			data: [{ label: "Active", value: 5, metadata: {} }],
			total: 5,
			metadata: {},
		});

		const { container } = render(
			<ReportPreview
				config={{ entityType: "clients", groupBy: ["status"] }}
				visualization={{ type: "table" }}
			/>
		);

		expect(screen.getByText("1 rows")).toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
	});

	it("chart + groupBy None (legacy saved report): renders no chart, just the detail table", () => {
		mockedUseQuery.mockReturnValue({
			total: 2,
			detail: {
				columns: [{ field: "companyName", label: "Company Name", type: "string" }],
				rows: [{ companyName: "Acme" }, { companyName: "Beta Co" }],
				totalMatched: 2,
				rowsTruncated: false,
			},
		});

		const { container } = render(
			<ReportPreview
				config={{ entityType: "clients" }}
				visualization={{ type: "bar" }}
			/>
		);

		expect(screen.getByText("Company Name")).toBeInTheDocument();
		expect(screen.getByText("Acme")).toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
	});
});
