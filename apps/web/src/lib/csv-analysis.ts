import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
	CLIENT_SCHEMA_FIELDS,
	PROJECT_SCHEMA_FIELDS,
} from "@/types/csv-import";
import { getPostHogServer } from "@/lib/posthog-server";

// Zod schema for LLM structured output
// NOTE: Use .nullable() not .optional() for OpenAI structured output compatibility
const llmMappingSchema = z.object({
	mappings: z.array(
		z.object({
			csvColumn: z.string(),
			schemaField: z.string(),
			confidence: z.number(),
			sampleValue: z.string().nullable(),
		}),
	),
	unmappedColumns: z.array(z.string()),
});

type SchemaFields = Record<
	string,
	{
		type: string;
		required: boolean;
		group?: string;
		options?: readonly string[];
	}
>;

export interface MapCsvSchemaInput {
	entityType: "clients" | "projects";
	headers: string[];
	sampleRows?: Record<string, string>[];
	/** Clerk user id — links the $ai_generation event to the caller in PostHog. */
	distinctId?: string;
}

export interface CsvFieldMapping {
	csvColumn: string;
	schemaField: string;
	confidence: number;
	dataType: string;
	isRequired: boolean;
	sampleValue?: string;
}

export interface MapCsvSchemaResult {
	mappings: CsvFieldMapping[];
	unmappedColumns: string[];
	missingRequiredFields: string[];
	llmFailed: boolean;
}

export interface ValidateCsvDataInput {
	entityType: "clients" | "projects";
	mappings: Array<{
		csvColumn: string;
		schemaField: string;
		confidence: number;
		dataType: string;
		isRequired: boolean;
	}>;
	sampleRows?: Record<string, string>[];
}

export interface ValidateCsvDataResult {
	isValid: boolean;
	errors: Array<{
		field: string;
		message: string;
		severity: "error" | "warning";
	}>;
	warnings: Array<{
		field: string;
		message: string;
		severity: "error" | "warning";
	}>;
	missingRequiredFields: string[];
	suggestedDefaults: Record<string, string | boolean | number>;
}

/**
 * Build the prompt for the LLM to map CSV columns to schema fields.
 */
function buildMappingPrompt(
	entityType: string,
	headers: string[],
	sampleRows: Record<string, string>[] | undefined,
	schema: SchemaFields,
): string {
	const schemaDescription = Object.entries(schema).map(([name, info]) => ({
		fieldName: name,
		type: info.type,
		required: info.required,
		...(info.group ? { group: info.group } : {}),
		...("options" in info && info.options
			? { allowedValues: info.options }
			: {}),
	}));

	const rows = sampleRows?.slice(0, 5);

	return `You are mapping CSV columns to database schema fields for a ${entityType} import.

## Schema Fields (use ONLY these exact field names)
${JSON.stringify(schemaDescription, null, 2)}

## CSV Headers
${JSON.stringify(headers)}

## Sample Data (first ${rows?.length ?? 0} rows)
${rows ? JSON.stringify(rows, null, 2) : "No sample data provided"}

## Instructions
- Map each CSV header to the most appropriate schema field.
- Fields like "contact.firstName" and "property.streetAddress" use dot-notation as a namespace separator, not nested objects. Use the exact string including the dot.
- Each schema field should be mapped to at most one CSV column.
- You MUST only use field names from the provided schema. Do not invent field names.
- Provide a confidence score (0.0-1.0) for each mapping based on how well the header and sample data match the field.
- If a CSV column does not match any schema field, include it in unmappedColumns.
- Use sample data to disambiguate when headers are ambiguous.
- For sampleValue, use the value from the first sample row for that column (or null if unavailable).`;
}

/**
 * Post-process LLM mappings: validate field names, resolve duplicates,
 * enrich with dataType/isRequired from schema.
 */
