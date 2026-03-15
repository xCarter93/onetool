import type { ImportRecord, RecordValidationError } from "@/types/csv-import";

export type RowStatus = "valid" | "error" | "duplicate";

export interface ReviewRow {
	rowIndex: number;
	record: ImportRecord;
	status: RowStatus;
	errors: RecordValidationError[];
	duplicateMatch?: { matchedName: string; score: number };
	skipImport: boolean;
}

export type FilterTab = "all" | "errors" | "duplicates" | "valid";
