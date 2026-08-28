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
	// getBoundingClientRect is inherited from Element.prototype, so there is no
	// HTMLElement descriptor to restore — deleting the stub restores inheritance.
	if (originalGetBoundingClientRect) {
		Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
	} else {
		delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
	}
});

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

import { useQuery } from "convex/react";
import { ReportPreview } from "../report-preview";
import { TRUNCATION_NOTICE } from "../../report-config";

const mockedUseQuery = vi.mocked(useQuery);

afterEach(() => {
	mockedUseQuery.mockReset();
});

describe("ReportPreview — one visualization on the canvas (d7)", () => {
	it("chart + groupBy set: renders ONLY the chart — the summary table lives in Calculated values", () => {
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
				config={{
					version: 2,
					entityType: "clients",
					metric: { op: "count" },
					groupBy: "status",
				}}
				visualization={{ type: "bar" }}
			/>
		);

		// Chart-specific evidence: one rendered bar per category.
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
		// The grouped table no longer renders under the chart (d7).
		expect(screen.queryByText("2 rows")).not.toBeInTheDocument();
		expect(screen.queryByText("62.5%")).not.toBeInTheDocument();
	});

	it("number type: renders the scalar aggregate as a KPI figure", () => {
		mockedUseQuery.mockReturnValue({
			data: [{ label: "Total", value: 40000 }],
			total: 40000,
			metadata: { totalIsCurrency: true },
		});

		const { container } = render(
			<ReportPreview
				config={{
					version: 2,
					entityType: "invoices",
					metric: { op: "sum", field: "total" },
				}}
				visualization={{ type: "number" }}
			/>
		);

		expect(screen.getByText("$40,000")).toBeInTheDocument();
		expect(screen.getByText("Sum of Total")).toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
	});

	it("vizType 'table': renders only the table, no chart", () => {
		mockedUseQuery.mockReturnValue({
			data: [{ label: "Active", value: 5, metadata: {} }],
			total: 5,
			metadata: {},
		});

		const { container } = render(
			<ReportPreview
				config={{
					version: 2,
					entityType: "clients",
					metric: { op: "count" },
					groupBy: "status",
				}}
				visualization={{ type: "table" }}
			/>
		);

		expect(screen.getByText("1 rows")).toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
	});

	it("the grouped table's value column is headed by the metric, not a hard-coded Count", () => {
		mockedUseQuery.mockReturnValue({
			data: [{ label: "Paid", value: 40000, metadata: {} }],
			total: 40000,
			metadata: { totalIsCurrency: true },
		});

		render(
			<ReportPreview
				config={{
					version: 2,
					entityType: "invoices",
					metric: { op: "sum", field: "total" },
					groupBy: "status",
				}}
				visualization={{ type: "table" }}
			/>
		);

		expect(
			screen.getByRole("columnheader", { name: "Sum of Total" })
		).toBeInTheDocument();
		expect(screen.queryByRole("columnheader", { name: "Count" })).toBeNull();
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
				config={{
					version: 2,
					entityType: "clients",
					metric: { op: "count" },
				}}
				visualization={{ type: "bar" }}
			/>
		);

		expect(screen.getByText("Company Name")).toBeInTheDocument();
		expect(screen.getByText("Acme")).toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
	});
});

describe("ReportPreview — segmentBy", () => {
	function mockSegmentedResult() {
		mockedUseQuery.mockReturnValue({
			data: [
				{ label: "Jan", value: 8, metadata: {}, segments: { paid: 5, unpaid: 3 } },
				{ label: "Feb", value: 6, metadata: {}, segments: { paid: 4, unpaid: 2 } },
			],
			total: 14,
			metadata: {
				segmentBy: "status",
				segments: [
					{ key: "paid", label: "Paid" },
					{ key: "unpaid", label: "Unpaid" },
				],
			},
		});
	}

	const segmentedConfig = {
		version: 2 as const,
		entityType: "invoices" as const,
		metric: { op: "count" as const },
		groupBy: "month",
		segmentBy: "status",
	};

	it("segmentBy + bar: wide rows reach the wrapper and render stacked segments", () => {
		mockSegmentedResult();

		const { container } = render(
			<ReportPreview config={segmentedConfig} visualization={{ type: "bar" }} />
		);

		// 2 buckets x 2 segments, not the 2 rects a single-series bar would draw.
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(4);
		expect(container.querySelectorAll(".recharts-bar")).toHaveLength(2);
	});

	it("segmentBy + pie: segments are ignored, a plain single-series pie renders", () => {
		mockSegmentedResult();

		const { container } = render(
			<ReportPreview config={segmentedConfig} visualization={{ type: "pie" }} />
		);

		expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(2);
		expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
	});
});

