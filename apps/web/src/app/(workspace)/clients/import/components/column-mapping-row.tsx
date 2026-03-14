"use client";

import { ArrowRight } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";
import { cn } from "@/lib/utils";

interface ColumnMappingRowProps {
	csvColumn: string;
	schemaField: string;
	isSelected: boolean;
	usedSchemaFields: Set<string>;
	onMappingChange: (csvColumn: string, newSchemaField: string) => void;
	onSelect: (csvColumn: string) => void;
}

const SKIP_VALUE = "__skip__";

export function ColumnMappingRow({
	csvColumn,
	schemaField,
	isSelected,
	usedSchemaFields,
	onMappingChange,
	onSelect,
}: ColumnMappingRowProps) {
	const fieldEntries = Object.entries(CLIENT_SCHEMA_FIELDS);

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
						{fieldEntries.map(([name, info]) => {
							const isUsedElsewhere =
								usedSchemaFields.has(name) && schemaField !== name;
							return (
								<SelectItem
									key={name}
									value={name}
									disabled={isUsedElsewhere}
								>
									<span className={cn(isUsedElsewhere && "opacity-50")}>
										{name}
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
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
