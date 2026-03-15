import type {
	FieldMapping,
	ImportRecord,
	RecordValidationError,
} from "@/types/csv-import";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_LEAD_SOURCES = CLIENT_SCHEMA_FIELDS.leadSource.options as readonly string[];
const VALID_COMMUNICATION_PREFERENCES = CLIENT_SCHEMA_FIELDS.communicationPreference.options as readonly string[];

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
 *
 * Dot-namespaced fields (contact.firstName, property.streetAddress) are
 * restructured into nested contacts/properties arrays. Each CSV row
 * produces at most one contact and one property sub-record. If all
 * sub-record fields for a group are empty/undefined, the array is omitted.
 */
export function buildImportRecords(
	rows: Record<string, unknown>[],
	mappings: FieldMapping[]
): ImportRecord[] {
	return rows.map((row) => {
		const clientFields: Record<string, unknown> = {};
		const contactFields: Record<string, unknown> = {};
		const propertyFields: Record<string, unknown> = {};

		mappings.forEach((mapping) => {
			if (mapping.schemaField === "__skip__") return;
			const csvValue = row[mapping.csvColumn];
			const transformedValue = transformValue(csvValue, mapping.dataType);
			if (transformedValue === undefined) return;

			if (mapping.schemaField.startsWith("contact.")) {
				contactFields[mapping.schemaField.slice("contact.".length)] =
					transformedValue;
			} else if (mapping.schemaField.startsWith("property.")) {
				propertyFields[mapping.schemaField.slice("property.".length)] =
					transformedValue;
			} else {
				clientFields[mapping.schemaField] = transformedValue;
			}
		});

		const record: ImportRecord = clientFields as ImportRecord;

		// Only include contacts/properties if at least one field has a value
		if (Object.keys(contactFields).length > 0) {
			record.contacts = [contactFields as NonNullable<ImportRecord["contacts"]>[0]];
		}
		if (Object.keys(propertyFields).length > 0) {
			record.properties = [propertyFields as NonNullable<ImportRecord["properties"]>[0]];
		}

		return record;
	});
}

/**
 * Resolve a value from a transformed import record given a dot-namespaced header.
 *
 * After buildImportRecords, dot-namespaced keys no longer exist as flat properties:
 *   "contact.firstName" -> record.contacts[0].firstName
 *   "property.streetAddress" -> record.properties[0].streetAddress
 *   "companyName" -> record.companyName (unchanged)
 *
 * This function bridges that gap for the preview table.
 */
export function resolveRecordValue(
	record: Record<string, unknown>,
	header: string
): unknown {
	if (header.startsWith("contact.")) {
		const field = header.slice("contact.".length);
		const contacts = record.contacts as
			| Record<string, unknown>[]
			| undefined;
		return contacts?.[0]?.[field];
	}
	if (header.startsWith("property.")) {
		const field = header.slice("property.".length);
		const properties = record.properties as
			| Record<string, unknown>[]
			| undefined;
		return properties?.[0]?.[field];
	}
	return record[header];
}

/**
 * Validate import records before sending to bulkCreate.
 * Catches missing required fields and invalid enum values early.
 * Does NOT auto-default any required fields.
 */
export function validateImportRecords(
	records: ImportRecord[]
): RecordValidationError[] {
	const errors: RecordValidationError[] = [];
	const validStatuses = ["lead", "active", "inactive", "archived"];

	records.forEach((record, rowIndex) => {
		if (!record.companyName || !String(record.companyName).trim()) {
			errors.push({
				rowIndex,
				field: "companyName",
				message: "Company name is required",
			});
		}
		if (!record.status || !validStatuses.includes(String(record.status))) {
			errors.push({
				rowIndex,
				field: "status",
				message: `Status must be one of: ${validStatuses.join(", ")}`,
			});
		}

		// Email format validation on first contact
		const email = record.contacts?.[0]?.email;
		if (email && !EMAIL_REGEX.test(String(email))) {
			errors.push({
				rowIndex,
				field: "contact.email",
				message: "Must be a valid email address",
			});
		}

		// leadSource enum validation
		if (
			record.leadSource &&
			!VALID_LEAD_SOURCES.includes(String(record.leadSource))
		) {
			errors.push({
				rowIndex,
				field: "leadSource",
				message: `Lead source must be one of: ${VALID_LEAD_SOURCES.join(", ")}`,
			});
		}

		// communicationPreference enum validation
		if (
			record.communicationPreference &&
			!VALID_COMMUNICATION_PREFERENCES.includes(
				String(record.communicationPreference)
			)
		) {
			errors.push({
				rowIndex,
				field: "communicationPreference",
				message: `Communication preference must be one of: ${VALID_COMMUNICATION_PREFERENCES.join(", ")}`,
			});
		}
	});

	return errors;
}
