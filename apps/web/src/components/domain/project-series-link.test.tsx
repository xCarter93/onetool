// @vitest-environment jsdom
import * as React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";

const permissions = { can: () => true, hasAllRecords: () => true };
const fetched = vi.fn();
vi.mock("convex/react", () => ({ useQuery: () => fetched() }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => permissions }));

import { ProjectSeriesLink } from "./project-series-link";

const project = {
	_id: "project-1" as Id<"projects">,
	recurringSeriesId: "series-1" as Id<"projectSeries">,
} as Doc<"projects">;

afterEach(() => {
	cleanup();
	permissions.hasAllRecords = () => true;
});

describe("ProjectSeriesLink", () => {
	it("links to the series and carries the project back", () => {
		render(<ProjectSeriesLink project={project} />);
		expect(screen.getByRole("link", { name: "View series" })).toHaveAttribute(
			"href",
			"/projects/series/series-1?fromProjectId=project-1",
		);
	});

	it("renders nothing for a one-off project", () => {
		const { container } = render(
			<ProjectSeriesLink project={{ ...project, recurringSeriesId: undefined }} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing without all-records project access", () => {
		permissions.hasAllRecords = () => false;
		const { container } = render(<ProjectSeriesLink project={project} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("loads the project when only an id is given", () => {
		fetched.mockReturnValue(project);
		render(<ProjectSeriesLink projectId={project._id} />);
		expect(screen.getByRole("link", { name: "View series" })).toBeVisible();
	});
});
