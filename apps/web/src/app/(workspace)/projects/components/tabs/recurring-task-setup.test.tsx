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
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  setup: null as
    | null
    | undefined
    | {
        seriesId: string;
        state: "active" | "paused" | "ended";
        canCopy: boolean;
        canRemove: boolean;
        templates: Array<{
          _id: string;
          sourceTaskId: string;
          title: string;
          active: boolean;
          sourceAvailable: boolean;
        }>;
      },
  allRecords: true,
  modify: true,
  deleteTasks: true,
  query: vi.fn(),
  copy: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  queryHook: vi.fn(),
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
  api: {
    projectSeriesTasks: {
      getSetup: "getSetup",
      previewCopy: "previewCopy",
      copy: "copy",
      previewRemoval: "previewRemoval",
      remove: "remove",
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (fn: string, args: unknown) => {
    mocks.queryHook(fn, args);
    return mocks.setup;
  },
  useMutation: (fn: string) => (fn === "copy" ? mocks.copy : mocks.remove),
  useConvex: () => ({ query: mocks.query }),
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (entity: string, level?: string) =>
      level === "delete"
        ? entity !== "tasks" || mocks.deleteTasks
        : level === "modify"
          ? mocks.modify
          : true,
    hasAllRecords: () => mocks.allRecords,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: mocks.success }),
}));
vi.mock("@/components/shared/record-tasks-tab", () => ({
  RecordTasksTab: ({
    tasks,
    headerContent,
    onCopyToFuture,
  }: {
    tasks: Array<{ _id: string; title: string }>;
    headerContent?: React.ReactNode;
    onCopyToFuture?: (task: { _id: string; title: string }) => void;
  }) => (
    <div>
      {headerContent}
      {tasks.map((task) => (
        <div key={task._id}>
          <span>{task.title}</span>
          {onCopyToFuture && (
            <button onClick={() => onCopyToFuture(task)}>
              Copy {task.title}
            </button>
          )}
        </div>
      ))}
    </div>
  ),
}));

import { RecurringTaskSetup } from "./recurring-task-setup";

const task = {
  _id: "task-1",
  title: "Clean lobby",
  date: Date.UTC(2026, 8, 6),
  status: "pending",
} as Doc<"tasks">;

function recurringSetup(overrides = {}) {
  return {
    seriesId: "series-1",
    state: "active" as const,
    canCopy: true,
    canRemove: true,
    templates: [],
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setup = recurringSetup();
  mocks.allRecords = true;
  mocks.modify = true;
  mocks.deleteTasks = true;
  mocks.query.mockResolvedValue({
    revision: 7,
    createCount: 2,
    updateCount: 1,
    removeCount: 0,
    preservedCount: 3,
  });
  mocks.copy.mockResolvedValue({});
  mocks.remove.mockResolvedValue({});
});

describe("recurring task setup", () => {
  it("hides propagation on a non-recurring project", () => {
    mocks.setup = null;
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring
        tasks={[task]}
        onAddTask={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Copy Clean lobby/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Future task setup")).not.toBeInTheDocument();
  });

  it("skips the setup query on a one-off project", () => {
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring={false}
        tasks={[task]}
        onAddTask={() => {}}
      />,
    );
    expect(mocks.queryHook).toHaveBeenCalledWith("getSetup", "skip");
    expect(
      screen.queryByRole("button", { name: /Copy Clean lobby/ }),
    ).not.toBeInTheDocument();
  });

  it("skips setup access and hides controls without organization-wide access", () => {
    mocks.allRecords = false;
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring
        tasks={[task]}
        onAddTask={() => {}}
      />,
    );
    expect(mocks.queryHook).toHaveBeenCalledWith("getSetup", "skip");
    expect(
      screen.queryByRole("button", { name: /Copy Clean lobby/ }),
    ).not.toBeInTheDocument();
  });

  it("previews counts and confirms against the preview revision", async () => {
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring
        tasks={[task]}
        onAddTask={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Clean lobby" }));
    expect(await screen.findByText("Tasks created: 2")).toBeVisible();
    expect(screen.getByText("Untouched tasks updated: 1")).toBeVisible();
    expect(screen.getByText("Protected tasks preserved: 3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy task" }));
    await waitFor(() =>
      expect(mocks.copy).toHaveBeenCalledWith({
        taskId: "task-1",
        expectedRevision: 7,
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Task copied",
      "The task was saved for future projects and added to eligible planned ones.",
    );
  });

  it("keeps a failed mutation recoverable without showing false success", async () => {
    mocks.copy.mockRejectedValueOnce(new Error("Preview is stale"));
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring
        tasks={[task]}
        onAddTask={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Clean lobby" }));
    await screen.findByText("Tasks created: 2");
    fireEvent.click(screen.getByRole("button", { name: "Copy task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview is stale",
    );
    expect(
      screen.getByRole("button", { name: "Review latest changes" }),
    ).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("keeps the current confirmation open while copying and prevents a duplicate submission", async () => {
    let finishCopy!: (value: object) => void;
    mocks.copy.mockReturnValueOnce(new Promise((resolve) => { finishCopy = resolve; }));
    render(
      <RecurringTaskSetup projectId={"project-1" as never} recurring tasks={[task]} onAddTask={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Clean lobby" }));
    await screen.findByText("Tasks created: 2");
    fireEvent.click(screen.getByRole("button", { name: "Copy task" }));
    expect(screen.getByRole("button", { name: "Copy task" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy task" }));
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    finishCopy({});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("disables confirmation if the series is paused after its preview loads", async () => {
    const props = { projectId: "project-1" as never, recurring: true, tasks: [task], onAddTask: () => {} };
    const { rerender } = render(<RecurringTaskSetup {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Clean lobby" }));
    await screen.findByText("Tasks created: 2");
    mocks.setup = recurringSetup({ state: "paused", canCopy: false });
    rerender(<RecurringTaskSetup {...props} />);
    expect(screen.getByRole("button", { name: "Copy task" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy task" }));
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("recovers from a preview error before enabling confirmation", async () => {
    mocks.query.mockRejectedValueOnce(new Error("Preview unavailable"));
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring
        tasks={[task]}
        onAddTask={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Clean lobby" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview unavailable",
    );
    expect(screen.getByRole("button", { name: "Copy task" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review latest changes" }),
    );
    expect(await screen.findByText("Tasks created: 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy task" })).toBeEnabled();
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it("keeps orphaned templates removable and uses the removal preview revision", async () => {
    mocks.setup = recurringSetup({
      templates: [
        {
          _id: "template-1",
          sourceTaskId: "deleted-task",
          title: "Lock up",
          active: true,
          sourceAvailable: false,
        },
      ],
    });
    mocks.query.mockResolvedValueOnce({
      revision: 11,
      createCount: 0,
      updateCount: 0,
      removeCount: 2,
      preservedCount: 1,
    });
    render(
      <RecurringTaskSetup
        projectId={"project-1" as never}
        recurring
        tasks={[]}
        onAddTask={() => {}}
      />,
    );
    expect(screen.getByText("Source task deleted")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lock up from future projects",
      }),
    );
    expect(await screen.findByText("Untouched tasks removed: 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove task setup" }));
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({
        templateId: "template-1",
        expectedRevision: 11,
      }),
    );
  });
});