describe("ReportPreview — truncation notice on empty results", () => {
	const groupedConfig = {
		version: 2 as const,
		entityType: "clients" as const,
		metric: { op: "count" as const },
		groupBy: "status",
	};
	const detailConfig = {
		version: 2 as const,
		entityType: "clients" as const,
		metric: { op: "count" as const },
	};

	it("truncated + no grouped data: says the scan was bounded, not that nothing exists", () => {
		mockedUseQuery.mockReturnValue({
			data: [],
			total: 0,
			metadata: { truncated: true },
		});

		render(<ReportPreview config={groupedConfig} visualization={{ type: "bar" }} />);

		expect(screen.getByText("No data available")).toBeInTheDocument();
		expect(screen.getByText(TRUNCATION_NOTICE)).toBeInTheDocument();
	});

	it("truncated + no detail rows: says the scan was bounded", () => {
		mockedUseQuery.mockReturnValue({
			total: 0,
			metadata: { truncated: true },
			detail: {
				columns: [{ field: "companyName", label: "Company Name", type: "string" }],
				rows: [],
				totalMatched: 0,
				rowsTruncated: false,
			},
		});

		render(<ReportPreview config={detailConfig} visualization={{ type: "bar" }} />);

		expect(screen.getByText("No records available")).toBeInTheDocument();
		expect(screen.getByText(TRUNCATION_NOTICE)).toBeInTheDocument();
	});

	it("not truncated + empty: the empty state stands alone", () => {
		mockedUseQuery.mockReturnValue({ data: [], total: 0, metadata: {} });

		render(<ReportPreview config={groupedConfig} visualization={{ type: "bar" }} />);

		expect(screen.getByText("No data available")).toBeInTheDocument();
		expect(screen.queryByText(TRUNCATION_NOTICE)).not.toBeInTheDocument();
	});

	it("not truncated + no detail rows: the empty state stands alone", () => {
		mockedUseQuery.mockReturnValue({
			total: 0,
			detail: {
				columns: [{ field: "companyName", label: "Company Name", type: "string" }],
				rows: [],
				totalMatched: 0,
				rowsTruncated: false,
			},
		});

		render(<ReportPreview config={detailConfig} visualization={{ type: "bar" }} />);

		expect(screen.getByText("No records available")).toBeInTheDocument();
		expect(screen.queryByText(TRUNCATION_NOTICE)).not.toBeInTheDocument();
	});
});

describe("ReportPreview — dotted groupBy labels (F5, d15)", () => {
	it("a saved traversal groupBy renders its breadcrumb on the axis, not the raw path", () => {
		mockedUseQuery.mockReturnValue({
			data: [
				{ label: "Spring Cleanup", value: 5, metadata: {} },
				{ label: "Lawn Care", value: 3, metadata: {} },
			],
			total: 8,
			metadata: {},
		});

		render(
			<ReportPreview
				config={{
					version: 2,
					entityType: "quoteLineItems",
					metric: { op: "count" },
					groupBy: "quoteId.projectId",
				}}
				visualization={{ type: "column", options: { axisLabels: true } }}
			/>
		);

		expect(screen.getByText("Quote › Project")).toBeInTheDocument();
		expect(screen.queryByText("quoteId.projectId")).not.toBeInTheDocument();
	});
});
