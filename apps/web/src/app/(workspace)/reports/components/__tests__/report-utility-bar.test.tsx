// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
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

function bar(
	config: ReportConfigV2,
	groupByLabel: string,
	showCsvDownload = true,
	extra: Partial<React.ComponentProps<typeof ReportUtilityBar>> = {}
) {
	return (
		<ReportUtilityBar
			saved={{ config, visualization: { type: "bar" } }}
			reportName="Clients"
			groupByLabel={groupByLabel}
			rangeLabel="Last 30 days"
			showCsvDownload={showCsvDownload}
			{...extra}
		/>
	);
}

describe("ReportUtilityBar — CSV waits for the debounced args to settle", () => {
	it("without showCsvDownload (the builder), no download button renders", () => {
		render(bar(byStatus, "Status", false));

		expect(
			screen.queryByRole("button", { name: /Download CSV/ })
		).not.toBeInTheDocument();
	});

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

describe("ReportUtilityBar — View contributing data", () => {
	const contributing = () => screen.queryByRole("button", { name: /View contributing data/ });

	it("is absent unless the surface wires it up", () => {
		render(bar(byStatus, "Status"));

		expect(contributing()).not.toBeInTheDocument();
	});

	it("opens the sheet unscoped", () => {
		const onViewContributingData = vi.fn();
		render(bar(byStatus, "Status", true, { onViewContributingData }));

		fireEvent.click(contributing()!);
		expect(onViewContributingData).toHaveBeenCalledTimes(1);
	});

	it("stays hidden in raw-rows mode, where the canvas already lists the records", () => {
		render(
			<ReportUtilityBar
				saved={{
					config: { version: 2, entityType: "clients", metric: { op: "count" } },
					visualization: { type: "table" },
				}}
				reportName="Clients"
				rangeLabel="Last 30 days"
				onViewContributingData={vi.fn()}
			/>
		);

		expect(contributing()).not.toBeInTheDocument();
	});

	it("config change mid-debounce disables it, re-enabling once args settle", () => {
		const onViewContributingData = vi.fn();
		const { rerender } = render(
			bar(byStatus, "Status", true, { onViewContributingData })
		);

		rerender(bar(byMonth, "Created by Month", true, { onViewContributingData }));
		expect(contributing()).toBeDisabled();

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(contributing()).toBeEnabled();
	});
});

describe("ReportUtilityBar — comparison stats (R11)", () => {
	const compared: ReportConfigV2 = {
		...byStatus,
		date: {
			range: { kind: "preset", preset: "this_year" },
			comparison: { kind: "previous_period" },
		},
	};

	it("Calculated values gains Previous total and Change rows", () => {
		mockedUseQuery.mockReturnValue({
			data: [
				{ label: "Active", value: 5, compareValue: 4, metadata: {} },
				{ label: "Lead", value: 3, compareValue: 6, metadata: {} },
			],
			total: 8,
			metadata: { compareTotal: 10 },
		});

		render(bar(compared, "Status"));
		fireEvent.click(screen.getByRole("button", { name: /Calculated values/ }));

		// The summary table below carries a "Change" column too, so scope to the stats list.
		const stats = within(screen.getByText("Previous total").closest("dl")!);
		expect(stats.getByText("Change")).toBeInTheDocument();
		expect(screen.getByText("-20.0%")).toBeInTheDocument();
	});

	it("the summary table gains a Previous column", () => {
		mockedUseQuery.mockReturnValue({
			data: [
				{ label: "Active", value: 5, compareValue: 4, metadata: {} },
				{ label: "Lead", value: 3, compareValue: 6, metadata: {} },
			],
			total: 8,
			metadata: { compareTotal: 10 },
		});

		render(bar(compared, "Status"));
		fireEvent.click(screen.getByRole("button", { name: /Calculated values/ }));

		expect(
			screen.getByRole("columnheader", { name: "Previous" })
		).toBeInTheDocument();
	});

	it("no comparison in the config: the stats block is unchanged", () => {
		render(bar(byStatus, "Status"));
		fireEvent.click(screen.getByRole("button", { name: /Calculated values/ }));

		expect(screen.queryByText("Previous total")).toBeNull();
		expect(screen.queryByRole("columnheader", { name: "Previous" })).toBeNull();
	});
});
