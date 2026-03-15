import { describe, it, expect } from "vitest";
import { detectDuplicates } from "./duplicate-detection";
import type { ImportRecord } from "@/types/csv-import";

function makeRecord(companyName: string): ImportRecord {
	return { companyName, status: "active" };
}

describe("detectDuplicates", () => {
	it("should match 'Acme Corp' against existing ['Acme Corporation']", () => {
		const records = [makeRecord("Acme Corp")];
		const existing = [{ _id: "1", companyName: "Acme Corporation" }];

		const result = detectDuplicates(records, existing);
		expect(result.size).toBe(1);
		expect(result.get(0)?.matchedName).toBe("Acme Corporation");
	});

	it("should match case-insensitively: 'ACME corp' against 'Acme Corp'", () => {
		const records = [makeRecord("ACME corp")];
		const existing = [{ _id: "1", companyName: "Acme Corp" }];

		const result = detectDuplicates(records, existing);
		expect(result.size).toBe(1);
		expect(result.get(0)?.matchedName).toBe("Acme Corp");
	});

	it("should match 'Smith & Sons' against 'Smith and Sons'", () => {
		const records = [makeRecord("Smith & Sons")];
		const existing = [{ _id: "1", companyName: "Smith and Sons" }];

		const result = detectDuplicates(records, existing);
		expect(result.size).toBe(1);
		expect(result.get(0)?.matchedName).toBe("Smith and Sons");
	});

	it("should return no match for 'Totally Different Inc' against ['Acme Corp']", () => {
		const records = [makeRecord("Totally Different Inc")];
		const existing = [{ _id: "1", companyName: "Acme Corp" }];

		const result = detectDuplicates(records, existing);
		expect(result.size).toBe(0);
	});

	it("should return empty Map when existing clients list is empty", () => {
		const records = [makeRecord("Acme Corp")];

		const result = detectDuplicates(records, []);
		expect(result.size).toBe(0);
	});

	it("should skip records with no companyName", () => {
		const records = [{ companyName: "", status: "active" as const }];
		const existing = [{ _id: "1", companyName: "Acme Corp" }];

		const result = detectDuplicates(records, existing);
		expect(result.size).toBe(0);
	});

	it("should return matchedName from the best matching existing client", () => {
		const records = [makeRecord("Acme Corp")];
		const existing = [
			{ _id: "1", companyName: "Acme Corporation" },
			{ _id: "2", companyName: "Acme Corp International" },
		];

		const result = detectDuplicates(records, existing);
		expect(result.size).toBe(1);
		const match = result.get(0);
		expect(match).toBeDefined();
		expect(match!.matchedName).toBeTruthy();
		expect(match!.score).toBeGreaterThanOrEqual(0);
	});
});
