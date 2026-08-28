// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("convex/react", () => ({
	useQuery: vi.fn(),
}));

import { useQuery } from "convex/react";
import { ReportUtilityBar } from "../report-utility-bar";
import type { ReportConfigV2 } from "../../report-config";

const mockedUseQuery = vi.mocked(useQuery);

beforeEach(() => {
	vi.useFakeTimers();
	mockedUseQuery.mockReturnValue({
		data: [
			{ label: "Active", value: 5, metadata: {} },
			{ label: "Lead", value: 3, metadata: {} },
		],
		total: 8,
		metadata: {},
	});
});

afterEach(() => {
	cleanup();
	mockedUseQuery.mockReset();
	vi.useRealTimers();
});

const byStatus: ReportConfigV2 = {
	version: 2,
	entityType: "clients",
	metric: { op: "count" },
	groupBy: "status",
};
const byMonth: ReportConfigV2 = { ...byStatus, groupBy: "createdAt_month" };

function bar(config: ReportConfigV2, groupByLabel: string) {
	return (
		<ReportUtilityBar
			saved={{ config, visualization: { type: "bar" } }}
			reportName="Clients"
			groupByLabel={groupByLabel}
			rangeLabel="Last 30 days"
		/>
	);
}

describe("ReportUtilityBar — CSV waits for the debounced args to settle", () => {
	it("settled args with data present: Download CSV is enabled", () => {
		render(bar(byStatus, "Status"));

		expect(screen.getByRole("button", { name: /Download CSV/ })).toBeEnabled();
	});

	it("config change mid-debounce disables the download, re-enabling once args settle", () => {
		const { rerender } = render(bar(byStatus, "Status"));
		const button = () => screen.getByRole("button", { name: /Download CSV/ });

		rerender(bar(byMonth, "Created by Month"));
		expect(button()).toBeDisabled();

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(button()).toBeEnabled();
	});
});