function postProcessMappings(
	llmResult: z.infer<typeof llmMappingSchema>,
	headers: string[],
	schema: SchemaFields,
) {
	const validFieldNames = new Set(Object.keys(schema));
	const usedFields = new Set<string>();
	const mappings: CsvFieldMapping[] = [];
	const unmappedColumns = new Set(llmResult.unmappedColumns);

	// Sort by confidence descending so higher-confidence mappings win duplicates
	const sorted = [...llmResult.mappings].sort(
		(a, b) => b.confidence - a.confidence,
	);

	for (const mapping of sorted) {
		// Validate: schemaField must exist and not already be used
		if (
			!validFieldNames.has(mapping.schemaField) ||
			usedFields.has(mapping.schemaField)
		) {
			unmappedColumns.add(mapping.csvColumn);
			continue;
		}

		usedFields.add(mapping.schemaField);
		const fieldInfo = schema[mapping.schemaField];
		mappings.push({
			csvColumn: mapping.csvColumn,
			schemaField: mapping.schemaField,
			confidence: mapping.confidence,
			dataType: String(fieldInfo.type),
			isRequired: Boolean(fieldInfo.required),
			sampleValue: mapping.sampleValue ?? undefined,
		});
	}

	// Any header not in mappings and not already in unmapped
	const mappedCsvColumns = new Set(mappings.map((m) => m.csvColumn));
	for (const header of headers) {
		if (!mappedCsvColumns.has(header)) {
			unmappedColumns.add(header);
		}
	}

	// Missing required fields
	const missingRequiredFields = Object.entries(schema)
		.filter(([name, info]) => info.required && !usedFields.has(name))
		.map(([name]) => name);

	return {
		mappings,
		unmappedColumns: [...unmappedColumns],
		missingRequiredFields,
	};
}

/** $ai_generation capture for the CSV-mapping call; must never fail the route. */
async function trackCsvMappingGeneration(args: {
	distinctId?: string;
	startedAt: number;
	inputTokens: number;
	outputTokens: number;
	error?: unknown;
}): Promise<void> {
	try {
		// captureImmediate: serverless — waits for delivery instead of batching.
		await getPostHogServer().captureImmediate({
			distinctId: args.distinctId ?? "server",
			event: "$ai_generation",
			properties: {
				source: "web-api",
				$ai_trace_id: crypto.randomUUID(),
				$ai_span_name: "csv-schema-mapping",
				$ai_model: "gpt-5.4-nano",
				$ai_provider: "openai",
				$ai_input_tokens: args.inputTokens,
				$ai_output_tokens: args.outputTokens,
				$ai_latency: (Date.now() - args.startedAt) / 1000,
				...(args.error
					? { $ai_is_error: true, $ai_error: String(args.error) }
					: {}),
			},
		});
	} catch (captureError) {
		console.error("PostHog $ai_generation capture failed:", captureError);
	}
}

/**
 * Map CSV column headers to Convex schema fields for clients or projects,
 * using an LLM (GPT-5 nano) for the mapping. Returns field mappings with
 * confidence scores; falls back to all-unmapped on LLM failure.
 */
export async function mapCsvSchema(
	input: MapCsvSchemaInput,
): Promise<MapCsvSchemaResult> {
	const { entityType, headers, sampleRows, distinctId } = input;

	// Select the appropriate schema
	const schema =
		entityType === "clients"
			? (CLIENT_SCHEMA_FIELDS as unknown as SchemaFields)
			: (PROJECT_SCHEMA_FIELDS as unknown as SchemaFields);

	const startedAt = Date.now();
	try {
		const { output, usage } = await generateText({
			model: openai("gpt-5.4-nano"),
			output: Output.object({ schema: llmMappingSchema }),
			prompt: buildMappingPrompt(entityType, headers, sampleRows, schema),
			// Below the route's maxDuration (60s) so a timeout still returns
			// the llmFailed fallback instead of the platform killing the request.
			abortSignal: AbortSignal.timeout(45_000),
		});

		await trackCsvMappingGeneration({
			distinctId,
			startedAt,
			inputTokens: usage.inputTokens ?? 0,
			outputTokens: usage.outputTokens ?? 0,
		});

		if (!output) {
			throw new Error("LLM returned no structured output");
		}

		return {
			...postProcessMappings(output, headers, schema),
			llmFailed: false,
		};
	} catch (error) {
		// LLM failure -- return all columns as unmapped (user maps manually)
		console.error("mapCsvSchema LLM error:", error);
		await trackCsvMappingGeneration({
			distinctId,
			startedAt,
			inputTokens: 0,
			outputTokens: 0,
			error,
		});
		return {
			mappings: [],
			unmappedColumns: [...headers],
			missingRequiredFields: Object.entries(schema)
				.filter(([, info]) => info.required)
				.map(([name]) => name),
			llmFailed: true,
		};
	}
}

