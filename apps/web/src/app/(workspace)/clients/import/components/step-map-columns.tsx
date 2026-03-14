"use client";

import { useMemo } from "react";
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
}

export function StepMapColumns({
	fileName,
	mappings,
	analysisResult,
	selectedColumn,
	onMappingChange,
	onSelectColumn,
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

				{/* Header row */}
				<div className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
					<div className="flex-1">File column</div>
					<div className="w-4" />
					<div className="flex-1">OneTool attribute</div>
				</div>

				{/* Mapping rows */}
				<div className="space-y-2">
					{mappings.map((mapping) => (
						<ColumnMappingRow
							key={mapping.csvColumn}
							csvColumn={mapping.csvColumn}
							schemaField={mapping.schemaField}
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
