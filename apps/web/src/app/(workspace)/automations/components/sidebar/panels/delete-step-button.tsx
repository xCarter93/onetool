"use client";

import { Trash2 } from "lucide-react";

/** Destructive footer action every config panel ends with. */
export function DeleteStepButton({
	label = "Delete step",
	onDelete,
}: {
	label?: string;
	onDelete: () => void;
}) {
	return (
		<div className="pt-4 border-t border-border mt-2">
			<button
				type="button"
				className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full cursor-pointer"
				onClick={onDelete}
			>
				<Trash2 className="h-4 w-4" />
				<span className="text-sm font-medium">{label}</span>
			</button>
		</div>
	);
}
