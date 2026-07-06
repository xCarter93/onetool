"use client";

import { cn } from "@/lib/utils";

interface ReviewSummaryBarProps {
	totalRows: number;
	validCount: number;
	errorCount: number;
	duplicateCount: number;
	skippedCount: number;
	resultsMode?: {
		importedCount: number;
		failedCount: number;
		skippedCount: number;
	};
}

function StatCard({
	dotClass,
	label,
	muted,
}: {
	dotClass: string;
	label: React.ReactNode;
	muted?: boolean;
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm">
			<span className={cn("size-2 shrink-0 rounded-full", dotClass)} />
			<span className={cn("truncate", muted && "text-muted-foreground")}>{label}</span>
		</div>
	);
}

export function ReviewSummaryBar({
	totalRows,
	validCount,
	errorCount,
	duplicateCount,
	skippedCount,
	resultsMode,
}: ReviewSummaryBarProps) {
	if (resultsMode) {
		return (
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard
					dotClass="bg-muted-foreground/50"
					muted
					label={`${totalRows} row${totalRows !== 1 ? "s" : ""}`}
				/>
				<StatCard
					dotClass="bg-success"
					label={`${resultsMode.importedCount} imported`}
				/>
				<StatCard
					dotClass="bg-destructive"
					label={`${resultsMode.failedCount} failed`}
				/>
				<StatCard
					dotClass="bg-muted-foreground/50"
					muted
					label={`${resultsMode.skippedCount} skipped`}
				/>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatCard
				dotClass="bg-muted-foreground/50"
				muted
				label={`${totalRows} row${totalRows !== 1 ? "s" : ""}`}
			/>
			<StatCard dotClass="bg-success" label={`${validCount} valid`} />
			<StatCard
				dotClass="bg-warning"
				label={
					<>
						{duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""}
						{skippedCount > 0 && (
							<span className="text-muted-foreground">
								{" "}({skippedCount} will skip)
							</span>
						)}
					</>
				}
			/>
			<StatCard
				dotClass="bg-destructive"
				label={
					<>
						{errorCount} error{errorCount !== 1 ? "s" : ""}
						{errorCount > 0 && (
							<span className="text-muted-foreground"> (must fix)</span>
						)}
					</>
				}
			/>
		</div>
	);
}
