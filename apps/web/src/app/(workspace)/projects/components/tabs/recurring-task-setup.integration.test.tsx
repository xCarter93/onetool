// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setup: undefined as undefined | {
		seriesId: string;
		state: "active";
		canCopy: boolean;
		canRemove: boolean;
		templates: never[];
	},
	clients: undefined as undefined | Array<{ _id: string; companyName: string }>,
	preview: vi.fn(async () => ({ revision: 3, createCount: 1, updateCount: 0, removeCount: 0, preservedCount: 0 })),
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
	api: {
		projectSeriesTasks: { getSetup: "getSetup", previewCopy: "previewCopy", copy: "copy", remove: "remove" },
		clients: { listNamesForOrg: "clients" },
		projects: { list: "projects" },
		users: { listByOrg: "users" },
		tasks: { update: "update", complete: "complete", remove: "removeTask" },
	},
}));
vi.mock("convex/react", () => ({
	useQuery: () => mocks.setup,
	useMutation: () => vi.fn(),
	useConvex: () => ({ query: mocks.preview }),
}));
vi.mock("convex-helpers/react/cache/hooks", () => ({
	useQuery: (query: string) => query === "clients" ? mocks.clients : [],
}));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({ can: () => true, hasAllRecords: () => true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("@/components/shared/task-sheet", () => ({ TaskSheet: () => null }));
vi.mock("@/components/ui/delete-confirmation-modal", () => ({ default: () => null }));

import { RecurringTaskSetup } from "./recurring-task-setup";

afterEach(cleanup);

describe("RecurringTaskSetup with RecordTasksTab", () => {
	it("reveals the copy action after the setup subscription resolves", async () => {
		const task = {
			_id: "task-1",
			_creationTime: 1,
			title: "QA Inspect service area",
			description: "",
			date: Date.now() + 86_400_000,
			status: "pending",
			clientId: "client-1",
			projectId: "project-1",
		} as never;
		const props = { projectId: "project-1" as never, recurring: true, tasks: [task], onAddTask: vi.fn() };
		const { rerender } = render(<RecurringTaskSetup {...props} />);

		expect(screen.queryByRole("button", { name: /Copy QA Inspect/ })).not.toBeInTheDocument();

		mocks.setup = { seriesId: "series-1", state: "active", canCopy: true, canRemove: true, templates: [] };
		mocks.clients = [{ _id: "client-1", companyName: "QA Client" }];
		rerender(<RecurringTaskSetup {...props} />);

		expect(screen.getByText("QA Client")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: /Copy QA Inspect/ }));
		expect(await screen.findByText("Tasks created: 1")).toBeVisible();
	});
});
