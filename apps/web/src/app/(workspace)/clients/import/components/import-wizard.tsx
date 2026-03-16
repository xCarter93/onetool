"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StickyFormFooter } from "@/components/shared/sticky-form-footer";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import { useImportWizard } from "../hooks/use-import-wizard";
import { ImportStepNav } from "./import-step-nav";
import { StepUpload } from "./step-upload";
import { StepMapColumns } from "./step-map-columns";
import { StepReviewValues } from "./step-review-values";

interface ImportWizardProps {
	embedded?: boolean;
	onComplete?: (result: { successCount: number }) => void;
}

export function ImportWizard({ embedded = false, onComplete }: ImportWizardProps = {}) {
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
	} = useImportWizard({
		embedded,
		source: embedded ? 'onboarding' : 'clients_page',
	});

	// --- Step guard: redirect to upload if state is missing (standalone only) ---
	useEffect(() => {
		if (!embedded && currentStep !== "upload" && !state.analysisResult) {
			router.replace("/clients/import?step=upload");
		}
	}, [embedded, currentStep, state.analysisResult, router]);

	// --- Notify host page when import completes in embedded mode ---
	useEffect(() => {
		if (embedded && state.importResult && onComplete) {
			onComplete({ successCount: state.importResult.successCount });
		}
	}, [embedded, state.importResult, onComplete]);

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
			default:
				return false;
		}
	}, [currentStep, state, unmappedRequiredFields]);

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

		// Right side: Continue (review step uses its own inline import button)
		if (currentStep !== "review") {
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
		canContinue,
		startOver,
		goBack,
		goNext,
	]);

	// --- Step heading info ---
	const stepHeading = useMemo(() => {
		// Hide heading when showing import result
		if (currentStep === "review" && state.importResult) return null;

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
					title: "Review & import",
					subtitle: "Review your data, fix errors, and import when ready.",
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
						isImporting={state.isImporting ?? false}
						importResult={state.importResult ?? null}
						importProgress={state.importProgress}
						onImport={handleImportData}
					/>
				);
			default:
				return null;
		}
	};

	// --- Render inline footer for embedded mode ---
	const renderInlineFooter = () => {
		if (currentStep === "review") return null;

		const leftButtons = footerButtons.filter((b) => b.position === "left");
		const rightButtons = footerButtons.filter((b) => b.position === "right");

		if (leftButtons.length === 0 && rightButtons.length === 0) return null;

		return (
			<div className="flex items-center justify-between gap-x-3 py-4 border-t border-border mt-4">
				<div className="flex items-center gap-x-3">
					{leftButtons.map((button) => (
						<StyledButton
							key={button.label}
							label={button.label}
							onClick={button.onClick}
							intent={button.intent}
							disabled={button.disabled}
							isLoading={button.isLoading}
						/>
					))}
				</div>
				<div className="flex items-center gap-x-3">
					{rightButtons.map((button) => (
						<StyledButton
							key={button.label}
							label={button.label}
							onClick={button.onClick}
							intent={button.intent}
							disabled={button.disabled}
							isLoading={button.isLoading}
						/>
					))}
				</div>
			</div>
		);
	};

	if (embedded) {
		return (
			<div className="flex flex-col">
				{/* Step content - no fixed height, no breadcrumbs */}
				<div className="px-6 py-6">
					{/* Step heading - consistent position across all steps */}
					{stepHeading && (
						<div className="space-y-1 mb-6">
							<h2 className="text-xl font-semibold text-foreground">{stepHeading.title}</h2>
							<p className="text-sm text-muted-foreground">{stepHeading.subtitle}</p>
						</div>
					)}
					{renderStep()}
				</div>

				{/* Inline footer - not sticky, not fixed */}
				<div className="px-6">
					{renderInlineFooter()}
				</div>
			</div>
		);
	}

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

			{/* Sticky footer - hidden on review step (it has its own import button) */}
			{currentStep !== "review" && (
				<StickyFormFooter buttons={footerButtons} />
			)}
		</div>
	);
}
