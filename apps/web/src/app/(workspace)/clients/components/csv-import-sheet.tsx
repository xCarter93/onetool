"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";
import { CsvImportStep } from "@/app/(workspace)/clients/components/csv-import-step";
import { parseCsvData } from "@/app/(workspace)/clients/import/utils/transform-csv";
import type { CsvAnalysisResult, CsvImportState } from "@/types/csv-import";

interface CsvImportSheetProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onComplete?: () => void;
}

export function CsvImportSheet({
	isOpen,
	onOpenChange,
	onComplete,
}: CsvImportSheetProps) {
	const toast = useToast();
	const bulkCreateClients = useMutation(api.clients.bulkCreate);
	const bulkCreateProjects = useMutation(api.projects.bulkCreate);

	const [csvImportState, setCsvImportState] = useState<CsvImportState>({
		file: null,
		fileContent: null,
		entityType: "clients",
		isAnalyzing: false,
		analysisResult: null,
		mappings: [],
		isImporting: false,
		importResult: null,
	});

	const [error, setError] = useState<string | null>(null);

	const handleFileSelect = async (file: File, content: string) => {
		setCsvImportState((prev) => ({
			...prev,
			file,
			fileContent: content,
			isAnalyzing: true,
			analysisResult: null,
			mappings: [],
		}));

		try {
			// Parse CSV to extract headers and sample rows for the API
			const rows = await parseCsvData(content);
			const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
			const sampleRows = rows.slice(0, 5).map((row) =>
				Object.fromEntries(
					Object.entries(row).map(([k, v]) => [k, String(v ?? "")])
				)
			);

			const response = await fetch("/api/analyze-csv", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					headers,
					sampleRows,
					entityType: csvImportState.entityType,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
				console.error("CSV analysis API error:", errorData);
				throw new Error(errorData.details || errorData.error || "Failed to analyze CSV");
			}

			const analysisResult: CsvAnalysisResult = await response.json();

			// Warn user if LLM mapping failed (they need to map manually)
			if ((analysisResult as unknown as Record<string, unknown>).llmFailed) {
				toast.warning(
					"AI Mapping Unavailable",
					"Automatic column mapping failed. Please map columns manually."
				);
			}

			setCsvImportState((prev) => ({
				...prev,
				isAnalyzing: false,
				analysisResult,
				mappings: analysisResult.detectedFields,
			}));
		} catch (err) {
			console.error("Error analyzing CSV:", err);
			toast.error(
				"Analysis Failed",
				err instanceof Error ? err.message : "Failed to analyze CSV file"
			);
			setCsvImportState((prev) => ({
				...prev,
				isAnalyzing: false,
			}));
		}
	};

	const handleMappingChange = (csvColumn: string, newSchemaField: string) => {
		setCsvImportState((prev) => ({
			...prev,
			mappings: (prev.mappings || []).map((m) =>
				m.csvColumn === csvColumn ? { ...m, schemaField: newSchemaField } : m
			),
		}));
	};

	const transformValue = (value: unknown, dataType: string): unknown => {
		if (value === null || value === undefined || value === "") {
			return undefined;
		}

		switch (dataType) {
			case "number":
				const num = parseFloat(String(value));
				return isNaN(num) ? undefined : num;
			case "boolean":
				if (typeof value === "boolean") return value;
				const str = String(value).toLowerCase().trim();
				return str === "true" || str === "yes" || str === "1";
			case "date":
				const date = new Date(String(value));
				return isNaN(date.getTime()) ? undefined : date.toISOString();
			case "array":
				// Handle array fields - split by common delimiters
				if (Array.isArray(value)) return value;
				const stringValue = String(value).trim();
				if (!stringValue) return undefined;

				// Split by semicolon, comma, or pipe - trim each item and filter empty strings
				const delimiter = stringValue.includes(";")
					? ";"
					: stringValue.includes(",")
						? ","
						: stringValue.includes("|")
							? "|"
							: ",";

				return stringValue
					.split(delimiter)
					.map((item) => item.trim())
					.filter((item) => item.length > 0);
			default:
				return value;
		}
	};

	const handleImportData = async () => {
		if (!csvImportState.fileContent || !csvImportState.analysisResult) {
			return;
		}

		setCsvImportState((prev) => ({ ...prev, isImporting: true }));
		setError(null);

		try {
			const rows = await parseCsvData(csvImportState.fileContent);

			const records = rows.map((row) => {
				const record: Record<string, unknown> = {};

				(csvImportState.mappings || []).forEach((mapping) => {
					const csvValue = row[mapping.csvColumn];
					const transformedValue = transformValue(csvValue, mapping.dataType);

					if (transformedValue !== undefined) {
						record[mapping.schemaField] = transformedValue;
					}
				});

				return record;
			});

			let successCount = 0;
			let failureCount = 0;

			if (csvImportState.entityType === "clients") {
				try {
					await bulkCreateClients({
						clients: records as Parameters<
							typeof bulkCreateClients
						>[0]["clients"],
					});
					successCount = records.length;
				} catch (err) {
					failureCount = records.length;
					throw err;
				}
			} else if (csvImportState.entityType === "projects") {
				try {
					await bulkCreateProjects({
						projects: records as Parameters<
							typeof bulkCreateProjects
						>[0]["projects"],
					});
					successCount = records.length;
				} catch (err) {
					failureCount = records.length;
					throw err;
				}
			}

			setCsvImportState((prev) => ({
				...prev,
				isImporting: false,
				importResult: {
					successCount,
					failureCount,
					items: records.map((_, index) => ({
						success: index < successCount,
						rowIndex: index,
					})),
				},
			}));

			if (failureCount === 0) {
				toast.success(
					"Import Complete",
					`Successfully imported ${successCount} ${csvImportState.entityType}`
				);
			} else if (successCount > 0) {
				toast.warning(
					"Import Partially Complete",
					`Imported ${successCount} ${csvImportState.entityType}, ${failureCount} failed`
				);
			}
		} catch (err) {
			console.error("Error importing data:", err);
			toast.error(
				"Import Failed",
				err instanceof Error ? err.message : "Failed to import data"
			);
			setCsvImportState((prev) => ({
				...prev,
				isImporting: false,
			}));
		}
	};

	const handleClose = () => {
		setCsvImportState({
			file: null,
			fileContent: null,
			entityType: "clients",
			isAnalyzing: false,
			analysisResult: null,
			mappings: [],
			isImporting: false,
			importResult: null,
		});
		setError(null);
		onOpenChange(false);
	};

	const handleComplete = () => {
		handleClose();
		onComplete?.();
	};

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-5xl bg-background!">
				<div className="flex flex-col h-full overflow-hidden">
					<SheetHeader className="border-b border-border pb-4 shrink-0">
						<SheetTitle className="flex items-center gap-2 text-2xl font-semibold">
							Import Data
						</SheetTitle>
						<SheetDescription className="text-muted-foreground">
							Import your existing clients or projects from a CSV file. Our AI
							will help map your data to the correct fields.
						</SheetDescription>
					</SheetHeader>

					<div className="flex-1 overflow-y-auto pt-6 px-6">
						<div className="space-y-6">
							{/* CSV Import Step Component */}
							<CsvImportStep
								entityType={csvImportState.entityType}
								onEntityTypeChange={(value) =>
									setCsvImportState((prev) => ({
										...prev,
										entityType: value,
										analysisResult: null,
										mappings: [],
									}))
								}
								isAnalyzing={csvImportState.isAnalyzing}
								onFileSelect={handleFileSelect}
								analysisResult={csvImportState.analysisResult}
								mappings={csvImportState.mappings || []}
								onMappingChange={handleMappingChange}
								importResult={csvImportState.importResult ?? null}
								error={error}
								showTitle={false}
								disabledEntityTypes={["projects"]}
							/>
						</div>
					</div>

					<SheetFooter className="flex flex-row justify-end gap-3 border-t border-border shrink-0">
						<StyledButton
							type="button"
							intent="outline"
							onClick={handleClose}
							label="Close"
							showArrow={false}
						/>

						{csvImportState.analysisResult && !csvImportState.importResult && (
							<StyledButton
								type="button"
								intent="primary"
								onClick={handleImportData}
								isLoading={csvImportState.isImporting}
								disabled={!csvImportState.analysisResult?.validation.isValid}
								label={
									csvImportState.isImporting ? "Importing..." : "Import Data"
								}
								icon={
									!csvImportState.isImporting && <Upload className="w-4 h-4" />
								}
								showArrow={false}
							/>
						)}

						{(csvImportState.importResult || !csvImportState.file) && (
							<StyledButton
								type="button"
								intent="primary"
								onClick={handleComplete}
								label="Done"
								showArrow={false}
							/>
						)}
					</SheetFooter>
				</div>
			</SheetContent>
		</Sheet>
	);
}

// Export default for easier importing
export default CsvImportSheet;
