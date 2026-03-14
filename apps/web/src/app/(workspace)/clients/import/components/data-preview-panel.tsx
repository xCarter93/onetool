"use client";

import { Eye } from "lucide-react";
import type { FieldMapping, CsvAnalysisResult } from "@/types/csv-import";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import { Badge } from "@/components/ui/badge";

interface DataPreviewPanelProps {
	selectedColumn: string | null;
	mappings: FieldMapping[];
	analysisResult: CsvAnalysisResult;
}

export function DataPreviewPanel({
	selectedColumn,
	mappings,
	analysisResult,
}: DataPreviewPanelProps) {
	if (!selectedColumn) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-center p-6">
				<div className="rounded-full bg-muted p-3 mb-3">
					<Eye className="w-6 h-6 text-muted-foreground" />
				</div>
				<p className="text-sm font-medium text-muted-foreground">
					Select a column to preview
				</p>
				<p className="text-xs text-muted-foreground mt-1">
					Click a row on the left to see sample values
				</p>
			</div>
		);
	}

	const mapping = mappings.find((m) => m.csvColumn === selectedColumn);
	const schemaField = mapping?.schemaField;
	const fieldDef =
		schemaField && schemaField !== "__skip__"
			? CLIENT_SCHEMA_FIELDS[schemaField as keyof typeof CLIENT_SCHEMA_FIELDS]
			: null;

	// Get sample values from analysisResult.sampleData
	const sampleValues: string[] = [];
	if (analysisResult.sampleData) {
		for (const row of analysisResult.sampleData.slice(0, 10)) {
			const val = row[selectedColumn];
			if (val !== undefined && val !== null && val !== "") {
				sampleValues.push(String(val));
			}
		}
	}

	return (
		<div className="space-y-4 p-4">
			<div>
				<h3 className="text-sm font-semibold text-foreground">{selectedColumn}</h3>
				<p className="text-xs text-muted-foreground mt-0.5">CSV Column</p>
			</div>

			{schemaField && schemaField !== "__skip__" && (
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Mapped to:</span>
						<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
							{schemaField}
						</code>
					</div>
					{fieldDef && (
						<div className="flex items-center gap-2">
							<Badge variant={fieldDef.required ? "default" : "outline"} className="text-xs">
								{fieldDef.required ? "Required" : "Optional"}
							</Badge>
							<span className="text-xs text-muted-foreground">{fieldDef.type}</span>
						</div>
					)}
					{fieldDef && "options" in fieldDef && fieldDef.options && (
						<div className="text-xs text-muted-foreground">
							<span className="font-medium">Valid options: </span>
							{fieldDef.options.join(", ")}
						</div>
					)}
				</div>
			)}

			{schemaField === "__skip__" && (
				<p className="text-xs text-muted-foreground italic">
					This column will not be imported
				</p>
			)}

			<div className="border-t border-border pt-3">
				<h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
					Sample values
				</h4>
				{sampleValues.length > 0 ? (
					<ul className="space-y-1.5">
						{sampleValues.map((val, i) => (
							<li
								key={i}
								className="text-sm text-foreground bg-muted/40 rounded px-2.5 py-1.5 font-mono text-xs break-all"
							>
								{val}
							</li>
						))}
					</ul>
				) : (
					<p className="text-xs text-muted-foreground italic">
						No sample values available
					</p>
				)}
			</div>
		</div>
	);
}
