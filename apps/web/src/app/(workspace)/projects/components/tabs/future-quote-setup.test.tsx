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

const mocks = vi.hoisted(() => ({
  setup: null as
    | null
    | undefined
    | {
        seriesId: string;
        state: "active" | "paused" | "ended";
        revision: number;
        canCopy: boolean;
        canStop: boolean;
        templates: Array<{
          _id: string;
          sourceQuoteId: string;
          title?: string;
          active: boolean;
          sourceAvailable: boolean;
          version: number;
        }>;
      },
  allRecords: true,
  modify: true,
  queryHook: vi.fn(),
  stop: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
  api: {
    projectSeriesQuotes: {
      getSetup: "getSetup",
      stop: "stop",
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (fn: string, args: unknown) => {
    mocks.queryHook(fn, args);
    return mocks.setup;
  },
  useMutation: () => mocks.stop,
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (_entity: string, level?: string) =>
      level !== "modify" || mocks.modify,
    hasAllRecords: () => mocks.allRecords,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: mocks.success }),
}));

import { FutureQuoteSetup } from "./future-quote-setup";

function setup(overrides = {}) {
  return {
    seriesId: "series-1",
    state: "active" as const,
    revision: 9,
    canCopy: true,
    canStop: true,
    templates: [
      {
        _id: "template-1",
        sourceQuoteId: "quote-1",
        title: "Seasonal service",
        active: true,
        sourceAvailable: true,
        version: 2,
      },
    ],
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setup = setup();
  mocks.allRecords = true;
  mocks.modify = true;
  mocks.stop.mockResolvedValue({
    revision: 10,
    createCount: 0,
    updateCount: 0,
    preservedCount: 0,
  });
});

describe("future quote setup", () => {
  it("hides setup for a non-recurring project", () => {
    mocks.setup = null;
    render(<FutureQuoteSetup projectId={"project-1" as never} />);
    expect(screen.queryByText("Future quote setup")).not.toBeInTheDocument();
  });

  it("skips setup access without organization-wide permissions", () => {
    mocks.allRecords = false;
    render(<FutureQuoteSetup projectId={"project-1" as never} />);
    expect(mocks.queryHook).toHaveBeenCalledWith("getSetup", "skip");
    expect(screen.queryByText("Future quote setup")).not.toBeInTheDocument();
  });

  it("stops future generation at the current revision and preserves existing copies", async () => {
    mocks.setup = setup({
      state: "ended",
      templates: [
        {
          _id: "template-1",
          sourceQuoteId: "deleted-quote",
          title: "Seasonal service",
          active: true,
          sourceAvailable: false,
          version: 2,
        },
      ],
    });
    render(<FutureQuoteSetup projectId={"project-1" as never} />);

    expect(screen.getByText("Source quote deleted")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Stop copying Seasonal service to future projects",
      }),
    );
    expect(
      screen.getByText(/Existing quote copies stay unchanged\./),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stop copying" }));

    await waitFor(() =>
      expect(mocks.stop).toHaveBeenCalledWith({
        templateId: "template-1",
        expectedRevision: 9,
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Future quote setup stopped",
      "Existing quote copies remain unchanged.",
    );
  });

  it("keeps a stale stop recoverable and retries with the latest revision", async () => {
    mocks.stop.mockRejectedValueOnce(
      new Error("Preview is stale; review the changes again"),
    );
    const view = render(<FutureQuoteSetup projectId={"project-1" as never} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Stop copying Seasonal service to future projects",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop copying" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview is stale",
    );

    mocks.setup = setup({ revision: 10 });
    view.rerender(<FutureQuoteSetup projectId={"project-1" as never} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review latest changes" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop copying" }));
    await waitFor(() =>
      expect(mocks.stop).toHaveBeenLastCalledWith({
        templateId: "template-1",
        expectedRevision: 10,
      }),
    );
  });
});
