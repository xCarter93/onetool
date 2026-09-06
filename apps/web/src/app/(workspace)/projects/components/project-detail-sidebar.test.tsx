// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({ can: () => true, isLoading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("./recurrence/project-edit-scope", () => ({
	useProjectEditScope: () => ({ save: vi.fn(), isSaving: false }),
}));
vi.mock("./recurrence/project-control", () => ({ RecurrenceProjectControl: () => null }));
vi.mock("./recurrence/status-recovery", () => ({
	RecurrenceStatusRecovery: () => <a href="/projects/series/test?action=resume">Resume series</a>,
}));
vi.mock("./project-documents-section", () => ({ ProjectDocumentsSection: () => null }));
import { ProjectDetailSidebar } from "./project-detail-sidebar";

const project = {
	_id: "project-1", title: "Weekly service", status: "cancelled", projectType: "recurring",
	recurringSeriesId: "series-1", recurringState: "ended",
} as Doc<"projects">;
const props = { projectId: project._id, client: null, primaryContact: null, properties: [], quotes: [], invoices: [] };
afterEach(cleanup);

describe("project sidebar cancelled status", () => {
	it("replaces the blocked status editor with series recovery", () => {
		render(<ProjectDetailSidebar {...props} project={project} />);
		fireEvent.click(screen.getByText("Status"));
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Resume series" })).toBeVisible();
	});

	it("keeps ordinary status editing for individually cancelled projects", () => {
		render(<ProjectDetailSidebar {...props} project={{ ...project, recurringState: undefined }} />);
		fireEvent.click(screen.getByText("Status"));
		expect(screen.getByRole("combobox")).toBeVisible();
		expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
		expect(screen.queryByRole("link", { name: "Resume series" })).not.toBeInTheDocument();
	});
});
