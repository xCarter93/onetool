"use client";

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FieldMapping, CsvAnalysisResult } from "@/types/csv-import";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface StepReviewValuesProps {
	mappings: FieldMapping[];
	analysisResult: CsvAnalysisResult;
}

export function StepReviewValues({
	mappings,
	analysisResult,
}: StepReviewValuesProps) {
	const activeMappings = mappings.filter((m) => m.schemaField !== "__skip__");
	const { validation } = analysisResult;

	// Check which required fields are mapped
	const requiredFields = Object.entries(CLIENT_SCHEMA_FIELDS)
		.filter(([, info]) => info.required)
		.map(([name]) => name);

	const mappedRequired = requiredFields.filter((f) =>
		activeMappings.some((m) => m.schemaField === f)
	);
	const missingRequired = requiredFields.filter(
		(f) => !activeMappings.some((m) => m.schemaField === f)
	);

	const rowCount = analysisResult.sampleData?.length ?? 0;

	return (
		<div className="max-w-3xl mx-auto space-y-6">
			<div className="space-y-2">
				<h2 className="text-xl font-semibold text-foreground">Review mappings</h2>
				<p className="text-sm text-muted-foreground">
					Confirm your column mappings before importing.
				</p>
			</div>

			{/* Validation summary */}
			{validation.errors.length > 0 && (
				<div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg space-y-2">
					<div className="flex items-center gap-2">
						<AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
						<span className="text-sm font-medium text-red-800 dark:text-red-200">
							{validation.errors.length} error{validation.errors.length !== 1 && "s"} found
						</span>
					</div>
					<ul className="space-y-1 ml-6">
						{validation.errors.map((err, i) => (
							<li key={i} className="text-sm text-red-700 dark:text-red-300">
								<span className="font-medium">{err.field}:</span> {err.message}
							</li>
						))}
					</ul>
				</div>
			)}

			{validation.warnings.length > 0 && (
				<div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg space-y-2">
					<div className="flex items-center gap-2">
						<AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
						<span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
							{validation.warnings.length} warning{validation.warnings.length !== 1 && "s"}
						</span>
					</div>
					<ul className="space-y-1 ml-6">
						{validation.warnings.map((warn, i) => (
							<li key={i} className="text-sm text-yellow-700 dark:text-yellow-300">
								<span className="font-medium">{warn.field}:</span> {warn.message}
							</li>
						))}
					</ul>
				</div>
			)}

			{missingRequired.length > 0 && (
				<div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
					<div className="flex items-center gap-2">
						<AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
						<span className="text-sm font-medium text-red-800 dark:text-red-200">
							Missing required fields: {missingRequired.join(", ")}
						</span>
					</div>
				</div>
			)}

			{validation.isValid && missingRequired.length === 0 && (
				<div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
					<div className="flex items-center gap-2">
						<CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
						<span className="text-sm font-medium text-green-800 dark:text-green-200">
							All validations passed
						</span>
					</div>
				</div>
			)}

			{/* Stats row */}
			<div className="flex items-center gap-4 text-sm text-muted-foreground">
				<span>{activeMappings.length} columns mapped</span>
				<span>{mappedRequired.length}/{requiredFields.length} required fields</span>
				<span>{rowCount > 0 ? `~${rowCount} rows` : "Row count unavailable"}</span>
			</div>

			{/* Mapping table */}
			<div className="overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>CSV Column</TableHead>
							<TableHead>Target Field</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Sample Value</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{activeMappings.map((mapping) => {
							const fieldDef =
								CLIENT_SCHEMA_FIELDS[
									mapping.schemaField as keyof typeof CLIENT_SCHEMA_FIELDS
								];
							return (
								<TableRow key={mapping.csvColumn}>
									<TableCell className="font-medium">
										{mapping.csvColumn}
									</TableCell>
									<TableCell>
										<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
											{mapping.schemaField}
										</code>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<span className="text-xs">{mapping.dataType}</span>
											{fieldDef?.required && (
												<Badge variant="default" className="text-xs py-0">
													Required
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground text-xs font-mono max-w-48 truncate">
										{mapping.sampleValue !== undefined
											? String(mapping.sampleValue)
											: "---"}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
