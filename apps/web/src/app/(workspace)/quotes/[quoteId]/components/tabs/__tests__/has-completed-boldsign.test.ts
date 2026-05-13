import { describe, it, expect } from "vitest";
import { hasCompletedBoldsign } from "../has-completed-boldsign";

describe("hasCompletedBoldsign (Plan 14.1-02)", () => {
	it("returns false for null input", () => {
		expect(hasCompletedBoldsign(null)).toBe(false);
	});

	it("returns false for undefined input", () => {
		expect(hasCompletedBoldsign(undefined)).toBe(false);
	});

	it("returns false for empty array", () => {
		expect(hasCompletedBoldsign([])).toBe(false);
	});

	it("returns true for canonical 'Completed' status", () => {
		expect(
			hasCompletedBoldsign([{ boldsign: { status: "Completed" } }]),
		).toBe(true);
	});

	it("returns true for lowercase 'completed' (case-insensitive, first-match wins)", () => {
		expect(
			hasCompletedBoldsign([
				{ boldsign: { status: "completed" } },
				{ boldsign: { status: "Sent" } },
			]),
		).toBe(true);
	});

	it("returns false when no entry is completed (null status, partial-signed, missing boldsign)", () => {
		expect(
			hasCompletedBoldsign([
				{ boldsign: null },
				{ boldsign: { status: null } },
				{ boldsign: { status: "Sent" } },
				{ boldsign: { status: "InProgress" } },
			]),
		).toBe(false);
	});

	it("returns false for malformed entries (null, undefined, {})", () => {
		expect(
			hasCompletedBoldsign([
				null,
				undefined,
				{} as { boldsign?: never },
			]),
		).toBe(false);
	});
});
