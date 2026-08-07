"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SelectionActionsProps {
	count: number;
	onDuplicate: () => void;
	onDelete: () => void;
	onClear: () => void;
	className?: string;
}

/**
 * Inline action group for the line-items frame header, shown in place of the
 * save indicator while rows are selected. Replaces the old floating pill.
 */
export function SelectionActions({
	count,
	onDuplicate,
	onDelete,
	onClear,
	className,
}: SelectionActionsProps) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<span className="text-xs font-normal text-muted-foreground tabular-nums">
				{count} selected
			</span>
			<Button
				variant="outline"
				size="sm"
				onClick={onDuplicate}
				aria-label={`Duplicate ${count} selected ${count === 1 ? "line" : "lines"}`}
			>
				<Copy className="h-4 w-4" aria-hidden="true" />
				Duplicate
			</Button>
			<Button
				variant="destructive"
				size="sm"
				onClick={onDelete}
				aria-label={`Delete ${count} selected ${count === 1 ? "line" : "lines"}`}
			>
				<Trash2 className="h-4 w-4" aria-hidden="true" />
				Delete
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onClick={onClear}
				aria-label="Clear the line selection"
			>
				Clear
			</Button>
		</div>
	);
}
