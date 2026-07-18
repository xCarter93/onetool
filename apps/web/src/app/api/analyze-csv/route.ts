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

		// Size/shape caps: this payload is interpolated into an LLM prompt, so
		// bound header count, row count, row width, and cell length up front.
		const MAX_HEADERS = 100;
		const MAX_SAMPLE_ROWS = 50;
		const MAX_CELL_LENGTH = 2000;
		if (
			headers.length > MAX_HEADERS ||
			headers.some(
				(h: unknown) => typeof h !== "string" || h.length > MAX_CELL_LENGTH
			)
		) {
			return NextResponse.json(
				{ error: "CSV headers are too large or malformed" },
				{ status: 400 }
			);
		}
		const rowsMalformed =
			sampleRows.length > MAX_SAMPLE_ROWS ||
			sampleRows.some((row: unknown) => {
				if (typeof row !== "object" || row === null || Array.isArray(row)) {
					return true;
				}
				const entries = Object.entries(row);
				return (
					entries.length > MAX_HEADERS ||
					entries.some(
						([, value]) =>
							typeof value !== "string" || value.length > MAX_CELL_LENGTH
					)
				);
			});
		if (rowsMalformed) {
			return NextResponse.json(
				{ error: "Sample rows are too large or malformed" },
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
