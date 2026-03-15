import { createTool } from "@mastra/core/tools";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
	CLIENT_SCHEMA_FIELDS,
	PROJECT_SCHEMA_FIELDS,
} from "@/types/csv-import";

// Zod schema for LLM structured output
// NOTE: Use .nullable() not .optional() for OpenAI structured output compatibility
const llmMappingSchema = z.object({
	mappings: z.array(
		z.object({
			csvColumn: z.string(),
			schemaField: z.string(),
			confidence: z.number(),
			sampleValue: z.string().nullable(),
		})
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

/**
 * Build the prompt for the LLM to map CSV columns to schema fields.
 */
function buildMappingPrompt(
	entityType: string,
	headers: string[],
	sampleRows: Record<string, string>[] | undefined,
	schema: SchemaFields
): string {
	const schemaDescription = Object.entries(schema).map(
		([name, info]) => ({
			fieldName: name,
			type: info.type,
			required: info.required,
			...(info.group ? { group: info.group } : {}),
			...("options" in info && info.options
				? { allowedValues: info.options }
				: {}),
		})
	);

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
	schema: SchemaFields
) {
	const validFieldNames = new Set(Object.keys(schema));
	const usedFields = new Set<string>();
	const mappings: Array<{
		csvColumn: string;
		schemaField: string;
		confidence: number;
		dataType: string;
		isRequired: boolean;
		sampleValue?: string;
	}> = [];
	const unmappedColumns = new Set(llmResult.unmappedColumns);

	// Sort by confidence descending so higher-confidence mappings win duplicates
	const sorted = [...llmResult.mappings].sort(
		(a, b) => b.confidence - a.confidence
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

export const mapSchemaTool = createTool({
	id: "map-schema",
	description:
		"Map CSV column headers to Convex schema fields for clients or projects. Returns field mappings with confidence scores.",
	inputSchema: z.object({
		entityType: z
			.enum(["clients", "projects"])
			.describe("Type of entity to map (clients or projects)"),
		headers: z
			.array(z.string())
			.describe("CSV column headers to map to schema fields"),
		sampleRows: z
			.array(z.record(z.string(), z.string()))
			.optional()
			.describe("Optional sample data rows for context"),
	}),
	outputSchema: z.object({
		mappings: z
			.array(
				z.object({
					csvColumn: z.string(),
					schemaField: z.string(),
					confidence: z.number().min(0).max(1),
					dataType: z.string(),
					isRequired: z.boolean(),
					sampleValue: z.string().optional(),
				})
			)
			.describe("Proposed mappings from CSV columns to schema fields"),
		unmappedColumns: z
			.array(z.string())
			.describe("CSV columns that couldn't be mapped"),
		missingRequiredFields: z
			.array(z.string())
			.describe("Required schema fields not found in CSV"),
	}),
	execute: async (input) => {
		const { entityType, headers, sampleRows } = input;

		// Select the appropriate schema
		const schema =
			entityType === "clients"
				? (CLIENT_SCHEMA_FIELDS as unknown as SchemaFields)
				: (PROJECT_SCHEMA_FIELDS as unknown as SchemaFields);

		try {
			const { object } = await generateObject({
				model: openai("gpt-5-nano"),
				schema: llmMappingSchema,
				prompt: buildMappingPrompt(entityType, headers, sampleRows, schema),
				abortSignal: AbortSignal.timeout(15_000),
			});

			return postProcessMappings(object, headers, schema);
		} catch (error) {
			// LLM failure -- return all columns as unmapped (user maps manually)
			console.error("mapSchemaTool LLM error:", error);
			return {
				mappings: [],
				unmappedColumns: [...headers],
				missingRequiredFields: Object.entries(schema)
					.filter(([, info]) => info.required)
					.map(([name]) => name),
			};
		}
	},
});
