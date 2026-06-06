// @vitest-environment jsdom
//
// Plan 14-14 — CodeRabbit Finding 2: empty-string error message must render the
// configured fallback, not blank. The pre-fix `??` operator only fires on
// null/undefined, so an empty string passes through and renders an empty alert.
// Post-fix uses `||` (also covers empty string).
//
// Tests pin BOTH the empty-string fallback AND the non-empty server message
// pass-through so neither regression can re-emerge.

import { describe, expect, it, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DeclineModal } from "../decline-modal";

afterEach(cleanup);

describe("DeclineModal error fallback (Finding 2)", () => {
	it("renders fallback when error.message is empty", async () => {
		const onConfirm = vi.fn().mockResolvedValue({
			ok: false,
			error: { code: "EMPTY", message: "" },
		});
		const onOpenChange = vi.fn();

		render(
			<DeclineModal
				open={true}
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
				businessName="Acme"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /^decline quote$/i }));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Failed to decline. Try again.");
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("renders non-empty error message verbatim", async () => {
		const onConfirm = vi.fn().mockResolvedValue({
			ok: false,
			error: { code: "X", message: "Server exploded" },
		});
		const onOpenChange = vi.fn();

		render(
			<DeclineModal
				open={true}
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
				businessName="Acme"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /^decline quote$/i }));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Server exploded");
	});
});
