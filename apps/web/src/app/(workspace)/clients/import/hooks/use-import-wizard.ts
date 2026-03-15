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
	ImportResult,
} from "@/types/csv-import";
import { parseCsvData, buildImportRecords } from "../utils/transform-csv";
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

				setState((prev) => ({
					...prev,
					isAnalyzing: false,
					analysisResult,
					mappings: analysisResult.detectedFields,
				}));
			} catch (err) {
				clearTimeout(timeoutId);
				const isTimeout =
					err instanceof DOMException && err.name === "AbortError";
				console.error("Error analyzing CSV:", err);
				toast.error(
					isTimeout ? "Analysis Timed Out" : "Analysis Failed",
					isTimeout
						? "The analysis took too long. Please try again with a smaller file."
						: err instanceof Error
							? err.message
							: "Failed to analyze CSV file",
				);
				setState((prev) => ({
					...prev,
					isAnalyzing: false,
				}));
			}
		},
		[toast],
	);

	const handleMappingChange = useCallback(
		(csvColumn: string, newSchemaField: string) => {
			setState((prev) => ({
				...prev,
				mappings: (prev.mappings || []).map((m) =>
					m.csvColumn === csvColumn ? { ...m, schemaField: newSchemaField } : m,
				),
			}));
		},
		[],
	);

	const handleImportData = useCallback(async () => {
		if (!state.fileContent || !state.analysisResult) return;

		setState((prev) => ({ ...prev, isImporting: true }));

		try {
			const rows = await parseCsvData(state.fileContent);
			const activeMappings = (state.mappings || []).filter(
				(m) => m.schemaField !== "__skip__",
			);
			const records = buildImportRecords(rows, activeMappings);

			await bulkCreateClients({
				clients: records as Parameters<typeof bulkCreateClients>[0]["clients"],
			});

			const result: ImportResult = {
				successCount: records.length,
				failureCount: 0,
				items: records.map((_, index) => ({
					success: true,
					rowIndex: index,
				})),
			};

			setState((prev) => ({
				...prev,
				isImporting: false,
				importResult: result,
			}));

			toast.success(
				"Import Complete",
				`Successfully imported ${records.length} clients`,
			);
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
	}, [
		state.fileContent,
		state.analysisResult,
		state.mappings,
		bulkCreateClients,
		toast,
	]);

	return {
		state,
		currentStep,
		selectedMappingColumn,
		setSelectedMappingColumn,
		navigateTo,
		goNext,
		goBack,
		startOver,
		handleFileSelect,
		handleMappingChange,
		handleImportData,
	};
}
