"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClearWorkflowDialogProps {
	open: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

export function ClearWorkflowDialog({
	open,
	onCancel,
	onConfirm,
}: ClearWorkflowDialogProps) {
	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="mx-4 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
				<div className="flex items-start gap-4">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
						<AlertTriangle className="h-5 w-5 text-destructive" />
					</div>
					<div>
						<h3 className="text-lg font-semibold">Clear workflow?</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							This will remove all steps from your workflow. Only the trigger
							will remain. This cannot be undone.
						</p>
					</div>
				</div>
				<div className="mt-6 flex justify-end gap-3">
					<Button intent="outline" onPress={onCancel}>
						Keep Workflow
					</Button>
					<Button intent="destructive" onPress={onConfirm}>
						Clear All Steps
					</Button>
				</div>
			</div>
		</div>
	);
}
