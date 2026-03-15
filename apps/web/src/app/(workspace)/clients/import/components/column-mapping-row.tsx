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
			<div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
				<Check className="w-3 h-3" />
				<span>Manual</span>
			</div>
		);
	}

	if (state === "high") {
		return (
			<div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
				<span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400" />
				<span>High</span>
			</div>
		);
	}

	// low
	return (
		<div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
			<span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
			<span>Low</span>
		</div>
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
}: ColumnMappingRowProps) {
	const grouped = getFieldsByGroup(CLIENT_SCHEMA_FIELDS);
	const confidenceState = getConfidenceState(
		{ schemaField, confidence },
		isManuallyOverridden
	);

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
													<span className="text-red-500 ml-0.5">*</span>
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

			{/* Confidence indicator */}
			<div className="w-16 shrink-0 flex justify-end">
				<ConfidenceIndicator state={confidenceState} />
			</div>
		</div>
	);
}
