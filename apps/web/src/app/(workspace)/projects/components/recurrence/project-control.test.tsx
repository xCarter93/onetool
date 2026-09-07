// @vitest-environment jsdom
import * as React from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";

const { enroll } = vi.hoisted(() => ({ enroll: vi.fn() }));

vi.mock("convex/react", () => ({
	useMutation: () => enroll,
	useQuery: () => ({
		series: {
			state: "active",
			rule: { frequency: "weekly", interval: 1, weekdays: [1, 5] },
		},
	}),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({
		can: () => true,
		hasAllRecords: () => true,
	}),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("./schedule-form", () => ({
	RecurrenceScheduleForm: ({
		onSubmit,
	}: {
		onSubmit: (rule: unknown, durationOffset: number) => Promise<void>;
	}) => (
		<button
			type="button"
			data-testid="recurrence-editor"
			onClick={() =>
				void onSubmit({ frequency: "weekly", interval: 1, weekdays: [1] }, 2)
			}
		/>
	),
}));

import { RecurrenceProjectControl } from "./project-control";

afterEach(cleanup);

beforeEach(() => {
	enroll.mockReset();
	enroll.mockResolvedValue("series-1");
});

describe("RecurrenceProjectControl", () => {
	it("removes setup when a project changes back to one-off and clears the open editor", () => {
		const project = { _id: "project-1" as Id<"projects">, title: "Garden service", startDate: Date.UTC(2026, 8, 6), projectType: "one-off" as const };
		const { rerender } = render(<RecurrenceProjectControl project={project} />);
		expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Set up recurrence" })).not.toBeInTheDocument();
		rerender(<RecurrenceProjectControl project={{ ...project, projectType: "recurring" }} />);
		fireEvent.click(screen.getByRole("button", { name: "Set up recurrence" }));
		expect(screen.getByTestId("recurrence-editor")).toBeInTheDocument();
		rerender(<RecurrenceProjectControl project={project} />);
		expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
		expect(screen.queryByTestId("recurrence-editor")).not.toBeInTheDocument();
		rerender(<RecurrenceProjectControl project={{ ...project, projectType: "recurring" }} />);
		expect(screen.getByRole("button", { name: "Set up recurrence" })).toBeVisible();
		expect(screen.queryByTestId("recurrence-editor")).not.toBeInTheDocument();
	});

	it("summarizes the series and preserves the current project in its link", () => {
		const projectId = "project-1" as Id<"projects">;
		const seriesId = "series-1" as Id<"projectSeries">;

		render(
			<RecurrenceProjectControl
				project={
					{
						_id: projectId,
						title: "Friday service",
						projectType: "recurring",
						recurringSeriesId: seriesId,
					} as Pick<Doc<"projects">, "_id" | "title" | "projectType"> & {
						recurringSeriesId: Id<"projectSeries">;
					}
				}
			/>
		);

		expect(
			screen.getByText("Every week on Mon, Fri. Never ends.")
		).toBeVisible();
		expect(screen.getByText("Active")).toBeVisible();
		expect(screen.getByRole("link", { name: "View series" })).toHaveAttribute(
			"href",
			`/projects/series/${seriesId}?fromProjectId=${projectId}`
		);
	});

	it("enrolls the project with the schedule and its visit duration", async () => {
		const project = {
			_id: "project-1" as Id<"projects">,
			title: "Garden service",
			startDate: Date.UTC(2026, 8, 6),
			projectType: "recurring" as const,
		};
		render(<RecurrenceProjectControl project={project} />);

		fireEvent.click(screen.getByRole("button", { name: "Set up recurrence" }));
		fireEvent.click(screen.getByTestId("recurrence-editor"));

		await waitFor(() =>
			expect(enroll).toHaveBeenCalledWith({
				projectId: project._id,
				rule: { frequency: "weekly", interval: 1, weekdays: [1] },
				durationDays: 2,
			})
		);
	});
});
