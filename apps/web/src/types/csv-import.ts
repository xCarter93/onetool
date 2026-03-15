// Type definitions for CSV import feature

export type EntityType = "clients" | "projects";

export interface CsvData {
	headers: string[];
	rows: Record<string, string | number | boolean>[];
	rowCount: number;
}

export interface FieldMapping {
	csvColumn: string;
	schemaField: string;
	confidence: number; // 0-1 score indicating mapping confidence
	dataType: string;
	isRequired: boolean;
	sampleValue?: string | number | boolean;
}

export interface ValidationError {
	field: string;
	message: string;
	severity: "error" | "warning";
}

export interface ValidationResult {
	isValid: boolean;
	errors: ValidationError[];
	warnings: ValidationError[];
	missingRequiredFields: string[];
}

export interface CsvAnalysisResult {
	entityType: EntityType;
	detectedFields: FieldMapping[];
	validation: ValidationResult;
	suggestedDefaults: Record<string, string | boolean | number>;
	confidence: number;
	sampleData?: Record<string, string>[];
}

export interface ImportResultItem {
	success: boolean;
	id?: string;
	error?: string;
	warnings?: string[];
	rowIndex: number;
}

/**
 * A single import record matching the expanded bulkCreate validator shape.
 * Produced by buildImportRecords, consumed by clients.bulkCreate.
 */
export interface ImportRecord {
	companyName: string;
	status: "lead" | "active" | "inactive" | "archived";
	companyDescription?: string;
	leadSource?: string;
	communicationPreference?: string;
	isActive?: boolean;
	tags?: string[];
	notes?: string;
	contacts?: Array<{
		firstName: string;
		lastName: string;
		email?: string;
		phone?: string;
		jobTitle?: string;
	}>;
	properties?: Array<{
		propertyName?: string;
		propertyType?: string;
		streetAddress: string;
		city: string;
		state: string;
		zipCode: string;
		country?: string;
	}>;
	[key: string]: unknown;
}

/**
 * Validation error for a specific field in an import record.
 */
export interface RecordValidationError {
	rowIndex: number;
	field: string;
	message: string;
}

export interface ImportResult {
	successCount: number;
	failureCount: number;
	items: ImportResultItem[];
}

/**
 * State for CSV import flow
 */
export interface CsvImportState {
	file: File | null;
	fileContent: string | null;
	entityType: EntityType;
	isAnalyzing: boolean;
	analysisResult: CsvAnalysisResult | null;
	mappings?: FieldMapping[];
	isImporting?: boolean;
	importResult?: ImportResult | null;
	skipImport?: boolean;
	reviewSkippedRows?: Set<number>;
}

// Schema field definitions for reference - must match convex/schema.ts clients table
// Each field has a `group` property for UI categorization (client, contact, property)
export const CLIENT_SCHEMA_FIELDS = {
	// Required client fields (from schema)
	companyName: { type: "string", required: true, group: "client" },
	status: {
		type: "enum",
		required: true,
		group: "client",
		options: ["lead", "active", "inactive", "archived"],
	},

	// Optional client fields (from schema)
	companyDescription: { type: "string", required: false, group: "client" },
	leadSource: {
		type: "enum",
		required: false,
		group: "client",
		options: [
			"word-of-mouth",
			"website",
			"social-media",
			"referral",
			"advertising",
			"trade-show",
			"cold-outreach",
			"community-page",
			"other",
		],
	},
	communicationPreference: {
		type: "enum",
		required: false,
		group: "client",
		options: ["email", "phone", "both"],
	},
	tags: { type: "array", required: false, group: "client" },
	notes: { type: "string", required: false, group: "client" },

	// Contact fields (namespaced to avoid collisions with client-level fields)
	// All marked required: false for CSV mapping — table-level constraints enforced at import time (Phase 5)
	"contact.firstName": { type: "string", required: false, group: "contact" },
	"contact.lastName": { type: "string", required: false, group: "contact" },
	"contact.email": { type: "string", required: false, group: "contact" },
	"contact.phone": { type: "string", required: false, group: "contact" },
	"contact.jobTitle": { type: "string", required: false, group: "contact" },

	// Property fields (namespaced to avoid collisions)
	// All marked required: false for CSV mapping — table-level constraints enforced at import time (Phase 5)
	"property.propertyName": {
		type: "string",
		required: false,
		group: "property",
	},
	"property.propertyType": {
		type: "enum",
		required: false,
		group: "property",
		options: [
			"residential",
			"commercial",
			"industrial",
			"retail",
			"office",
			"mixed-use",
		],
	},
	"property.streetAddress": {
		type: "string",
		required: false,
		group: "property",
	},
	"property.city": { type: "string", required: false, group: "property" },
	"property.state": { type: "string", required: false, group: "property" },
	"property.zipCode": { type: "string", required: false, group: "property" },
	"property.country": { type: "string", required: false, group: "property" },
} as const;

export type SchemaFieldGroup = "client" | "contact" | "property";

/**
 * Returns CLIENT_SCHEMA_FIELDS entries grouped by their `group` property.
 * Used by the column mapping UI to render grouped dropdowns.
 */
export function getFieldsByGroup(fields: typeof CLIENT_SCHEMA_FIELDS) {
	const entries = Object.entries(fields) as [
		keyof typeof CLIENT_SCHEMA_FIELDS,
		(typeof CLIENT_SCHEMA_FIELDS)[keyof typeof CLIENT_SCHEMA_FIELDS],
	][];

	return {
		client: entries.filter(([, info]) => info.group === "client"),
		contact: entries.filter(([, info]) => info.group === "contact"),
		property: entries.filter(([, info]) => info.group === "property"),
	};
}

// Schema field definitions for reference - must match convex/schema.ts projects table
export const PROJECT_SCHEMA_FIELDS = {
	// Required fields (from schema)
	title: { type: "string", required: true },
	status: {
		type: "enum",
		required: true,
		options: ["planned", "in-progress", "completed", "cancelled"],
	},
	projectType: {
		type: "enum",
		required: true,
		options: ["one-off", "recurring"],
	},
	clientId: { type: "id", required: true }, // Can be resolved from client name

	// Optional fields (from schema)
	description: { type: "string", required: false },
	projectNumber: { type: "string", required: false },
	startDate: { type: "number", required: false },
	endDate: { type: "number", required: false },
	assignedUserIds: { type: "array", required: false },
} as const;
