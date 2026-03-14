"use client";

import { CsvUploadZone } from "@/app/(workspace)/clients/components/csv-upload-zone";
import { CsvSchemaGuide } from "@/app/(workspace)/clients/components/csv-schema-guide";
import { Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import type { CsvAnalysisResult } from "@/types/csv-import";

interface StepUploadProps {
	isAnalyzing: boolean;
	analysisResult: CsvAnalysisResult | null;
	onFileSelect: (file: File, content: string) => void;
}

export function StepUpload({
	isAnalyzing,
	analysisResult,
	onFileSelect,
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
