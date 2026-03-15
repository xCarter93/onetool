"use client";

import { useMemo, type ReactNode } from "react";
import { ColumnMappingRow } from "./column-mapping-row";
import { DataPreviewPanel } from "./data-preview-panel";
import type { FieldMapping, CsvAnalysisResult } from "@/types/csv-import";

interface StepMapColumnsProps {
	fileName: string;
	mappings: FieldMapping[];
	analysisResult: CsvAnalysisResult;
	selectedColumn: string | null;
	onMappingChange: (csvColumn: string, newSchemaField: string) => void;
	onSelectColumn: (csvColumn: string) => void;
	manualOverrides: Set<string>;
	unmappedRequiredFields: Set<string>;
}

function MappingSummaryBanner({ mappings }: { mappings: FieldMapping[] }) {
	const total = mappings.length;
	const skipped = mappings.filter((m) => m.schemaField === "__skip__").length;
	const mapped = total - skipped;
	const highConf = mappings.filter(
		(m) => m.schemaField !== "__skip__" && m.confidence >= 0.7
	).length;
	const lowConf = mapped - highConf;

	const parts: ReactNode[] = [];

	if (highConf > 0) {
		parts.push(
			<span key="high" className="text-green-600 dark:text-green-400 font-medium">
				{highConf} high confidence
			</span>
		);
	}
	if (lowConf > 0) {
		parts.push(
			<span key="low" className="text-amber-600 dark:text-amber-400 font-medium">
				{lowConf} low confidence
			</span>
		);
	}
	if (skipped > 0) {
		parts.push(
			<span key="skipped" className="font-medium">
				{skipped} skipped
			</span>
		);
	}

	return (
		<div className="px-4 py-3 bg-muted/30 border border-border rounded-lg text-sm text-muted-foreground">
			<span className="font-medium text-foreground">{mapped}</span> of{" "}
			<span className="font-medium text-foreground">{total}</span> columns mapped
			{parts.length > 0 && (
				<>
					{" "}({parts.map((p, i) => (
						<span key={i}>
							{i > 0 && ", "}
							{p}
						</span>
					))})
				</>
			)}
		</div>
	);
}

export function StepMapColumns({
	fileName,
	mappings,
	analysisResult,
	selectedColumn,
	onMappingChange,
	onSelectColumn,
	manualOverrides,
	unmappedRequiredFields,
}: StepMapColumnsProps) {
	// Track which schema fields are currently mapped (excluding __skip__)
	const usedSchemaFields = useMemo(() => {
		const used = new Set<string>();
		for (const m of mappings) {
			if (m.schemaField && m.schemaField !== "__skip__") {
				used.add(m.schemaField);
			}
		}
		return used;
	}, [mappings]);

	return (
		<div className="flex gap-6 h-full">
			{/* Left panel - column mapping list */}
			<div className="flex-1 min-w-0 space-y-4">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold text-foreground">Map columns</h2>
					<p className="text-sm text-muted-foreground">
						Match your CSV columns to client fields.{" "}
						<span className="font-medium text-foreground">{fileName}</span>
					</p>
				</div>

				{/* Summary banner */}
				<MappingSummaryBanner mappings={mappings} />

				{/* Inline required-field validation */}
				{unmappedRequiredFields.size > 0 && (
					<div className="px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm">
						<p className="text-red-700 dark:text-red-400 mb-2">
							The following required fields must be mapped to a CSV column before continuing:
						</p>
						<div className="flex flex-wrap gap-2">
							{[...unmappedRequiredFields].map((field) => (
								<span
									key={field}
									className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 text-xs font-medium"
								>
									{field}
									<span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-semibold uppercase leading-none">
										Required
									</span>
								</span>
							))}
						</div>
					</div>
				)}

				{/* Header row */}
				<div className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
					<div className="flex-1">File column</div>
					<div className="w-4" />
					<div className="flex-1">OneTool attribute</div>
					<div className="w-16" />
				</div>

				{/* Mapping rows */}
				<div className="space-y-2">
					{mappings.map((mapping) => (
						<ColumnMappingRow
							key={mapping.csvColumn}
							csvColumn={mapping.csvColumn}
							schemaField={mapping.schemaField}
							confidence={mapping.confidence}
							isManuallyOverridden={manualOverrides.has(mapping.csvColumn)}
							isSelected={selectedColumn === mapping.csvColumn}
							usedSchemaFields={usedSchemaFields}
							onMappingChange={onMappingChange}
							onSelect={onSelectColumn}
						/>
					))}
				</div>
			</div>

			{/* Right panel - data preview */}
			<div className="w-72 lg:w-80 shrink-0 border border-border rounded-lg bg-muted/10 sticky top-0 self-start max-h-[calc(100vh-16rem)] overflow-y-auto">
				<DataPreviewPanel
					selectedColumn={selectedColumn}
					mappings={mappings}
					analysisResult={analysisResult}
				/>
			</div>
		</div>
	);
}
