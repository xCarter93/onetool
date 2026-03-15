"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import type {
	CsvAnalysisResult,
	CsvImportState,
	FieldMapping,
	ImportRecord,
	ImportResult,
	ImportResultItem,
	RecordValidationError,
} from "@/types/csv-import";
import {
	parseCsvData,
	buildImportRecords,
	validateImportRecords,
} from "../utils/transform-csv";
import type { ImportStep } from "../components/import-step-nav";

const STEP_ORDER: ImportStep[] = ["upload", "map", "review", "preview"];

function isValidStep(s: string | null): s is ImportStep {
	return s !== null && STEP_ORDER.includes(s as ImportStep);
}

export function useImportWizard() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const bulkCreateClients = useMutation(api.clients.bulkCreate);

	const rawStep = searchParams.get("step");
	const currentStep: ImportStep = isValidStep(rawStep) ? rawStep : "upload";

	// Wizard state
	const [state, setState] = useState<CsvImportState>({
		file: null,
		fileContent: null,
		entityType: "clients",
		isAnalyzing: false,
		analysisResult: null,
		mappings: [],
		isImporting: false,
		importResult: null,
	});

	const [selectedMappingColumn, setSelectedMappingColumn] = useState<
		string | null
	>(null);

	const [manualOverrides, setManualOverrides] = useState<Set<string>>(
		new Set()
	);
	const [analysisError, setAnalysisError] = useState<string | null>(null);

	// --- Navigation helpers ---
	const navigateTo = useCallback(
		(step: ImportStep) => {
			router.replace(`/clients/import?step=${step}`);
		},
		[router],
	);

	const goNext = useCallback(() => {
		const idx = STEP_ORDER.indexOf(currentStep);
		if (idx < STEP_ORDER.length - 1) {
			navigateTo(STEP_ORDER[idx + 1]);
		}
	}, [currentStep, navigateTo]);

	const goBack = useCallback(() => {
		const idx = STEP_ORDER.indexOf(currentStep);
		if (idx > 0) {
			navigateTo(STEP_ORDER[idx - 1]);
		}
	}, [currentStep, navigateTo]);

	const startOver = useCallback(() => {
		setState({
			file: null,
			fileContent: null,
			entityType: "clients",
			isAnalyzing: false,
			analysisResult: null,
			mappings: [],
			isImporting: false,
			importResult: null,
		});
		setSelectedMappingColumn(null);
		setManualOverrides(new Set());
		setAnalysisError(null);
		navigateTo("upload");
	}, [navigateTo]);

	// --- Handlers ---
	const handleFileSelect = useCallback(
		async (file: File, content: string) => {
			setState((prev) => ({
				...prev,
				file,
				fileContent: content,
				isAnalyzing: true,
				analysisResult: null,
				mappings: [],
				importResult: null,
			}));

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 60_000);

			try {
				// Parse CSV to extract headers and sample rows for analysis
				// Full content stays in state for later import use
				const rows = await parseCsvData(content);
				const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
				const sampleRows = rows.slice(0, 5);

				const response = await fetch("/api/analyze-csv", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						headers,
						sampleRows,
						entityType: "clients",
					}),
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					const errorData = await response
						.json()
						.catch(() => ({ error: "Unknown error" }));
					throw new Error(
						errorData.details || errorData.error || "Failed to analyze CSV",
					);
				}

				const analysisResult: CsvAnalysisResult = await response.json();

				setAnalysisError(null);
				setManualOverrides(new Set());

				setState((prev) => ({
					...prev,
					isAnalyzing: false,
					analysisResult,
					mappings: analysisResult.detectedFields,
				}));

				// Auto-advance to mapping step after brief delay
				// 1s delay ensures React commits state before step guard checks
				setTimeout(() => {
					navigateTo("map");
				}, 1000);
			} catch (err) {
				clearTimeout(timeoutId);
				const isTimeout =
					err instanceof DOMException && err.name === "AbortError";
				console.error("Error analyzing CSV:", err);

				const errorMessage = isTimeout
					? "The analysis took too long. Please try again with a smaller file."
					: err instanceof Error
						? err.message
						: "Failed to analyze CSV file";

				setAnalysisError(errorMessage);

				toast.error(
					isTimeout ? "Analysis Timed Out" : "Analysis Failed",
					errorMessage,
				);
				setState((prev) => ({
					...prev,
					isAnalyzing: false,
				}));
			}
		},
		[toast, navigateTo],
	);

	const handleMappingChange = useCallback(
		(csvColumn: string, newSchemaField: string) => {
			setManualOverrides((prev) => new Set(prev).add(csvColumn));
			setState((prev) => ({
				...prev,
				mappings: (prev.mappings || []).map((m) =>
					m.csvColumn === csvColumn ? { ...m, schemaField: newSchemaField } : m,
				),
			}));
		},
		[],
	);

	// --- Error recovery handlers ---
	const handleRetryAnalysis = useCallback(() => {
		if (state.file && state.fileContent) {
			handleFileSelect(state.file, state.fileContent);
		}
	}, [state.file, state.fileContent, handleFileSelect]);

	const handleClearFile = useCallback(() => {
		setState((prev) => ({
			...prev,
			file: null,
			fileContent: null,
			analysisResult: null,
			mappings: [],
		}));
		setAnalysisError(null);
		setManualOverrides(new Set());
	}, []);

	const handleProceedUnmapped = useCallback(async () => {
		if (state.mappings && state.mappings.length > 0) {
			// AI succeeded — set all columns to __skip__ with confidence 0 so user can manually map
			setState((prev) => ({
				...prev,
				mappings: (prev.mappings || []).map((m) => ({
					...m,
					schemaField: "__skip__",
					confidence: 0,
				})),
			}));
		} else if (state.fileContent) {
			// AI failed — construct stub mappings from CSV headers on demand
			const rows = await parseCsvData(state.fileContent);
			const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
			const stubMappings: FieldMapping[] = headers.map((h) => ({
				csvColumn: h,
				schemaField: "__skip__",
				confidence: 0,
				dataType: "string",
				isRequired: false,
			}));
			setState((prev) => ({ ...prev, mappings: stubMappings }));
		} else {
			// Neither mappings nor fileContent exist — nothing to work with
			return;
		}
		setAnalysisError(null);
		navigateTo("map");
	}, [state.mappings, state.fileContent, navigateTo]);

	const handleImportData = useCallback(async () => {
		if (!state.fileContent || !state.mappings?.length) return;

		setState((prev) => ({ ...prev, isImporting: true }));

		try {
			const rows = await parseCsvData(state.fileContent);
			const activeMappings = (state.mappings || []).filter(
				(m) => m.schemaField !== "__skip__",
			);
			const records = buildImportRecords(rows, activeMappings);

			// Pre-validate records before sending to backend
			const validationErrors = validateImportRecords(records);
			if (validationErrors.length > 0) {
				// Group errors by row for display
				const errorsByRow = new Map<number, string[]>();
				for (const err of validationErrors) {
					const existing = errorsByRow.get(err.rowIndex) || [];
					existing.push(`${err.field}: ${err.message}`);
					errorsByRow.set(err.rowIndex, existing);
				}

				const items: ImportResultItem[] = records.map((_, index) => {
					const rowErrors = errorsByRow.get(index);
					return {
						success: !rowErrors,
						rowIndex: index,
						error: rowErrors ? rowErrors.join("; ") : undefined,
					};
				});

				const failureCount = items.filter((i) => !i.success).length;

				setState((prev) => ({
					...prev,
					isImporting: false,
					importResult: {
						successCount: 0,
						failureCount,
						items,
					},
				}));

				toast.error(
					"Validation Failed",
					`${validationErrors.length} validation error${validationErrors.length !== 1 ? "s" : ""} found. Fix your data and try again.`,
				);
				return;
			}

			// ImportRecord matches the bulkCreate validator shape (safe cast due to shared type definition)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const backendResults = await bulkCreateClients({ clients: records as any });
			const items: ImportResultItem[] = backendResults.map((r, index) => ({
				success: r.success,
				id: r.id ? String(r.id) : undefined,
				error: r.error,
				warnings: r.warnings,
				rowIndex: index,
			}));

			const successCount = items.filter((i) => i.success).length;
			const failureCount = items.filter((i) => !i.success).length;
			const warningCount = items.filter(
				(i) => i.success && i.warnings?.length,
			).length;

			const result: ImportResult = {
				successCount,
				failureCount,
				items,
			};

			setState((prev) => ({
				...prev,
				isImporting: false,
				importResult: result,
			}));

			// Contextual toast message
			if (failureCount > 0) {
				toast.error(
					"Import Finished",
					`Imported ${successCount} client${successCount !== 1 ? "s" : ""}, ${failureCount} failed`,
				);
			} else if (warningCount > 0) {
				toast.success(
					"Import Complete",
					`Imported ${successCount} client${successCount !== 1 ? "s" : ""} (${warningCount} with warnings)`,
				);
			} else {
				toast.success(
					"Import Complete",
					`Successfully imported ${successCount} client${successCount !== 1 ? "s" : ""}`,
				);
			}
		} catch (err) {
			console.error("Error importing data:", err);

			setState((prev) => ({
				...prev,
				isImporting: false,
				importResult: {
					successCount: 0,
					failureCount: 1,
					items: [{ success: false, rowIndex: 0, error: String(err) }],
				},
			}));

			toast.error(
				"Import Failed",
				err instanceof Error ? err.message : "Failed to import data",
			);
		}
	}, [state.fileContent, state.mappings, bulkCreateClients, toast]);

	return {
		state,
		currentStep,
		selectedMappingColumn,
		setSelectedMappingColumn,
		manualOverrides,
		analysisError,
		navigateTo,
		goNext,
		goBack,
		startOver,
		handleFileSelect,
		handleMappingChange,
		handleRetryAnalysis,
		handleClearFile,
		handleProceedUnmapped,
		handleImportData,
	};
}
