import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import type { FieldMapping, ImportRecord } from "@/types/csv-import";
import {
	buildImportRecords,
	resolveRecordValue,
	validateImportRecords,
} from "./transform-csv";

/**
 * Generate a unique key for a cell in the editable preview table.
 */
export function cellKey(rowIndex: number, field: string): string {
	return `${rowIndex}-${field}`;
}

/**
 * Initialize cell values from transformed import records.
 *
 * Uses resolveRecordValue to handle dot-namespaced fields
 * (e.g. "contact.firstName" resolves to record.contacts[0].firstName).
 * Missing/undefined values are stored as empty strings.
 */
export function initializeCellValues(
	records: Record<string, unknown>[],
	columnHeaders: string[]
): Map<string, string> {
	const cells = new Map<string, string>();

	records.forEach((record, rowIndex) => {
		columnHeaders.forEach((header) => {
			const value = resolveRecordValue(record, header);
			cells.set(
				cellKey(rowIndex, header),
				value != null ? String(value) : ""
			);
		});
	});

	return cells;
}

/**
 * Rebuild ImportRecord[] from edited cell values.
 *
 * Constructs synthetic flat rows keyed by csvColumn (from the mapping),
 * reading values from cellValues by schemaField. Then delegates to
 * buildImportRecords to handle the contact/property nesting logic.
 */
export function rebuildRecordsFromCells(
	cellValues: Map<string, string>,
	activeMappings: FieldMapping[],
	rowCount: number
): ImportRecord[] {
	const syntheticRows: Record<string, unknown>[] = [];

	for (let i = 0; i < rowCount; i++) {
		const row: Record<string, unknown> = {};
		activeMappings.forEach((mapping) => {
			const value = cellValues.get(cellKey(i, mapping.schemaField)) ?? "";
			row[mapping.csvColumn] = value;
		});
		syntheticRows.push(row);
	}

	return buildImportRecords(syntheticRows, activeMappings);
}

/**
 * Validate cell values by rebuilding records and running validateImportRecords.
 *
 * Returns a Map keyed by cellKey with error messages for cells that have
 * validation errors.
 */
export function validateCells(
	cellValues: Map<string, string>,
	activeMappings: FieldMapping[],
	rowCount: number
): Map<string, string> {
	const records = rebuildRecordsFromCells(cellValues, activeMappings, rowCount);
	const errors = validateImportRecords(records);

	const errorMap = new Map<string, string>();
	for (const err of errors) {
		errorMap.set(cellKey(err.rowIndex, err.field), err.message);
	}

	return errorMap;
}

/**
 * Look up field metadata from CLIENT_SCHEMA_FIELDS.
 *
 * Returns type, required, and options (for enum fields) if the field exists.
 * Returns undefined for unknown fields.
 */
export function getFieldMeta(
	fieldName: string
): { type: string; required: boolean; options?: readonly string[] } | undefined {
	const field = CLIENT_SCHEMA_FIELDS[fieldName as keyof typeof CLIENT_SCHEMA_FIELDS];
	if (!field) return undefined;

	return {
		type: field.type,
		required: field.required,
		...("options" in field ? { options: field.options } : {}),
	};
}
