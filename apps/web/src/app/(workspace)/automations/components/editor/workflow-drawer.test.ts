import { describe, it, expect } from "vitest";
import { formatVariableToken } from "./workflow-drawer";

describe("formatVariableToken", () => {
	it("wraps text-context copies in double braces (interpolation syntax)", () => {
		expect(formatVariableToken("trigger.record.companyName", "text")).toBe(
			"{{trigger.record.companyName}}"
		);
	});

	it("wraps formula-context copies in single braces (formula grammar)", () => {
		expect(formatVariableToken("trigger.record.companyName", "formula")).toBe(
			"{trigger.record.companyName}"
		);
	});
});
