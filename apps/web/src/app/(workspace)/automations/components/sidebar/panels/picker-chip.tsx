"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * The chip a resource picker (a record/relation field, or a variable) renders
 * inside its trigger to show the current selection — the Salesforce-style
 * outlined pill shared by filter-groups-editor's FieldPicker and the flat
 * field-picker Selects across the config panels.
 */
export function PickerChip({
	label,
	icon: Icon,
	className,
}: {
	label: React.ReactNode;
	/** Optional leading icon (e.g. Braces for a variable). */
	icon?: React.ComponentType<{ className?: string }>;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"flex min-w-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs",
				className
			)}
		>
			{Icon && <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />}
			<span className="truncate">{label}</span>
		</span>
	);
}
