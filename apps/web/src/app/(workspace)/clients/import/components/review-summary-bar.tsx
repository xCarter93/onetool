"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface ReviewSummaryBarProps {
	totalRows: number;
	validCount: number;
	errorCount: number;
	duplicateCount: number;
	skippedCount: number;
}

export function ReviewSummaryBar({
	totalRows,
	validCount,
	errorCount,
	duplicateCount,
	skippedCount,
}: ReviewSummaryBarProps) {
	return (
		<div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
			<span className="font-medium text-foreground">
				{totalRows} row{totalRows !== 1 ? "s" : ""}
			</span>
			<span className="text-muted-foreground/40">|</span>
			<span className="inline-flex items-center gap-1.5">
				<CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
				{validCount} valid
			</span>
			<span className="text-muted-foreground/40">|</span>
			<span className="inline-flex items-center gap-1.5">
				<AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
				{duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""}
				{skippedCount > 0 && (
					<span className="text-muted-foreground">
						({skippedCount} will skip)
					</span>
				)}
			</span>
			<span className="text-muted-foreground/40">|</span>
			<span className="inline-flex items-center gap-1.5">
				<XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
				{errorCount} error{errorCount !== 1 ? "s" : ""}
				{errorCount > 0 && (
					<span className="text-muted-foreground">(must fix)</span>
				)}
			</span>
		</div>
	);
}
