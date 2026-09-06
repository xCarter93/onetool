import { ConvexError } from "convex/values";
import type { CsvImportState, ImportResultItem } from "@/types/csv-import";
import { convexErrorMessage } from "@/lib/convex-error";
import type { ReviewRow } from "./review-types";

type ImportProgress = NonNullable<CsvImportState["importProgress"]>;

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

/** Row ceilings bulkCreate refuses on: ops caps (all plans) and the free-plan
 *  lifetime budget. Both carry their own user-facing copy. */
const ROW_LIMIT_CODES = new Set(["IMPORT_LIMIT", "PLAN_LIMIT_REACHED"]);

/** The server's own message for a row-limit refusal, or null for any other error. */
export function rowLimitMessage(err: unknown): string | null {
	if (!(err instanceof ConvexError)) return null;
	const data = err.data as { code?: unknown; message?: unknown } | undefined;
	if (!data || typeof data !== "object") return null;
	if (typeof data.code !== "string" || !ROW_LIMIT_CODES.has(data.code)) {
		return null;
	}
	return typeof data.message === "string" && data.message.trim()
		? data.message
		: "This import hit a row limit.";
}

export interface BatchRowResult {
	success: boolean;
	id?: unknown;
	error?: string;
	warnings?: string[];
}

export interface BatchRunResult {
	results: ImportResultItem[];
	succeeded: number;
	failed: number;
	limitMessage: string | null;
}

/**
 * Sends `records` to the server in batches, reporting progress after each.
 * A thrown batch marks its rows failed; a row-limit refusal also marks every
 * remaining row failed and stops, since later batches would hit the same wall.
 */
export async function runImportBatches<T>({
	records,
	batchSize,
	send,
	onProgress,
}: {
	records: T[];
	batchSize: number;
	send: (batch: T[]) => Promise<BatchRowResult[]>;
	onProgress: (progress: ImportProgress) => void;
}): Promise<BatchRunResult> {
	const results: ImportResultItem[] = [];
	let succeeded = 0;
	let failed = 0;
	let limitMessage: string | null = null;

	for (const batch of chunkArray(records, batchSize)) {
		try {
			for (const r of await send(batch)) {
				results.push({
					success: r.success,
					id: r.id ? String(r.id) : undefined,
					error: r.error,
					warnings: r.warnings,
					rowIndex: results.length,
				});
				if (r.success) succeeded++;
				else failed++;
			}
		} catch (err) {
			limitMessage = rowLimitMessage(err);
			const reason =
				limitMessage ?? convexErrorMessage(err, "Batch import failed");
			const upTo = limitMessage
				? records.length
				: results.length + batch.length;
			while (results.length < upTo) {
				results.push({ success: false, rowIndex: results.length, error: reason });
				failed++;
			}
		}

		onProgress({
			current: results.length,
			total: records.length,
			succeeded,
			failed,
		});

		if (limitMessage) break;
	}

	return { results, succeeded, failed, limitMessage };
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
