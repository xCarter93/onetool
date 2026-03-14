import type { FieldMapping } from "@/types/csv-import";

/**
 * Coerce a raw CSV value to the target data type.
 */
export function transformValue(value: unknown, dataType: string): unknown {
	if (value === null || value === undefined || value === "") {
		return undefined;
	}

	switch (dataType) {
		case "number": {
			const num = parseFloat(String(value));
			return isNaN(num) ? undefined : num;
		}
		case "boolean": {
			if (typeof value === "boolean") return value;
			const str = String(value).toLowerCase().trim();
			return str === "true" || str === "yes" || str === "1";
		}
		case "date": {
			const date = new Date(String(value));
			return isNaN(date.getTime()) ? undefined : date.toISOString();
		}
		case "array": {
			if (Array.isArray(value)) return value;
			const stringValue = String(value).trim();
			if (!stringValue) return undefined;

			const delimiter = stringValue.includes(";")
				? ";"
				: stringValue.includes(",")
					? ","
					: stringValue.includes("|")
						? "|"
						: ",";

			return stringValue
				.split(delimiter)
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
		}
		default:
			return value;
	}
}

/**
 * Parse a CSV string into an array of row objects using PapaParse (dynamic import).
 */
export async function parseCsvData(
	fileContent: string
): Promise<Record<string, unknown>[]> {
	// Strip UTF-8 BOM if present (common in Excel-exported CSVs)
	const cleanContent =
		fileContent.charCodeAt(0) === 0xfeff
			? fileContent.slice(1)
			: fileContent;

	const Papa = (await import("papaparse")).default;
	const parseResult = Papa.parse(cleanContent, {
		header: true,
		skipEmptyLines: true,
		dynamicTyping: false,
	});
	return parseResult.data as Record<string, unknown>[];
}

/**
 * Apply column mappings to parsed CSV rows, producing records
 * ready for Convex bulk-create mutations.
 */
export function buildImportRecords(
	rows: Record<string, unknown>[],
	mappings: FieldMapping[]
): Record<string, unknown>[] {
	return rows.map((row) => {
		const record: Record<string, unknown> = {};

		mappings.forEach((mapping) => {
			if (mapping.schemaField === "__skip__") return;
			const csvValue = row[mapping.csvColumn];
			const transformedValue = transformValue(csvValue, mapping.dataType);

			if (transformedValue !== undefined) {
				record[mapping.schemaField] = transformedValue;
			}
		});

		return record;
	});
}
