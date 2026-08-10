"use client";

import { Loader2 } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Guard dialog for navigating away with unsaved edits. "Save and leave" only
 * leaves when the save succeeds — a validation failure keeps the editor open
 * with its normal error toast, same as clicking Save.
 */
export function UnsavedChangesDialog({
	open,
	isSaving,
	saveDisabled,
	onSaveAndLeave,
	onDiscardAndLeave,
	onKeepEditing,
}: {
	open: boolean;
	isSaving: boolean;
	/** Mirrors the header Save button's disabled conditions (slug in flight, etc.). */
	saveDisabled: boolean;
	onSaveAndLeave: () => void;
	onDiscardAndLeave: () => void;
	onKeepEditing: () => void;
}) {
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!next && !isSaving) onKeepEditing();
			}}
		>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Unsaved changes</AlertDialogTitle>
					<AlertDialogDescription>
						Save your edits before leaving, or discard them and go back to your
						last save.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isSaving}>Keep editing</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isSaving}
						onClick={onDiscardAndLeave}
					>
						Discard and leave
					</AlertDialogAction>
					<AlertDialogAction
						disabled={saveDisabled || isSaving}
						onClick={onSaveAndLeave}
					>
						{isSaving && <Loader2 className="size-4 animate-spin" />}
						Save and leave
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** Confirm for the header Discard button — discarding edits is irreversible. */
export function DiscardConfirmDialog({
	open,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Discard changes?</AlertDialogTitle>
					<AlertDialogDescription>
						Your page goes back to how it looked after your last save. This
						cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep editing</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						Discard changes
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
