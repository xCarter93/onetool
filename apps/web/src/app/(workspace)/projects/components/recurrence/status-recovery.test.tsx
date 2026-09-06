// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
	state: "ended",
	canManage: true,
	allRecords: true,
	restore: vi.fn(),
	success: vi.fn(),
	query: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => {
		mocks.query(...args);
		return { series: { state: mocks.state } };
	},
	useMutation: () => mocks.restore,
}));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({
		can: (_entity: string, level?: string) => level !== "modify" || mocks.canManage,
		hasAllRecords: () => mocks.allRecords,
	}),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: mocks.success }),
}));
import { RecurrenceStatusRecovery } from "./status-recovery";

const project = {
	_id: "project-1", recurringSeriesId: "series-1", recurringState: "ended",
} as Doc<"projects">;

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.state = "ended";
	mocks.canManage = true;
	mocks.allRecords = true;
	mocks.restore.mockResolvedValue(null);
});

describe("recurring visit status recovery", () => {
	it.each(["ended", "paused"])("opens resume preview for a %s series without changing a project status", (state) => {
		mocks.state = state;
		render(<RecurrenceStatusRecovery project={project} />);
		expect(screen.getByRole("link", { name: "Resume series" })).toHaveAttribute(
			"href", "/projects/series/series-1?fromProjectId=project-1&action=resume"
		);
		expect(screen.queryByRole("button", { name: "Restore visit" })).not.toBeInTheDocument();
		expect(mocks.restore).not.toHaveBeenCalled();
	});

	it("restores only the selected visit when the series is active", async () => {
		mocks.state = "active";
		render(<RecurrenceStatusRecovery project={{ ...project, recurringState: "skipped" }} />);
		fireEvent.click(screen.getByRole("button", { name: "Restore visit" }));
		await waitFor(() => expect(mocks.success).toHaveBeenCalled());
		expect(mocks.restore).toHaveBeenCalledExactlyOnceWith({ projectId: "project-1" });
	});

	it("keeps the recovery action available after failure and displays an inline error", async () => {
		mocks.state = "active";
		mocks.restore.mockRejectedValueOnce(new Error("failure"));
		render(<RecurrenceStatusRecovery project={project} />);
		fireEvent.click(screen.getByRole("button", { name: "Restore visit" }));
		expect(await screen.findByRole("alert")).toBeVisible();
		expect(screen.getByRole("button", { name: "Restore visit" })).toBeEnabled();
		expect(mocks.success).not.toHaveBeenCalled();
	});

	it("does not query the series or expose recovery to assigned-only staff", () => {
		mocks.allRecords = false;
		render(<RecurrenceStatusRecovery project={project} />);
		expect(mocks.query).toHaveBeenCalledWith(expect.anything(), "skip");
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByText(/Ask someone who manages/)).toBeVisible();
	});
});
