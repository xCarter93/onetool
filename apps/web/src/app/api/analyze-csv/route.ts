import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { mapSchemaTool } from "@/mastra/tools/map-schema-tool";
import { validateDataTool } from "@/mastra/tools/validate-data-tool";
import type { CsvAnalysisResult } from "@/types/csv-import";

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

		const resolvedEntityType = entityType || "clients";

		// Call mapSchemaTool directly — uses LLM (GPT-5 nano) for column mapping
		const mapRaw = await mapSchemaTool.execute({
			entityType: resolvedEntityType,
			headers,
			sampleRows,
		});

		// Mastra execute returns a union with ValidationError — check for error case
		if ("error" in mapRaw && mapRaw.error === true) {
			return NextResponse.json(
				{ error: "Schema mapping failed", details: mapRaw.message },
				{ status: 500 }
			);
		}
		const mapResult = mapRaw;

		// Call validateDataTool directly with mapping results
		const validateRaw = await validateDataTool.execute({
			entityType: resolvedEntityType,
			mappings: mapResult.mappings,
			sampleRows,
		});

		if ("error" in validateRaw && validateRaw.error === true) {
			return NextResponse.json(
				{ error: "Data validation failed", details: validateRaw.message },
				{ status: 500 }
			);
		}
		const validateResult = validateRaw;

		// Compute overall confidence from actual mapping scores (not hardcoded)
		const avgConfidence =
			mapResult.mappings.length > 0
				? mapResult.mappings.reduce(
						(sum: number, m: { confidence: number }) =>
							sum + m.confidence,
						0
					) / mapResult.mappings.length
				: 0;

		// Build the analysis result from direct tool outputs
		const analysisResult: CsvAnalysisResult & { llmFailed?: boolean } = {
			entityType: resolvedEntityType,
			detectedFields: mapResult.mappings,
			validation: {
				isValid: validateResult.isValid,
				errors: validateResult.errors,
				warnings: validateResult.warnings,
				missingRequiredFields: validateResult.missingRequiredFields,
			},
			suggestedDefaults: validateResult.suggestedDefaults,
			confidence: Math.round(avgConfidence * 100) / 100,
			sampleData: sampleRows,
			llmFailed: (mapResult as Record<string, unknown>).llmFailed === true,
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
