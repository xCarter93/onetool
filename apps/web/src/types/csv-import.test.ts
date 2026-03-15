import { describe, it, expect } from "vitest";
import type {
	ImportResultItem,
	ImportResult,
	CsvImportState,
} from "./csv-import";

describe("csv-import types", () => {
	it("ImportResultItem supports skipped field", () => {
		const item: ImportResultItem = {
			success: false,
			rowIndex: 0,
			skipped: true,
		};
		expect(item.skipped).toBe(true);
	});

	it("ImportResult supports skippedCount field", () => {
		const result: ImportResult = {
			successCount: 2,
			failureCount: 1,
			skippedCount: 3,
			items: [],
		};
		expect(result.skippedCount).toBe(3);
	});

	it("CsvImportState supports importProgress field", () => {
		const state: CsvImportState = {
			file: null,
			fileContent: null,
			entityType: "clients",
			isAnalyzing: false,
			analysisResult: null,
			importProgress: {
				current: 1,
				total: 5,
				succeeded: 1,
				failed: 0,
			},
		};
		expect(state.importProgress?.current).toBe(1);
		expect(state.importProgress?.total).toBe(5);
	});
});
