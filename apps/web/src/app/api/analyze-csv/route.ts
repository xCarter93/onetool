import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { mastra } from "@/mastra";
import type {
	CsvAnalysisResult,
	FieldMapping,
	ValidationError,
} from "@/types/csv-import";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
	// Auth guard — unauthenticated requests get 401
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { headers, sampleRows, entityType } = body;

		// Validate input — expects headers + sampleRows, not full CSV content
		if (!headers || !Array.isArray(headers) || headers.length === 0) {
			return NextResponse.json(
				{ error: "CSV headers array is required" },
				{ status: 400 }
			);
		}

		if (!sampleRows || !Array.isArray(sampleRows)) {
			return NextResponse.json(
				{ error: "Sample rows array is required" },
				{ status: 400 }
			);
		}

		if (entityType && !["clients", "projects"].includes(entityType)) {
			return NextResponse.json(
				{ error: 'Entity type must be "clients" or "projects"' },
				{ status: 400 }
			);
		}

		// Get the CSV import agent
		const agent = mastra.getAgent("csvImportAgent");

		if (!agent) {
			return NextResponse.json(
				{ error: "CSV import agent not found" },
				{ status: 500 }
			);
		}

		// Build a CSV sample string from headers + sample rows for the prompt
		const csvSample = [
			headers.join(","),
			...sampleRows.map((row: Record<string, string>) =>
				headers
					.map((h: string) => {
						const val = row[h] ?? "";
						// Quote values that contain commas
						return String(val).includes(",")
							? `"${String(val)}"`
							: String(val);
					})
					.join(",")
			),
		].join("\n");

		// Prepare the prompt for the agent
		const prompt = entityType
			? `Analyze this CSV file for ${entityType} data. Parse the CSV, map the columns to the schema fields, and validate the data. Here are the CSV headers and first ${sampleRows.length} sample rows:\n\n${csvSample}`
			: `Analyze this CSV file and determine if it contains client or project data. Then parse, map, and validate accordingly. Here are the CSV headers and sample rows:\n\n${csvSample}`;

		// Call the agent to analyze the CSV
		const response = await agent.generate(prompt, { maxSteps: 10 });

		// Extract tool results from the agent's response
		type ToolResult = {
			payload?: {
				toolName?: string;
				result?: unknown;
			};
		};

		// In Mastra v1, toolName uses the property name from the tools object
		const parseResult = response.toolResults?.find(
			(tr: ToolResult) => tr.payload?.toolName === "parseCsv"
		)?.payload?.result as
			| {
					sampleRows: Record<string, string>[];
					headers: string[];
					totalRows: number;
			  }
			| undefined;

		const mapResult = response.toolResults?.find(
			(tr: ToolResult) => tr.payload?.toolName === "mapSchema"
		)?.payload?.result as
			| {
					mappings: FieldMapping[];
					unmappedColumns: string[];
					missingRequiredFields: string[];
			  }
			| undefined;

		const validateResult = response.toolResults?.find(
			(tr: ToolResult) => tr.payload?.toolName === "validateData"
		)?.payload?.result as
			| {
					isValid: boolean;
					errors: ValidationError[];
					warnings: ValidationError[];
					missingRequiredFields: string[];
					suggestedDefaults: Record<string, string>;
			  }
			| undefined;

		// Build the analysis result from tool outputs
		const analysisResult: CsvAnalysisResult = {
			entityType: entityType || "clients",
			detectedFields: mapResult?.mappings || [],
			validation: validateResult
				? {
						isValid: validateResult.isValid,
						errors: validateResult.errors,
						warnings: validateResult.warnings,
						missingRequiredFields: validateResult.missingRequiredFields,
					}
				: {
						isValid: false,
						errors: [],
						warnings: [],
						missingRequiredFields: mapResult?.missingRequiredFields || [],
					},
			suggestedDefaults: validateResult?.suggestedDefaults || {},
			confidence: 0.8,
			sampleData: parseResult?.sampleRows || [],
		};

		return NextResponse.json(analysisResult);
	} catch (error) {
		console.error("Error analyzing CSV:", error);
		return NextResponse.json(
			{
				error: "Failed to analyze CSV",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
