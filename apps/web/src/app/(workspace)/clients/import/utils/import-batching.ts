import type { ImportResultItem } from "@/types/csv-import";
import type { ReviewRow } from "./review-types";

/**
 * Splits an array into chunks of the given size.
 * The last chunk may be smaller than `size`.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
	if (arr.length === 0) return [];
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size));
	}
	return chunks;
}

/**
 * Merges backend import results with skipped and error rows to produce
 * a complete result set covering ALL original review rows.
 *
 * @param backendResults - Results from the backend for imported rows, in order
 * @param reviewRows - All review rows (the full set)
 * @param importedIndices - Indices into reviewRows that were sent to backend,
 *   in the same order as backendResults
 */
export function buildCompositeResults({
	backendResults,
	reviewRows,
	importedIndices,
}: {
	backendResults: ImportResultItem[];
	reviewRows: ReviewRow[];
	importedIndices: number[];
}): ImportResultItem[] {
	// Map from reviewRow index -> backendResults index for O(1) lookup
	const importedMap = new Map<number, number>();
	for (let i = 0; i < importedIndices.length; i++) {
		importedMap.set(importedIndices[i], i);
	}

	return reviewRows.map((row, idx) => {
		if (row.skipImport) {
			return {
				success: false,
				skipped: true,
				rowIndex: row.rowIndex,
			};
		}

		if (row.status === "error") {
			return {
				success: false,
				skipped: false,
				rowIndex: row.rowIndex,
				error: row.errors
					.map((e) => `${e.field}: ${e.message}`)
					.join("; "),
			};
		}

		// Importable row - look up backend result
		const backendIdx = importedMap.get(idx);
		if (backendIdx === undefined) {
			// Safety fallback: row was expected to be imported but has no result
			return {
				success: false,
				rowIndex: row.rowIndex,
				error: "No backend result received",
			};
		}

		const backend = backendResults[backendIdx];
		const result: ImportResultItem = {
			success: backend.success,
			rowIndex: row.rowIndex,
		};
		if (backend.id) result.id = backend.id;
		if (backend.error) result.error = backend.error;
		if (backend.warnings) result.warnings = backend.warnings;
		return result;
	});
}
