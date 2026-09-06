// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";

vi.mock("convex/react", () => ({
	useMutation: () => vi.fn(),
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

import { RecurrenceProjectControl } from "./project-control";

afterEach(cleanup);

describe("RecurrenceProjectControl", () => {
	it("summarizes the series and preserves the current project in its link", () => {
		const projectId = "project-1" as Id<"projects">;
		const seriesId = "series-1" as Id<"projectSeries">;

		render(
			<RecurrenceProjectControl
				project={
					{
						_id: projectId,
						title: "Friday service",
						recurringSeriesId: seriesId,
					} as Pick<Doc<"projects">, "_id" | "title"> & {
						recurringSeriesId: Id<"projectSeries">;
					}
				}
			/>
		);

		expect(screen.getByText("weekly on Mon, Fri")).toBeVisible();
		expect(screen.getByText("active")).toBeVisible();
		expect(screen.getByRole("link", { name: "View series" })).toHaveAttribute(
			"href",
			`/projects/series/${seriesId}?fromProjectId=${projectId}`
		);
	});
});
