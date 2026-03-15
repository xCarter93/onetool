import { describe, it, expect } from "vitest";
import { chunkArray, buildCompositeResults } from "./import-batching";
import type { ImportResultItem } from "@/types/csv-import";
import type { ReviewRow } from "./review-types";

describe("chunkArray", () => {
	it("splits array into correctly sized chunks", () => {
		expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("returns empty array for empty input", () => {
		expect(chunkArray([], 10)).toEqual([]);
	});

	it("returns single chunk when array is smaller than size", () => {
		expect(chunkArray([1], 10)).toEqual([[1]]);
	});

	it("returns single chunk when array equals size", () => {
		expect(chunkArray([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
	});
});

function makeReviewRow(
	overrides: Partial<ReviewRow> & { rowIndex: number }
): ReviewRow {
	return {
		record: { companyName: "Test", status: "active" },
		status: "valid",
		errors: [],
		skipImport: false,
		...overrides,
	};
}

describe("buildCompositeResults", () => {
	it("merges backend results with skipped and error rows", () => {
		// 5 rows: index 0 imported (success), index 1 imported (fail),
		// index 2 skipped, index 3 error, index 4 imported (success)
		const reviewRows: ReviewRow[] = [
			makeReviewRow({ rowIndex: 0, status: "valid" }),
			makeReviewRow({ rowIndex: 1, status: "valid" }),
			makeReviewRow({ rowIndex: 2, status: "duplicate", skipImport: true }),
			makeReviewRow({
				rowIndex: 3,
				status: "error",
				errors: [{ rowIndex: 3, field: "companyName", message: "required" }],
			}),
			makeReviewRow({ rowIndex: 4, status: "valid" }),
		];

		// importedIndices maps backendResults order -> reviewRows indices
		const importedIndices = [0, 1, 4];

		const backendResults: ImportResultItem[] = [
			{ success: true, id: "id-0", rowIndex: 0 },
			{ success: false, error: "server error", rowIndex: 1 },
			{ success: true, id: "id-4", rowIndex: 4 },
		];

		const result = buildCompositeResults({
			backendResults,
			reviewRows,
			importedIndices,
		});

		expect(result).toHaveLength(5);

		// Row 0: imported success
		expect(result[0]).toEqual({
			success: true,
			id: "id-0",
			rowIndex: 0,
		});

		// Row 1: imported failure
		expect(result[1]).toEqual({
			success: false,
			error: "server error",
			rowIndex: 1,
		});

		// Row 2: skipped
		expect(result[2]).toEqual({
			success: false,
			skipped: true,
			rowIndex: 2,
		});

		// Row 3: error row
		expect(result[3]).toEqual({
			success: false,
			skipped: false,
			rowIndex: 3,
			error: "companyName: required",
		});

		// Row 4: imported success
		expect(result[4]).toEqual({
			success: true,
			id: "id-4",
			rowIndex: 4,
		});
	});

	it("skipped rows have success=false, skipped=true, no error", () => {
		const reviewRows = [
			makeReviewRow({ rowIndex: 0, status: "duplicate", skipImport: true }),
		];

		const result = buildCompositeResults({
			backendResults: [],
			reviewRows,
			importedIndices: [],
		});

		expect(result[0].success).toBe(false);
		expect(result[0].skipped).toBe(true);
		expect(result[0].error).toBeUndefined();
	});

	it("error rows have success=false, skipped=false, error from validation", () => {
		const reviewRows = [
			makeReviewRow({
				rowIndex: 0,
				status: "error",
				errors: [
					{ rowIndex: 0, field: "email", message: "invalid format" },
					{ rowIndex: 0, field: "phone", message: "too short" },
				],
			}),
		];

		const result = buildCompositeResults({
			backendResults: [],
			reviewRows,
			importedIndices: [],
		});

		expect(result[0].success).toBe(false);
		expect(result[0].skipped).toBe(false);
		expect(result[0].error).toBe("email: invalid format; phone: too short");
	});

	it("preserves backend warnings on imported rows", () => {
		const reviewRows = [makeReviewRow({ rowIndex: 0, status: "valid" })];

		const backendResults: ImportResultItem[] = [
			{
				success: true,
				id: "id-0",
				rowIndex: 0,
				warnings: ["duplicate email"],
			},
		];

		const result = buildCompositeResults({
			backendResults,
			reviewRows,
			importedIndices: [0],
		});

		expect(result[0].warnings).toEqual(["duplicate email"]);
	});

	it("all rows have correct rowIndex matching original position", () => {
		const reviewRows = [
			makeReviewRow({ rowIndex: 5, status: "valid" }),
			makeReviewRow({ rowIndex: 10, status: "duplicate", skipImport: true }),
			makeReviewRow({ rowIndex: 15, status: "valid" }),
		];

		const backendResults: ImportResultItem[] = [
			{ success: true, id: "a", rowIndex: 5 },
			{ success: true, id: "b", rowIndex: 15 },
		];

		const result = buildCompositeResults({
			backendResults,
			reviewRows,
			importedIndices: [0, 2],
		});

		expect(result[0].rowIndex).toBe(5);
		expect(result[1].rowIndex).toBe(10);
		expect(result[2].rowIndex).toBe(15);
	});
});
