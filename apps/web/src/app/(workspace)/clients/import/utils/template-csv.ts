import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";

/**
 * Convert a camelCase or dot-namespaced field key to a human-readable Title Case header.
 *
 * Examples:
 *   "companyName"           -> "Company Name"
 *   "contact.firstName"     -> "Contact First Name"
 *   "property.streetAddress" -> "Property Street Address"
 *   "status"                -> "Status"
 */
export function fieldKeyToHeader(key: string): string {
	return key
		.replace(/\./g, " ")
		.replace(/([A-Z])/g, " $1")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Example values for each CLIENT_SCHEMA_FIELDS key, used in the template CSV.
 */
export const EXAMPLE_VALUES: Record<string, string> = {
	companyName: "Acme Corp",
	status: "active",
	companyDescription: "General contracting services",
	leadSource: "referral",
	communicationPreference: "email",
	tags: "commercial;priority",
	notes: "Long-term client since 2020",
	"contact.firstName": "John",
	"contact.lastName": "Smith",
	"contact.email": "john@acmecorp.com",
	"contact.phone": "(555) 123-4567",
	"contact.jobTitle": "Operations Manager",
	"property.propertyName": "Main Office",
	"property.propertyType": "commercial",
	"property.streetAddress": "123 Main St",
	"property.city": "Springfield",
	"property.state": "IL",
	"property.zipCode": "62701",
	"property.country": "US",
};

/**
 * Generate the headers and data row for a template CSV.
 * Separated from the download logic for testability.
 */
export function generateTemplateCsvData(): {
	headers: string[];
	data: Record<string, string>[];
} {
	const keys = Object.keys(CLIENT_SCHEMA_FIELDS);
	const headers = keys.map(fieldKeyToHeader);

	const row: Record<string, string> = {};
	keys.forEach((key, i) => {
		row[headers[i]] = EXAMPLE_VALUES[key] ?? "";
	});

	return { headers, data: [row] };
}

/**
 * Generate and trigger download of a template CSV file.
 * Uses PapaParse (dynamic import) matching the existing pattern in transform-csv.ts.
 */
export async function downloadTemplateCsv(): Promise<void> {
	const Papa = (await import("papaparse")).default;
	const { headers, data } = generateTemplateCsvData();

	const csv = Papa.unparse({ fields: headers, data });

	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "client-import-template.csv";
	link.click();
	URL.revokeObjectURL(url);
}
