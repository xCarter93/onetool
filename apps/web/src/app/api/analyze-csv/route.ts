import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { mapCsvSchema, validateCsvData } from "@/lib/csv-analysis";
import type { CsvAnalysisResult } from "@/types/csv-import";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
	// Auth guard — unauthenticated requests get 401
	const { userId, getToken } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { headers, sampleRows, entityType } = body;

		// Validate input — expects headers + sampleRows, not full CSV content.
		// PUB-12 (CodeRabbit): validate BEFORE consuming the LLM rate limit so a
		// malformed request cannot burn an org's allowance without a model call.
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

		// PUB-12: LLM-backed route — enforce the assistant's paid-plan gate plus a
		// per-org rate limit before any model call (but after payload validation).
		const convexToken = await getToken({ template: "convex" });
		if (!convexToken) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const access = await fetchMutation(
			api.payments.checkLlmAccess,
			{ bucket: "llmCsvAnalyze" },
			{ token: convexToken }
		);
		if (!access.ok) {
			if (access.reason === "rate_limited") {
				return NextResponse.json(
					{ error: "Too many requests. Please try again later." },
					{ status: 429 }
				);
			}
			return NextResponse.json(
				{ error: "Your plan does not include AI-assisted import." },
				{ status: 403 }
			);
		}

		const resolvedEntityType = entityType || "clients";

		// Call mapCsvSchema directly — uses LLM (GPT-5 nano) for column mapping.
		// Never throws; LLM failures resolve to an empty-mappings/llmFailed result,
		// unexpected errors are caught by the outer try/catch below.
		const mapResult = await mapCsvSchema({
			entityType: resolvedEntityType,
			headers,
			sampleRows,
		});

		// Call validateCsvData directly with mapping results
		const validateResult = await validateCsvData({
			entityType: resolvedEntityType,
			mappings: mapResult.mappings,
			sampleRows,
		});

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
			llmFailed: mapResult.llmFailed === true,
		};

		return NextResponse.json(analysisResult);
	} catch (error) {
		// PUB-15: don't echo raw SDK errors to callers.
		console.error("Error analyzing CSV:", error);
		return NextResponse.json(
			{ error: "Failed to analyze CSV. Please try again." },
			{ status: 500 }
		);
	}
}
