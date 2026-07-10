"use client";

import React from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CLIENT_SCHEMA_FIELDS,
	PROJECT_SCHEMA_FIELDS,
	type EntityType,
	type FieldMapping,
	type ValidationResult,
} from "@/types/csv-import";

interface CsvMappingPreviewProps {
	entityType: EntityType;
	mappings: FieldMapping[];
	validation: ValidationResult;
	onMappingChange: (csvColumn: string, newSchemaField: string) => void;
}

export function CsvMappingPreview({
	entityType,
	mappings,
	validation,
	onMappingChange,
}: CsvMappingPreviewProps) {
	// Ensure validation has all required fields with defaults
	const safeValidation: ValidationResult = {
		isValid: validation?.isValid ?? false,
		errors: validation?.errors ?? [],
		warnings: validation?.warnings ?? [],
		missingRequiredFields: validation?.missingRequiredFields ?? [],
	};

	// Get available schema fields based on entity type
	const schemaFields =
		entityType === "clients" ? CLIENT_SCHEMA_FIELDS : PROJECT_SCHEMA_FIELDS;
	const schemaFieldNames = Object.keys(schemaFields);

	const getStatusIcon = (mapping: FieldMapping) => {
		if (mapping.isRequired && mapping.confidence < 0.8) {
			return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
		}
		if (mapping.confidence >= 0.9) {
			return <Check className="w-4 h-4 text-green-600" />;
		}
		if (mapping.confidence >= 0.7) {
			return <Check className="w-4 h-4 text-blue-600" />;
		}
		return <X className="w-4 h-4 text-red-600" />;
	};

	const getStatusColor = (mapping: FieldMapping) => {
		if (mapping.isRequired && mapping.confidence < 0.8) {
			return "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800";
		}
		if (mapping.confidence >= 0.9) {
			return "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800";
		}
		if (mapping.confidence >= 0.7) {
			return "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800";
		}
		return "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
	};

	return (
		<div className="space-y-4">
			{/* Validation Summary */}
			{(safeValidation.errors.length > 0 ||
				safeValidation.warnings.length > 0) && (
				<div className="space-y-2">
					{safeValidation.errors.length > 0 && (
						<div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
							<h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">
								Errors ({safeValidation.errors.length})
							</h4>
							<ul className="space-y-1">
								{safeValidation.errors.map((error, idx) => (
									<li
										key={idx}
										className="text-xs text-red-700 dark:text-red-300"
									>
										• {error.message}
									</li>
								))}
							</ul>
						</div>
					)}

					{safeValidation.warnings.length > 0 && (
						<div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
							<h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
								Warnings ({safeValidation.warnings.length})
							</h4>
							<ul className="space-y-1">
								{safeValidation.warnings.map((warning, idx) => (
									<li
										key={idx}
										className="text-xs text-yellow-700 dark:text-yellow-300"
									>
										• {warning.message}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}

			{/* Mappings Table */}
			<div className="border border-border rounded-lg overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-muted/50">
							<tr>
								<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									Status
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									CSV Column
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									Mapped Field
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									Sample Value
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									Confidence
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{mappings.map((mapping, idx) => (
								<tr
									key={idx}
									className={`transition-colors hover:bg-muted/30 ${getStatusColor(mapping)}`}
								>
									<td className="px-4 py-3">
										<div className="flex items-center justify-center">
											{getStatusIcon(mapping)}
										</div>
									</td>
									<td className="px-4 py-3">
										<span className="text-sm font-medium text-foreground">
											{mapping.csvColumn}
										</span>
									</td>
									<td className="px-4 py-3">
										<Select
											value={mapping.schemaField}
											onValueChange={(value) =>
												onMappingChange(
													mapping.csvColumn,
													typeof value === "string" ? value : ""
												)
											}
										>
											<SelectTrigger className="w-full max-w-xs bg-background">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{schemaFieldNames.map((fieldName) => (
													<SelectItem key={fieldName} value={fieldName}>
														{fieldName}
														{schemaFields[
															fieldName as keyof typeof schemaFields
														]?.required && (
															<span className="text-red-600 ml-1">*</span>
														)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</td>
									<td className="px-4 py-3">
										<span className="text-xs text-muted-foreground truncate max-w-xs block">
											{mapping.sampleValue !== null &&
											mapping.sampleValue !== undefined
												? String(mapping.sampleValue)
												: "-"}
										</span>
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
												<div
													className={`h-full transition-all ${
														mapping.confidence >= 0.9
															? "bg-green-600"
															: mapping.confidence >= 0.7
																? "bg-blue-600"
																: "bg-yellow-600"
													}`}
													style={{ width: `${mapping.confidence * 100}%` }}
												/>
											</div>
											<span className="text-xs text-muted-foreground min-w-[3ch]">
												{Math.round(mapping.confidence * 100)}%
											</span>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-6 text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					<Check className="w-4 h-4 text-green-600" />
					<span>High confidence (90%+)</span>
				</div>
				<div className="flex items-center gap-1">
					<Check className="w-4 h-4 text-blue-600" />
					<span>Good confidence (70-89%)</span>
				</div>
				<div className="flex items-center gap-1">
					<AlertTriangle className="w-4 h-4 text-yellow-600" />
					<span>Needs review</span>
				</div>
				<div className="flex items-center gap-1">
					<X className="w-4 h-4 text-red-600" />
					<span>Low confidence</span>
				</div>
			</div>
		</div>
	);
}
