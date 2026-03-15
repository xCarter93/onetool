"use client";

import { CsvUploadZone } from "@/app/(workspace)/clients/components/csv-upload-zone";
import { CsvSchemaGuide } from "@/app/(workspace)/clients/components/csv-schema-guide";
import { downloadTemplateCsv } from "../utils/template-csv";
import { Button } from "@/components/ui/button";
import {
	Loader2,
	CheckCircle2,
	FileSpreadsheet,
	Download,
	AlertTriangle,
	RotateCcw,
	Upload,
	ArrowRight,
} from "lucide-react";
import type { CsvAnalysisResult } from "@/types/csv-import";

interface StepUploadProps {
	isAnalyzing: boolean;
	analysisResult: CsvAnalysisResult | null;
	analysisError?: string | null;
	onFileSelect: (file: File, content: string) => void;
	onRetryAnalysis?: () => void;
	onClearFile?: () => void;
	onProceedUnmapped?: () => void;
}

export function StepUpload({
	isAnalyzing,
	analysisResult,
	analysisError,
	onFileSelect,
	onRetryAnalysis,
	onClearFile,
	onProceedUnmapped,
}: StepUploadProps) {
	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="space-y-2">
				<h2 className="text-xl font-semibold text-foreground">Upload your CSV file</h2>
				<p className="text-sm text-muted-foreground">
					Upload a CSV file with your client data. Our AI will automatically
					detect columns and map them to the correct fields.
				</p>
			</div>

			<CsvUploadZone onFileSelect={onFileSelect} disabled={isAnalyzing} />

			<button
				type="button"
				onClick={() => void downloadTemplateCsv()}
				className="text-sm text-primary hover:underline cursor-pointer flex items-center gap-1.5"
			>
				<Download className="w-3.5 h-3.5" />
				Download template CSV
			</button>

			{isAnalyzing && (
				<div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
					<Loader2 className="w-5 h-5 text-primary animate-spin" />
					<div>
						<p className="text-sm font-medium text-foreground">Analyzing your CSV file...</p>
						<p className="text-xs text-muted-foreground">
							Our AI is detecting columns and mapping fields
						</p>
					</div>
				</div>
			)}

			{analysisError && !isAnalyzing && (
				<div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg space-y-3">
					<div className="flex items-start gap-3">
						<AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
						<div>
							<p className="text-sm font-medium text-foreground">AI analysis failed</p>
							<p className="text-xs text-muted-foreground mt-0.5">
								{analysisError}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2 ml-8">
						{onRetryAnalysis && (
							<Button intent="outline" size="sm" onPress={onRetryAnalysis}>
								<RotateCcw className="w-3.5 h-3.5 mr-1.5" />
								Try again
							</Button>
						)}
						{onClearFile && (
							<Button intent="outline" size="sm" onPress={onClearFile}>
								<Upload className="w-3.5 h-3.5 mr-1.5" />
								Upload different file
							</Button>
						)}
						{onProceedUnmapped && (
							<Button intent="plain" size="sm" onPress={onProceedUnmapped}>
								<ArrowRight className="w-3.5 h-3.5 mr-1.5" />
								Continue without AI mapping
							</Button>
						)}
					</div>
				</div>
			)}

			{analysisResult && !isAnalyzing && (
				<div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
					<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">Analysis complete</p>
						<div className="flex items-center gap-4 mt-1">
							<span className="text-xs text-muted-foreground flex items-center gap-1">
								<FileSpreadsheet className="w-3.5 h-3.5" />
								{analysisResult.detectedFields.length} columns detected
							</span>
							<span className="text-xs text-muted-foreground">
								{Math.round(analysisResult.confidence * 100)}% confidence
							</span>
						</div>
					</div>
				</div>
			)}

			<CsvSchemaGuide entityType="clients" />
		</div>
	);
}