/**
 * Validate mapped CSV data against schema requirements. Checks for required
 * fields, data types, and enum values.
 */
export async function validateCsvData(
	input: ValidateCsvDataInput,
): Promise<ValidateCsvDataResult> {
	const { entityType, mappings, sampleRows } = input;

	// Select the appropriate schema
	const schema =
		entityType === "clients" ? CLIENT_SCHEMA_FIELDS : PROJECT_SCHEMA_FIELDS;

	const errors: Array<{
		field: string;
		message: string;
		severity: "error" | "warning";
	}> = [];
	const missingRequiredFields: string[] = [];
	const suggestedDefaults: Record<string, string | boolean | number> = {};

	// Check for missing required fields
	Object.entries(schema).forEach(([fieldName, fieldInfo]) => {
		if (fieldInfo.required) {
			const isMapped = mappings.some(
				(m) => m.schemaField === fieldName && m.confidence >= 0.7,
			);
			if (!isMapped) {
				missingRequiredFields.push(fieldName);
				errors.push({
					field: fieldName,
					message: `Required field "${fieldName}" is not mapped`,
					severity: "error",
				});
			}
		}
	});

	// Validate enum values for mapped fields (only if sample data is provided)
	if (sampleRows && sampleRows.length > 0) {
		mappings.forEach((mapping) => {
			const fieldInfo = schema[mapping.schemaField as keyof typeof schema];
			if (
				fieldInfo &&
				"options" in fieldInfo &&
				Array.isArray(fieldInfo.options)
			) {
				// Check if sample data contains valid enum values
				const sampleValue = sampleRows[0]?.[mapping.csvColumn];
				const options = fieldInfo.options as string[];
				if (sampleValue && !options.includes(sampleValue)) {
					errors.push({
						field: mapping.schemaField,
						message: `Value "${sampleValue}" is not valid for ${mapping.schemaField}. Expected one of: ${options.join(", ")}`,
						severity: "warning",
					});
				}
			}
		});
	}

	// Suggest defaults for common fields with correct types
	if (entityType === "clients") {
		if (missingRequiredFields.includes("status")) {
			suggestedDefaults.status = "lead";
		}
	} else if (entityType === "projects") {
		if (missingRequiredFields.includes("status")) {
			suggestedDefaults.status = "planned";
		}
		if (missingRequiredFields.includes("projectType")) {
			suggestedDefaults.projectType = "one-off";
		}
	}

	// Check for low confidence mappings
	mappings.forEach((mapping) => {
		if (mapping.confidence < 0.8 && mapping.isRequired) {
			errors.push({
				field: mapping.schemaField,
				message: `Low confidence mapping (${Math.round(mapping.confidence * 100)}%) for required field "${mapping.schemaField}"`,
				severity: "warning",
			});
		}
	});

	// Separate errors and warnings
	const actualErrors = errors.filter((e) => e.severity === "error");
	const warnings = errors.filter((e) => e.severity === "warning");

	const isValid =
		missingRequiredFields.length === 0 && actualErrors.length === 0;

	return {
		isValid,
		errors: actualErrors,
		warnings,
		missingRequiredFields,
		suggestedDefaults,
	};
}
