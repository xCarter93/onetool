"use client";

import { useMemo } from "react";
import { ColumnMappingRow } from "./column-mapping-row";
import { DataPreviewPanel } from "./data-preview-panel";
import { Badge } from "@/components/reui/badge";
import type { FieldMapping, CsvAnalysisResult } from "@/types/csv-import";

interface StepMapColumnsProps {
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
		(m) => m.schemaField !== "__skip__" && m.confidence >= 0.7,
	).length;
	const lowConf = mapped - highConf;

	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border py-3 text-sm text-muted-foreground">
			<span>
				<span className="font-medium text-foreground">{mapped}</span> of{" "}
				<span className="font-medium text-foreground">{total}</span> columns
				mapped
			</span>
			{highConf > 0 && (
				<Badge variant="success-light" size="sm">
					{highConf} high confidence
				</Badge>
			)}
			{lowConf > 0 && (
				<Badge variant="warning-light" size="sm">
					{lowConf} low confidence
				</Badge>
			)}
			{skipped > 0 && (
				<Badge variant="outline" size="sm">
					{skipped} skipped
				</Badge>
			)}
		</div>
	);
}

export function StepMapColumns({
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

	// Map each CSV column to the schema field the AI originally suggested
	const originalSuggestions = useMemo(() => {
		const map = new Map<string, string>();
		for (const f of analysisResult.detectedFields) {
			map.set(f.csvColumn, f.schemaField);
		}
		return map;
	}, [analysisResult.detectedFields]);

	return (
		<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
			{/* Left panel - column mapping list */}
			<div className="min-w-0 space-y-4">
				{/* Summary banner */}
				<MappingSummaryBanner mappings={mappings} />

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
							originalSuggestion={originalSuggestions.get(mapping.csvColumn)}
							unmappedRequiredFields={unmappedRequiredFields}
						/>
					))}
				</div>
			</div>

			{/* Right panel - data preview (offset to align with first mapping row) */}
			<div className="min-w-0 border-t border-border pt-4 xl:sticky xl:top-0 xl:max-h-[calc(100vh-16rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
				<DataPreviewPanel
					selectedColumn={selectedColumn}
					mappings={mappings}
					analysisResult={analysisResult}
				/>
			</div>
		</div>
	);
}
