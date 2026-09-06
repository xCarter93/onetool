// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	clients: undefined as undefined | Array<{ _id: string; companyName: string }>,
	projects: undefined as undefined | Array<{ _id: string; title: string }>,
	users: [] as Array<{ _id: string; email: string }>,
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
	api: {
		clients: { listNamesForOrg: "clients.listNamesForOrg" },
		projects: { list: "projects.list" },
		users: { listByOrg: "users.listByOrg" },
		tasks: { update: "tasks.update", complete: "tasks.complete", remove: "tasks.remove" },
	},
}));

vi.mock("convex-helpers/react/cache/hooks", () => ({
	useQuery: (query: string) => {
		if (query === "clients.listNamesForOrg") return mocks.clients;
		if (query === "projects.list") return mocks.projects;
		return mocks.users;
	},
}));

vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({ can: () => true }),
}));
vi.mock("@/components/shared/task-sheet", () => ({ TaskSheet: () => null }));
vi.mock("@/components/ui/delete-confirmation-modal", () => ({ default: () => null }));

import { RecordTasksTab } from "./record-tasks-tab";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("RecordTasksTab", () => {
	it("renders UTC-midnight task dates without shifting them to the prior local day", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
		const formatDate = Date.prototype.toLocaleDateString;
		vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (locales, options) {
			return formatDate.call(this, locales, { timeZone: "America/New_York", ...options });
		});
		const task = {
			_id: "task-date",
			_creationTime: 1,
			title: "Sunday visit",
			description: "",
			date: Date.UTC(2026, 8, 13),
			status: "pending",
		} as never;

		render(
			<RecordTasksTab tasks={[task]} onAddTask={vi.fn()} entityType="project" />
		);

		expect(screen.getByText("Sun, Sep 13")).toBeVisible();
	});

	it("refreshes table cells when related queries and copy actions become available", () => {
		const task = {
			_id: "task-1",
			_creationTime: 1,
			title: "Inspect service area",
			description: "",
			date: Date.now() + 86_400_000,
			status: "pending",
			clientId: "client-1",
			projectId: "project-1",
		} as never;
		const onCopy = vi.fn();
		const props = { tasks: [task], onAddTask: vi.fn(), entityType: "project" as const };
		const { rerender } = render(<RecordTasksTab {...props} />);

		expect(screen.getByText("—")).toBeVisible();
		expect(screen.queryByRole("button", { name: /Copy Inspect service area/ })).not.toBeInTheDocument();

		mocks.clients = [{ _id: "client-1", companyName: "QA Client" }];
		rerender(
			<RecordTasksTab {...props} onCopyToFuture={onCopy} canCopyToFuture />
		);

		expect(screen.getByText("QA Client")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: /Copy Inspect service area/ }));
		expect(onCopy).toHaveBeenCalledWith(task);
	});
});
