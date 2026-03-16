import { describe, it, expect } from "vitest";
import {
	getConfidenceState,
	detectTypeMismatches,
	type ConfidenceState,
} from "./mapping-utils";

describe("getConfidenceState", () => {
	it('returns "high" when confidence >= 0.7 and not manual/skipped', () => {
		const result = getConfidenceState(
			{ schemaField: "companyName", confidence: 0.85 },
			false
		);
		expect(result).toBe("high");
	});

	it('returns "high" at exactly 0.7 threshold', () => {
		const result = getConfidenceState(
			{ schemaField: "companyName", confidence: 0.7 },
			false
		);
		expect(result).toBe("high");
	});

	it('returns "low" when confidence < 0.7 and not manual/skipped', () => {
		const result = getConfidenceState(
			{ schemaField: "companyName", confidence: 0.5 },
			false
		);
		expect(result).toBe("low");
	});

	it('returns "manual" when isManuallyOverridden is true', () => {
		const result = getConfidenceState(
			{ schemaField: "companyName", confidence: 0.3 },
			true
		);
		expect(result).toBe("manual");
	});

	it('returns "manual" even with high confidence when manually overridden', () => {
		const result = getConfidenceState(
			{ schemaField: "companyName", confidence: 0.9 },
			true
		);
		expect(result).toBe("manual");
	});

	it('returns "skipped" when schemaField is "__skip__"', () => {
		const result = getConfidenceState(
			{ schemaField: "__skip__", confidence: 0.9 },
			false
		);
		expect(result).toBe("skipped");
	});

	it('returns "skipped" over "manual" when schemaField is "__skip__"', () => {
		const result = getConfidenceState(
			{ schemaField: "__skip__", confidence: 0.9 },
			true
		);
		expect(result).toBe("skipped");
	});
});

describe("detectTypeMismatches", () => {
	it("returns mismatch for invalid enum value", () => {
		const result = detectTypeMismatches(["invalid-value", "active"], {
			type: "enum",
			options: ["lead", "active", "inactive", "archived"],
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toContain("invalid-value");
	});

	it("returns mismatch for non-numeric value in number field", () => {
		const result = detectTypeMismatches(["abc", "123"], {
			type: "number",
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toContain("abc");
	});

	it("returns empty array for valid enum values", () => {
		const result = detectTypeMismatches(["active", "lead"], {
			type: "enum",
			options: ["lead", "active", "inactive", "archived"],
		});
		expect(result).toHaveLength(0);
	});

	it("returns empty array for valid number values", () => {
		const result = detectTypeMismatches(["123", "45.6"], {
			type: "number",
		});
		expect(result).toHaveLength(0);
	});

	it("returns empty array for string fields (no validation needed)", () => {
		const result = detectTypeMismatches(["anything goes"], {
			type: "string",
		});
		expect(result).toHaveLength(0);
	});

	it("deduplicates identical mismatch messages", () => {
		const result = detectTypeMismatches(
			["bad-val", "bad-val", "active"],
			{
				type: "enum",
				options: ["lead", "active", "inactive", "archived"],
			}
		);
		expect(result).toHaveLength(1);
	});

	it("skips empty string values", () => {
		const result = detectTypeMismatches(["", "active"], {
			type: "enum",
			options: ["lead", "active", "inactive", "archived"],
		});
		expect(result).toHaveLength(0);
	});
});
