// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

// jsdom has no ResizeObserver; Radix Popover's size-tracking hook needs one
// to mount (see report-table.test.tsx for the same pattern).
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});
afterAll(() => {
	globalThis.ResizeObserver = originalResizeObserver;
});

import { AddChartControl } from "../report-builder";

describe("AddChartControl (Slice 3-D3 — 'Add chart' replaces the segmented viz switcher)", () => {
	it("shows 'Add chart' and is disabled when there's no Group by", () => {
		const onChange = vi.fn();
		render(<AddChartControl value="table" groupBy={undefined} onChange={onChange} />);

		expect(screen.getByRole("button", { name: /add chart/i })).toBeDisabled();
		expect(screen.getByText("Group your data to add a chart.")).toBeInTheDocument();
	});

	it("is enabled once a Group by is set, and opening the popover picks a chart type", () => {
		const onChange = vi.fn();
		render(<AddChartControl value="table" groupBy="status" onChange={onChange} />);

		const trigger = screen.getByRole("button", { name: /add chart/i });
		expect(trigger).not.toBeDisabled();
		expect(screen.queryByText("Group your data to add a chart.")).not.toBeInTheDocument();

		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole("button", { name: "Pie" }));
		expect(onChange).toHaveBeenCalledWith("pie");
	});

	it("shows the active chart's label/icon and a 'Remove chart' row when a chart is active", () => {
		const onChange = vi.fn();
		render(<AddChartControl value="pie" groupBy="status" onChange={onChange} />);

		expect(screen.getByRole("button", { name: /^pie$/i })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /^pie$/i }));

		expect(screen.getByText("Remove chart")).toBeInTheDocument();
		fireEvent.click(screen.getByText("Remove chart"));
		expect(onChange).toHaveBeenCalledWith("table");
	});

	it("does not show 'Remove chart' when no chart is active", () => {
		render(<AddChartControl value="table" groupBy="status" onChange={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: /add chart/i }));
		expect(screen.queryByText("Remove chart")).not.toBeInTheDocument();
	});
});
