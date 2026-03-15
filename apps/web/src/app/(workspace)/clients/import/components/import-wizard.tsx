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
				return (
					state.analysisResult?.validation.isValid ||
					(state.analysisResult?.validation.errors.length === 0)
				);
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

		// Right side: Continue / Import Data
		if (currentStep === "preview") {
			if (!state.importResult) {
				buttons.push({
					label: state.isImporting ? "Importing..." : "Import Data",
					onClick: handleImportData,
					intent: "primary",
					position: "right",
					disabled: !canContinue,
					isLoading: state.isImporting,
				});
			}
		} else {
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
		handleImportData,
	]);

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
				if (!state.analysisResult) return null;
				return (
					<StepReviewValues
						mappings={state.mappings || []}
						analysisResult={state.analysisResult}
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
		<div className="flex flex-col h-full">
			{/* Step navigation */}
			<div className="border-b border-border px-6 py-4 bg-background">
				<ImportStepNav
					currentStep={currentStep}
					onStepClick={navigateTo}
				/>
			</div>

			{/* Step content */}
			<div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
				{renderStep()}
			</div>

			{/* Sticky footer */}
			{!state.importResult && (
				<StickyFormFooter buttons={footerButtons} />
			)}
		</div>
	);
}
