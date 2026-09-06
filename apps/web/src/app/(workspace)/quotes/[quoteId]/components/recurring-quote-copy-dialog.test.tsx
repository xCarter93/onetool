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
  query: vi.fn(),
  copy: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
  api: {
    projectSeriesQuotes: {
      previewCopy: "previewCopy",
      copy: "copy",
    },
  },
}));
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: mocks.query }),
  useMutation: () => mocks.copy,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: mocks.success }),
}));

import { RecurringQuoteCopyDialog } from "./recurring-quote-copy-dialog";

function DialogFixture({ canCopy = true }: { canCopy?: boolean }) {
  return (
    <RecurringQuoteCopyDialog
      quoteId={"quote-1" as never}
      quoteTitle="Seasonal service"
      canCopy={canCopy}
    >
      {(open) => <button onClick={open}>Copy to future projects</button>}
    </RecurringQuoteCopyDialog>
  );
}

function renderDialog() {
  return render(<DialogFixture />);
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({
    revision: 7,
    createCount: 2,
    updateCount: 1,
    preservedCount: 3,
  });
  mocks.copy.mockResolvedValue({
    revision: 8,
    createCount: 2,
    updateCount: 1,
    preservedCount: 3,
  });
});

describe("recurring quote copy dialog", () => {
  it("previews protected counts and copies against the preview revision", async () => {
    renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy to future projects" }),
    );

    expect(await screen.findByText("Draft quotes to create: 2")).toBeVisible();
    expect(
      screen.getByText("Existing draft copies to update: 1"),
    ).toBeVisible();
    expect(screen.getByText("Visits left unchanged: 3")).toBeVisible();
    expect(screen.getByText(/Every copy stays a draft/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy drafts" }));
    await waitFor(() =>
      expect(mocks.copy).toHaveBeenCalledWith({
        quoteId: "quote-1",
        expectedRevision: 7,
      }),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Future quote setup saved",
      "Created: 2. Updated: 1. Preserved: 3.",
    );
  });

  it("recovers from a stale mutation by loading a new preview", async () => {
    mocks.copy.mockRejectedValueOnce(
      new Error("Preview is stale; review the changes again"),
    );
    renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy to future projects" }),
    );
    await screen.findByText("Draft quotes to create: 2");
    fireEvent.click(screen.getByRole("button", { name: "Copy drafts" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview is stale",
    );
    expect(screen.getByRole("button", { name: "Copy drafts" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review changes again" }),
    );
    expect(await screen.findByText("Draft quotes to create: 2")).toBeVisible();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("keeps the dialog open and prevents duplicate submissions while copying", async () => {
    let finishCopy!: (value: object) => void;
    mocks.copy.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCopy = resolve;
      }),
    );
    renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy to future projects" }),
    );
    await screen.findByText("Draft quotes to create: 2");
    fireEvent.click(screen.getByRole("button", { name: "Copy drafts" }));

    expect(screen.getByRole("button", { name: "Copy drafts" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy drafts" }));
    expect(mocks.copy).toHaveBeenCalledTimes(1);

    finishCopy({
      revision: 8,
      createCount: 2,
      updateCount: 1,
      preservedCount: 3,
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("disables confirmation if copying becomes unavailable after preview", async () => {
    const view = renderDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy to future projects" }),
    );
    await screen.findByText("Draft quotes to create: 2");
    view.rerender(<DialogFixture canCopy={false} />);

    expect(screen.getByRole("button", { name: "Copy drafts" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy drafts" }));
    expect(mocks.copy).not.toHaveBeenCalled();
  });
});
