// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const lifecycle = vi.fn(async () => null);
let seriesState: "active" | "paused" | "ended" = "ended";
let canManage = true;
let search = new URLSearchParams("fromProjectId=project-2");

vi.mock("next/navigation", () => ({
	useParams: () => ({ seriesId: "series-1" }),
	useSearchParams: () => search,
}));

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		nativeButton: _nativeButton,
		...props
	}: React.ComponentProps<"a"> & { nativeButton?: boolean }) => (
		<a href={String(href)} {...props}>{children}</a>
	),
}));

vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({
		can: () => true,
		hasAllRecords: () => true,
		isLoading: false,
	}),
}));

vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("convex/react", () => ({
	useQuery: vi.fn((reference, args) => {
		if (args === "skip") return undefined;
		switch (getFunctionName(reference)) {
			case "projectSeries:get":
				return {
					series: {
						_id: "series-1",
						title: "Weekly cleaning",
						state: seriesState,
						rule: { frequency: "weekly", interval: 1 },
						anchorDateKey: "2026-08-01",
						timezone: "America/New_York",
					},
					canManage,
					clientName: "Carter House",
					propertyName: null,
					nextVisit: null,
					returnProject: { _id: "project-2", title: "August cleaning" },
				};
			case "projectSeries:listOccurrences":
				return {
					page: [],
					continueCursor: "",
					isDone: true,
					skippableIds: [],
					restorableIds: [],
				};
			case "projectSeries:previewLifecycle":
				return {
					count: 3,
					preserved: 1,
					revision: 7,
					visits: [
						{ _id: "past", title: "Past visit", startDate: Date.UTC(2020, 0, 1) },
						{ _id: "today", title: "Today visit", startDate: Date.UTC(2026, 8, 6) },
						{ _id: "future", title: "Future visit", startDate: Date.UTC(2100, 0, 1) },
					],
				};
		}
	}),
	useMutation: vi.fn((reference) =>
		getFunctionName(reference) === "projectSeries:lifecycle"
			? lifecycle
			: vi.fn(async () => null)
	),
}));

vi.mock("@tanstack/react-table", () => ({ useTable: () => ({}) }));
vi.mock("@/components/reui/data-grid/data-grid", () => ({
	DataGrid: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DataGridContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	dataGridFeatures: {},
}));
vi.mock("@/components/reui/data-grid/data-grid-table", () => ({
	DataGridTable: () => <div />,
}));
vi.mock("@/components/domain/status-badge", () => ({
	StatusBadge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("../../components/recurrence/rule", () => ({
	describeRecurrence: () => "Every week",
}));
vi.mock("../../components/recurrence/schedule-form", () => ({
	RecurrenceScheduleForm: () => <div />,
}));

import SeriesPage from "./page";

beforeEach(() => {
	seriesState = "ended";
	canManage = true;
	search = new URLSearchParams("fromProjectId=project-2");
	lifecycle.mockClear();
	vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 8, 6, 16));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("series lifecycle recovery", () => {
	it("previews and confirms resuming an ended series with its revision", async () => {
		render(<SeriesPage />);

		expect(screen.getByRole("link", { name: "Back to August cleaning" })).toHaveAttribute(
			"href",
			"/projects/project-2"
		);
		fireEvent.click(screen.getByRole("button", { name: "Resume series" }));

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveTextContent("Upcoming visits restored: 2");
		expect(dialog).toHaveTextContent("Past cancellations retained: 1");
		fireEvent.click(screen.getAllByRole("button", { name: "Resume series" }).at(-1)!);

		await waitFor(() =>
			expect(lifecycle).toHaveBeenCalledWith({
				seriesId: "series-1",
				action: "resume",
				expectedVersion: 7,
			})
		);
	});

	it("opens a permitted resume deep link without mutating", () => {
		search = new URLSearchParams("fromProjectId=project-2&action=resume");
		render(<SeriesPage />);

		expect(screen.getByRole("dialog")).toHaveTextContent("Resume recurring series?");
		expect(lifecycle).not.toHaveBeenCalled();
		fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("does not offer resume for active series or viewers", () => {
		seriesState = "active";
		const view = render(<SeriesPage />);
		expect(screen.queryByRole("button", { name: "Resume series" })).not.toBeInTheDocument();

		view.unmount();
		seriesState = "ended";
		canManage = false;
		search = new URLSearchParams("action=resume");
		render(<SeriesPage />);
		expect(screen.queryByRole("button", { name: "Resume series" })).not.toBeInTheDocument();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
