import { describe, it, expect, vi } from "vitest";
import { ConvexError } from "convex/values";
import {
	chunkArray,
	buildCompositeResults,
	runImportBatches,
	type BatchRowResult,
} from "./import-batching";
import type { ImportResultItem } from "@/types/csv-import";
import type { ReviewRow } from "./review-types";

describe("runImportBatches", () => {
	const records = Array.from({ length: 25 }, (_, i) => ({ name: `c${i}` }));
	const okBatch = (batch: { name: string }[]): BatchRowResult[] =>
		batch.map((r) => ({ success: true, id: `id-${r.name}` }));

	it("reports progress after each batch and composites results in order", async () => {
		const send = vi.fn(async (batch: { name: string }[]) => okBatch(batch));
		const onProgress = vi.fn();

		const run = await runImportBatches({
			records,
			batchSize: 10,
			send,
			onProgress,
		});

		expect(send).toHaveBeenCalledTimes(3);
		expect(send.mock.calls.map(([b]) => b.length)).toEqual([10, 10, 5]);
		expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
			{ current: 10, total: 25, succeeded: 10, failed: 0 },
			{ current: 20, total: 25, succeeded: 20, failed: 0 },
			{ current: 25, total: 25, succeeded: 25, failed: 0 },
		]);
		expect(run.succeeded).toBe(25);
		expect(run.failed).toBe(0);
		expect(run.limitMessage).toBeNull();
		expect(run.results).toHaveLength(25);
		expect(run.results.map((r) => r.rowIndex)).toEqual(
			records.map((_, i) => i)
		);
		expect(run.results[12]).toEqual({
			success: true,
			id: "id-c12",
			error: undefined,
			warnings: undefined,
			rowIndex: 12,
		});
	});

	it("counts per-row failures and stringifies ids across batches", async () => {
		const send = vi.fn(async (batch: { name: string }[]) =>
			batch.map((r, i) =>
				i === 0
					? { success: false, error: "Company name is required" }
					: { success: true, id: { toString: () => `doc-${r.name}` } }
			)
		);

		const run = await runImportBatches({
			records,
			batchSize: 10,
			send,
			onProgress: () => {},
		});

		expect(run.succeeded).toBe(22);
		expect(run.failed).toBe(3);
		expect(run.results[0].error).toBe("Company name is required");
		expect(run.results[1].id).toBe("doc-c1");
		expect(run.results[20].success).toBe(false);
	});

	it("marks only that batch failed when a batch throws a non-limit error, then continues", async () => {
		const send = vi.fn(async (batch: { name: string }[]) => {
			if (batch[0].name === "c10") throw new Error("network down");
			return okBatch(batch);
		});
		const onProgress = vi.fn();

		const run = await runImportBatches({
			records,
			batchSize: 10,
			send,
			onProgress,
		});

		expect(send).toHaveBeenCalledTimes(3);
		expect(run.limitMessage).toBeNull();
		expect(run.succeeded).toBe(15);
		expect(run.failed).toBe(10);
		for (let i = 10; i < 20; i++) {
			expect(run.results[i]).toEqual({
				success: false,
				rowIndex: i,
				error: "network down",
			});
		}
		expect(run.results[9].success).toBe(true);
		expect(run.results[20].success).toBe(true);
		expect(onProgress).toHaveBeenLastCalledWith({
			current: 25,
			total: 25,
			succeeded: 15,
			failed: 10,
		});
	});

	it("uses the ConvexError payload message for a non-limit batch failure", async () => {
		const run = await runImportBatches({
			records: records.slice(0, 3),
			batchSize: 10,
			send: async () => {
				throw new ConvexError({ code: "FORBIDDEN", message: "No access" });
			},
			onProgress: () => {},
		});

		expect(run.limitMessage).toBeNull();
		expect(run.results.map((r) => r.error)).toEqual([
			"No access",
			"No access",
			"No access",
		]);
	});

	it.each(["IMPORT_LIMIT", "PLAN_LIMIT_REACHED"])(
		"stops calling the server on a %s refusal and fails every remaining row",
		async (code) => {
			const send = vi.fn(async (batch: { name: string }[]) => {
				if (batch[0].name === "c10") {
					throw new ConvexError({ code, message: "Row limit hit" });
				}
				return okBatch(batch);
			});
			const onProgress = vi.fn();

			const run = await runImportBatches({
				records,
				batchSize: 10,
				send,
				onProgress,
			});

			expect(send).toHaveBeenCalledTimes(2);
			expect(run.limitMessage).toBe("Row limit hit");
			expect(run.succeeded).toBe(10);
			expect(run.failed).toBe(15);
			expect(run.results).toHaveLength(25);
			for (let i = 10; i < 25; i++) {
				expect(run.results[i]).toEqual({
					success: false,
					rowIndex: i,
					error: "Row limit hit",
				});
			}
			expect(onProgress).toHaveBeenCalledTimes(2);
			expect(onProgress).toHaveBeenLastCalledWith({
				current: 25,
				total: 25,
				succeeded: 10,
				failed: 15,
			});
		}
	);

	it("falls back to generic copy when a limit refusal carries no message", async () => {
		const run = await runImportBatches({
			records: records.slice(0, 2),
			batchSize: 10,
			send: async () => {
				throw new ConvexError({ code: "IMPORT_LIMIT" });
			},
			onProgress: () => {},
		});

		expect(run.limitMessage).toBe("This import hit a row limit.");
	});

	it("sends nothing and reports no progress for an empty record set", async () => {
		const send = vi.fn();
		const onProgress = vi.fn();

		const run = await runImportBatches({
			records: [],
			batchSize: 10,
			send,
			onProgress,
		});

		expect(send).not.toHaveBeenCalled();
		expect(onProgress).not.toHaveBeenCalled();
		expect(run).toEqual({
			results: [],
			succeeded: 0,
			failed: 0,
			limitMessage: null,
		});
	});
});

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
