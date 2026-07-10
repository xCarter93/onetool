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
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
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
});
