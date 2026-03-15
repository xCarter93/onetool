"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StickyFormFooter } from "@/components/shared/sticky-form-footer";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import { useImportWizard } from "../hooks/use-import-wizard";
import { ImportStepNav } from "./import-step-nav";
import { StepUpload } from "./step-upload";
import { StepMapColumns } from "./step-map-columns";
import { StepReviewValues } from "./step-review-values";
import { StepPreviewImport } from "./step-preview-import";

export function ImportWizard() {
	const router = useRouter();
	const {
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
		setRowSkip,
		initReviewSkippedRows,
	} = useImportWizard();

	// --- Step guard: redirect to upload if state is missing ---
	useEffect(() => {
		if (currentStep !== "upload" && !state.analysisResult) {
			router.replace("/clients/import?step=upload");
		}
	}, [currentStep, state.analysisResult, router]);

	// --- Compute unmapped required fields for inline validation ---
	const unmappedRequiredFields = useMemo(() => {
		const requiredFields = Object.entries(CLIENT_SCHEMA_FIELDS)
			.filter(([, info]) => info.required)
			.map(([name]) => name);
		const activeMappings = (state.mappings || []).filter(
			(m) => m.schemaField !== "__skip__"
		);
		const mappedFields = new Set(activeMappings.map((m) => m.schemaField));
		return new Set(requiredFields.filter((f) => !mappedFields.has(f)));
	}, [state.mappings]);

	// --- Compute "Continue" enabled state ---
	const canContinue = useMemo(() => {
		switch (currentStep) {
			case "upload":
				return !!state.analysisResult && !state.isAnalyzing;
			case "map": {
				const activeMappings = (state.mappings || []).filter(
					(m) => m.schemaField !== "__skip__"
				);
				const mappedFields = new Set(activeMappings.map((m) => m.schemaField));
				const allRequiredMapped = unmappedRequiredFields.size === 0;
				// Check no duplicate mappings
				const noDuplicates = mappedFields.size === activeMappings.length;
				return allRequiredMapped && noDuplicates;
			}
			case "review":
				// Review step is always continuable - errors are flagged for
				// awareness and can be fixed in the editable preview step (step 4)
				return !!state.fileContent;
			case "preview":
				return !state.isImporting;
			default:
				return false;
		}
	}, [currentStep, state]);

	// --- Footer buttons ---
	const footerButtons = useMemo(() => {
		const buttons: Array<{
			label: string;
			onClick: () => void;
			intent: "primary" | "outline" | "secondary" | "warning" | "plain" | "success" | "destructive";
			position: "left" | "right";
			disabled?: boolean;
			isLoading?: boolean;
		}> = [];

		// Left side: Start over
		if (currentStep !== "upload" || state.analysisResult) {
			buttons.push({
				label: "Start over",
				onClick: startOver,
				intent: "outline",
				position: "left",
				disabled: state.isImporting,
			});
		}

		// Left side: Back (hidden on step 1)
		if (currentStep !== "upload") {
			buttons.push({
				label: "Back",
				onClick: goBack,
				intent: "outline",
				position: "left",
				disabled: state.isImporting,
			});
		}

		// Right side: Continue (preview step uses its own inline import button)
		if (currentStep !== "preview") {
			buttons.push({
				label: "Continue",
				onClick: goNext,
				intent: "primary",
				position: "right",
				disabled: !canContinue,
			});
		}

		return buttons;
	}, [
		currentStep,
		state.analysisResult,
		state.isImporting,
		state.importResult,
		canContinue,
		startOver,
		goBack,
		goNext,
	]);

	// --- Step heading info ---
	const stepHeading = useMemo(() => {
		// Hide heading when showing import result
		if (currentStep === "preview" && state.importResult) return null;

		switch (currentStep) {
			case "upload":
				return {
					title: "Upload your CSV file",
					subtitle: "Upload a CSV file with your client data. Our AI will automatically detect columns and map them to the correct fields.",
				};
			case "map":
				return {
					title: "Map columns",
					subtitle: `Match your CSV columns to client fields. ${state.file?.name ?? "CSV file"}`,
				};
			case "review":
				return {
					title: "Review data",
					subtitle: "Review your import data for errors and duplicates before proceeding.",
				};
			case "preview":
				return {
					title: "Preview import",
					subtitle: "Review the transformed data before importing.",
				};
			default:
				return null;
		}
	}, [currentStep, state.file?.name, state.importResult]);

	// --- Render step content ---
	const renderStep = () => {
		switch (currentStep) {
			case "upload":
				return (
					<StepUpload
						isAnalyzing={state.isAnalyzing}
						analysisResult={state.analysisResult}
						onFileSelect={handleFileSelect}
						analysisError={analysisError}
						onRetryAnalysis={handleRetryAnalysis}
						onClearFile={handleClearFile}
						onProceedUnmapped={handleProceedUnmapped}
					/>
				);
			case "map":
				if (!state.analysisResult) return null;
				return (
					<StepMapColumns
						fileName={state.file?.name ?? "CSV file"}
						mappings={state.mappings || []}
						analysisResult={state.analysisResult}
						selectedColumn={selectedMappingColumn}
						onMappingChange={handleMappingChange}
						onSelectColumn={setSelectedMappingColumn}
						manualOverrides={manualOverrides}
						unmappedRequiredFields={unmappedRequiredFields}
					/>
				);
			case "review":
				if (!state.fileContent) return null;
				return (
					<StepReviewValues
						fileContent={state.fileContent}
						mappings={state.mappings || []}
						reviewSkippedRows={state.reviewSkippedRows ?? new Set()}
						setRowSkip={setRowSkip}
						initReviewSkippedRows={initReviewSkippedRows}
					/>
				);
			case "preview":
				if (!state.fileContent || !state.analysisResult) return null;
				return (
					<StepPreviewImport
						fileContent={state.fileContent}
						mappings={state.mappings || []}
						isImporting={state.isImporting ?? false}
						importResult={state.importResult ?? null}
						onImport={handleImportData}
					/>
				);
			default:
				return null;
		}
	};

	return (
		<div className="flex flex-col h-[calc(100dvh-3.5rem)]">
			{/* Step navigation */}
			<div className="border-b border-border px-6 py-4 bg-background shrink-0">
				<ImportStepNav
					currentStep={currentStep}
					onStepClick={navigateTo}
				/>
			</div>

			{/* Step content */}
			<div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 pb-24">
				{/* Step heading - consistent position across all steps */}
				{stepHeading && (
					<div className="space-y-1 mb-6">
						<h2 className="text-xl font-semibold text-foreground">{stepHeading.title}</h2>
						<p className="text-sm text-muted-foreground">{stepHeading.subtitle}</p>
					</div>
				)}
				{renderStep()}
			</div>

			{/* Sticky footer */}
			{!state.importResult && (
				<StickyFormFooter buttons={footerButtons} />
			)}
		</div>
	);
}
