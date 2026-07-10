"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Badge } from "@/components/reui/badge";
import { Separator } from "@/components/ui/separator";
import { StyledButton } from "@/components/ui/styled/styled-button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CsvSchemaGuideDrawer } from "@/app/(workspace)/clients/components/csv-schema-guide";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import { useImportWizard } from "../hooks/use-import-wizard";
import { downloadTemplateCsv } from "../utils/template-csv";
import { ImportStepNav } from "./import-step-nav";
import { StepUpload } from "./step-upload";
import { StepMapColumns } from "./step-map-columns";
import { StepReviewValues, type ReviewActionState } from "./step-review-values";

interface ImportWizardProps {
	embedded?: boolean;
	onComplete?: (result: { successCount: number }) => void;
}

export function ImportWizard({ embedded = false, onComplete }: ImportWizardProps = {}) {
	const router = useRouter();
	const [reviewAction, setReviewAction] = useState<ReviewActionState | null>(null);
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

	// --- Secondary footer buttons (Start over / Back), grouped left of the primary ---
	const secondaryButtons = useMemo(() => {
		const buttons: Array<{
			label: string;
			onClick: () => void;
			intent: "outline" | "plain";
			disabled?: boolean;
			icon?: ReactNode;
		}> = [];

		if (currentStep !== "upload" || state.analysisResult) {
			buttons.push({
				label: "Start over",
				onClick: startOver,
				intent: "plain",
				disabled: state.isImporting,
			});
		}

		if (currentStep !== "upload") {
			buttons.push({
				label: "Back",
				onClick: goBack,
				intent: "outline",
				disabled: state.isImporting,
				icon: <ArrowLeft className="size-4" />,
			});
		}

		return buttons;
	}, [currentStep, state.analysisResult, state.isImporting, startOver, goBack]);

	// --- Contextual footer hint (left side, like the ReUI block) ---
	const footerHint = useMemo(() => {
		switch (currentStep) {
			case "upload":
				return "Upload a CSV file to get started.";
			case "map":
				return "Match your columns, then continue.";
			case "review":
				if (reviewAction?.isResultsMode) return "Import complete.";
				if (reviewAction?.isImporting) return "Importing your clients…";
				return "Review your rows and fix any errors before importing.";
			default:
				return "";
		}
	}, [currentStep, reviewAction]);

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
						onActionStateChange={setReviewAction}
					/>
				);
			default:
				return null;
		}
	};

	// --- Right-side footer action ---
	const renderRightAction = () => {
		// Steps 1-2: a simple Continue button.
		if (currentStep !== "review") {
			return (
				<StyledButton
					label="Continue"
					onClick={goNext}
					intent="primary"
					disabled={!canContinue}
				/>
			);
		}

		// Review step: import / results button (state lifted from StepReviewValues).
		if (!reviewAction) {
			return <StyledButton label="Import clients" intent="primary" disabled />;
		}
		if (reviewAction.isResultsMode) {
			// Embedded onboarding swaps the wizard out via onComplete — no button needed.
			if (embedded) return null;
			return (
				<StyledButton
					label="Go to Clients"
					intent="primary"
					onClick={() => router.push("/clients")}
				/>
			);
		}
		if (reviewAction.isImporting) {
			return (
				<StyledButton label="Importing..." intent="primary" isLoading disabled />
			);
		}

		const count = reviewAction.importableCount;
		const label = `Import ${count} client${count !== 1 ? "s" : ""}`;
		if (reviewAction.hasValidationErrors) {
			return (
				<Tooltip>
					<TooltipTrigger render={<span className="inline-flex" />}>
						<StyledButton label={label} intent="primary" disabled />
					</TooltipTrigger>
					<TooltipContent>
						{reviewAction.validationErrorCount} validation error
						{reviewAction.validationErrorCount !== 1 ? "s" : ""} found. Fix errors
						before importing.
					</TooltipContent>
				</Tooltip>
			);
		}
		return (
			<StyledButton
				label={label}
				intent="primary"
				onClick={reviewAction.triggerImport}
				disabled={count === 0}
			/>
		);
	};

	const rightAction = renderRightAction();

	// Header description: the file once uploaded, otherwise a short hint.
	const headerDescription = state.file?.name ?? "Bulk-import your clients from a CSV file";
	// Step number for tab/panel ARIA wiring (matches the stepper trigger ids).
	const activeStepNumber = { upload: 1, map: 2, review: 3 }[currentStep];

	const wizard = (
		<Frame variant="default" className={cn("w-full", !embedded && "h-full")}>
			{/* Header sits on the frame (chrome), like the /automations pattern */}
			<FrameHeader className="shrink-0 flex-row items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-px">
					<FrameTitle>Import clients</FrameTitle>
					<FrameDescription className="truncate text-xs">
						{headerDescription}
					</FrameDescription>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{currentStep === "upload" && (
						<>
							<StyledButton
								intent="plain"
								size="sm"
								showArrow={false}
								icon={<Download className="size-4" />}
								label="Template"
								onClick={() => void downloadTemplateCsv()}
							/>
							<CsvSchemaGuideDrawer entityType="clients" />
						</>
					)}
					<Badge variant="primary-light" size="lg" radius="full">
						Clients
					</Badge>
				</div>
			</FrameHeader>

			{/* White content panel: step timeline (fixed) + scrollable step body */}
			<FramePanel className={cn("flex flex-col p-0 shadow-none!", !embedded && "min-h-0")}>
				<div className="shrink-0 px-5 py-5 sm:px-6">
					<ImportStepNav
						currentStep={currentStep}
						onStepClick={navigateTo}
						disabled={state.isImporting}
					/>
				</div>
				<Separator />
				<div
					id={`stepper-panel-${activeStepNumber}`}
					role="tabpanel"
					aria-labelledby={`stepper-tab-${activeStepNumber}`}
					className={cn(
						"px-5 py-6 sm:px-6",
						!embedded && "flex-1 min-h-0 overflow-y-auto"
					)}
				>
					{renderStep()}
				</div>
			</FramePanel>

			{/* Footer sits on the frame: hint on the left, actions on the right */}
			<FrameFooter className="shrink-0 flex-row items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
					<Flag className="size-4 shrink-0" />
					<span className="truncate">{footerHint}</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{secondaryButtons.map((button) => (
						<StyledButton
							key={button.label}
							label={button.label}
							onClick={button.onClick}
							intent={button.intent}
							disabled={button.disabled}
							showArrow={false}
							icon={button.icon}
						/>
					))}
					{rightAction}
				</div>
			</FrameFooter>
		</Frame>
	);

	if (embedded) {
		return wizard;
	}

	return (
		<div className="h-[calc(100dvh-7rem)] px-4 py-4 sm:px-6 sm:py-6">
			<div className="mx-auto h-full w-full max-w-7xl">{wizard}</div>
		</div>
	);
}
