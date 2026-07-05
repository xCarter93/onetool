"use client";

import { ArrowRight, Check } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/reui/badge";
import { CLIENT_SCHEMA_FIELDS, getFieldsByGroup } from "@/types/csv-import";
import { cn } from "@/lib/utils";
import { getConfidenceState, type ConfidenceState } from "../utils/mapping-utils";

interface ColumnMappingRowProps {
	csvColumn: string;
	schemaField: string;
	confidence: number;
	isManuallyOverridden: boolean;
	isSelected: boolean;
	usedSchemaFields: Set<string>;
	onMappingChange: (csvColumn: string, newSchemaField: string) => void;
	onSelect: (csvColumn: string) => void;
	originalSuggestion?: string;
	unmappedRequiredFields?: Set<string>;
}

const SKIP_VALUE = "__skip__";

/**
 * Strips the namespace prefix from a field name for display.
 * e.g., "contact.firstName" -> "firstName", "companyName" -> "companyName"
 */
function displayFieldName(fieldName: string): string {
	const dotIndex = fieldName.indexOf(".");
	return dotIndex >= 0 ? fieldName.slice(dotIndex + 1) : fieldName;
}

const GROUP_LABELS: Record<string, string> = {
	client: "Client",
	contact: "Contact",
	property: "Property",
};

function ConfidenceIndicator({ state }: { state: ConfidenceState }) {
	if (state === "skipped") return null;

	if (state === "manual") {
		return (
			<Badge variant="info-light" size="sm">
				<Check className="size-3" />
				Manual
			</Badge>
		);
	}

	if (state === "high") {
		return (
			<Badge variant="success-light" size="sm">
				High
			</Badge>
		);
	}

	// low
	return (
		<Badge variant="warning-light" size="sm">
			Low
		</Badge>
	);
}

export function ColumnMappingRow({
	csvColumn,
	schemaField,
	confidence,
	isManuallyOverridden,
	isSelected,
	usedSchemaFields,
	onMappingChange,
	onSelect,
	originalSuggestion,
	unmappedRequiredFields,
}: ColumnMappingRowProps) {
	const grouped = getFieldsByGroup(CLIENT_SCHEMA_FIELDS);
	const confidenceState = getConfidenceState(
		{ schemaField, confidence },
		isManuallyOverridden
	);

	// Show a red "Required" badge when the row is skipped but the AI originally
	// suggested a required field that is still unmapped.
	const showRequiredBadge =
		schemaField === SKIP_VALUE &&
		originalSuggestion !== undefined &&
		unmappedRequiredFields !== undefined &&
		unmappedRequiredFields.has(originalSuggestion) &&
		(CLIENT_SCHEMA_FIELDS as Record<string, { required: boolean }>)[originalSuggestion]?.required === true;

	return (
		<div
			className={cn(
				"flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors",
				isSelected
					? "border-primary/40 bg-primary/5"
					: "border-border hover:bg-muted/30"
			)}
			onClick={() => onSelect(csvColumn)}
		>
			{/* CSV column name */}
			<div className="flex-1 min-w-0">
				<span className="text-sm font-medium text-foreground truncate block">
					{csvColumn}
				</span>
			</div>

			{/* Arrow */}
			<ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

			{/* Schema field select */}
			<div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
				<Select
					value={schemaField}
					onValueChange={(value) => onMappingChange(csvColumn, value)}
				>
					<SelectTrigger className="h-8 text-sm">
						<SelectValue placeholder="Select field..." />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={SKIP_VALUE}>
							<span className="text-muted-foreground italic">Do not import</span>
						</SelectItem>
						{(
							Object.entries(grouped) as [
								string,
								[string, { required: boolean }][],
							][]
						).map(([groupKey, fields]) => (
							<SelectGroup key={groupKey}>
								<SelectLabel>{GROUP_LABELS[groupKey] ?? groupKey}</SelectLabel>
								{fields.map(([name, info]) => {
									const isUsedElsewhere =
										usedSchemaFields.has(name) && schemaField !== name;
									return (
										<SelectItem
											key={name}
											value={name}
											disabled={isUsedElsewhere}
										>
											<span className={cn(isUsedElsewhere && "opacity-50")}>
												<span className="text-xs text-muted-foreground mr-1">
													{GROUP_LABELS[groupKey]}:
												</span>
												{displayFieldName(name)}
												{info.required && (
													<span className="text-destructive ml-0.5">*</span>
												)}
												{isUsedElsewhere && (
													<span className="text-xs text-muted-foreground ml-1">
														(already mapped)
													</span>
												)}
											</span>
										</SelectItem>
									);
								})}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Confidence indicator or Required badge */}
			<div className="w-16 shrink-0 flex justify-end">
				{showRequiredBadge ? (
					<Badge variant="destructive-light" size="sm" className="uppercase">
						Required
					</Badge>
				) : (
					<ConfidenceIndicator state={confidenceState} />
				)}
			</div>
		</div>
	);
}
