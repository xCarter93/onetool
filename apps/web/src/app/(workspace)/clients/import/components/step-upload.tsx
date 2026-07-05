"use client";

import { CsvUploadZone } from "@/app/(workspace)/clients/components/csv-upload-zone";
import { Button } from "@/components/ui/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/components/reui/alert";
import {
	Loader2,
	CheckCircle2,
	FileSpreadsheet,
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
		<div className="mx-auto max-w-2xl space-y-6">
			<CsvUploadZone onFileSelect={onFileSelect} disabled={isAnalyzing} />

			{isAnalyzing && (
				<Alert variant="info">
					<Loader2 className="animate-spin" />
					<AlertTitle>Analyzing your CSV file...</AlertTitle>
					<AlertDescription>
						Our AI is detecting columns and mapping fields
					</AlertDescription>
				</Alert>
			)}

			{analysisError && !isAnalyzing && (
				<Alert variant="destructive">
					<AlertTriangle />
					<AlertTitle>AI analysis failed</AlertTitle>
					<AlertDescription>
						<p>{analysisError}</p>
						<div className="flex flex-wrap gap-2 mt-2">
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
					</AlertDescription>
				</Alert>
			)}

			{analysisResult && !isAnalyzing && (
				<Alert variant="success">
					<CheckCircle2 />
					<AlertTitle>Analysis complete</AlertTitle>
					<AlertDescription>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
							<span className="flex items-center gap-1">
								<FileSpreadsheet className="w-3.5 h-3.5" />
								{analysisResult.detectedFields.length} columns detected
							</span>
							<span>
								{Math.round(analysisResult.confidence * 100)}% confidence
							</span>
						</div>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
