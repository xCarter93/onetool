"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Panel footer with the one destructive action, right-aligned like a dialog footer. */
export function DeleteStepButton({
	label = "Delete step",
	onDelete,
}: {
	label?: string;
	onDelete: () => void;
}) {
	return (
		<div className="flex shrink-0 justify-end border-t border-border px-4 py-3">
			<Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}>
				<Trash2 />
				{label}
			</Button>
		</div>
	);
}
