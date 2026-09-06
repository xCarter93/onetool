// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setup: null as
    | null
    | undefined
    | {
        canCopy: boolean;
      },
  allRecords: true,
  modify: true,
  queryHook: vi.fn(),
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
  api: { projectSeriesQuotes: { getSetup: "getSetup" } },
}));
vi.mock("convex/react", () => ({
  useQuery: (fn: string, args: unknown) => {
    mocks.queryHook(fn, args);
    return mocks.setup;
  },
}));
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (_entity: string, level?: string) =>
      level !== "modify" || mocks.modify,
    hasAllRecords: () => mocks.allRecords,
  }),
}));
vi.mock("./recurring-quote-copy-dialog", () => ({
  RecurringQuoteCopyDialog: ({
    children,
  }: {
    children: (open: () => void) => React.ReactNode;
  }) => <>{children(() => {})}</>,
}));

import { RecurringQuoteCopyGate } from "./recurring-quote-copy-gate";

function renderGate() {
  return render(
    <RecurringQuoteCopyGate
      quoteId={"quote-1" as never}
      quoteTitle="Seasonal service"
      projectId={"project-1" as never}
    >
      {({ onCopyToFuture, copyToFutureDisabled }) =>
        onCopyToFuture ? (
          <button disabled={copyToFutureDisabled}>
            Copy to future projects
          </button>
        ) : (
          <span>No copy action</span>
        )
      }
    </RecurringQuoteCopyGate>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setup = { canCopy: true };
  mocks.allRecords = true;
  mocks.modify = true;
});

describe("recurring quote copy gate", () => {
  it("hides the action for a non-recurring project", () => {
    mocks.setup = null;
    renderGate();
    expect(screen.getByText("No copy action")).toBeVisible();
  });

  it("skips setup and hides the action without organization-wide access", () => {
    mocks.allRecords = false;
    renderGate();
    expect(mocks.queryHook).toHaveBeenCalledWith("getSetup", "skip");
    expect(screen.getByText("No copy action")).toBeVisible();
  });

  it("shows the action for a recurring quote", () => {
    renderGate();
    expect(
      screen.getByRole("button", { name: "Copy to future projects" }),
    ).toBeEnabled();
  });
});
