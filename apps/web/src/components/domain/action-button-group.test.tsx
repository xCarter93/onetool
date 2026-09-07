// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionButtonGroup } from "./action-button-group";

afterEach(cleanup);

describe("ActionButtonGroup", () => {
  it("opens collapsed actions and invokes the selected action", async () => {
    const onSecondary = vi.fn();
    render(
      <ActionButtonGroup
        actions={[
          { key: "primary", label: "Primary", slot: "start", onClick: vi.fn() },
          { key: "secondary", label: "Secondary", onClick: onSecondary },
          { key: "another", label: "Another", onClick: vi.fn() },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Secondary" }));

    expect(onSecondary).toHaveBeenCalledOnce();
  });
});
