"use client";

import React from "react";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type ConfirmMode = "delete" | "archive" | "cancel";

interface DeleteConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
	title: string;
	itemName: string;
	itemType: string;
	/** Preferred: which flavor of confirmation this is. */
	mode?: ConfirmMode;
	/** Shorthand alias for `mode="archive"`; ignored when `mode` is set. */
	isArchive?: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
	isOpen,
	onClose,
	onConfirm,
	title,
	itemName,
	itemType,
	mode: modeProp,
	isArchive,
}) => {
	const toast = useToast();
	const mode: ConfirmMode = modeProp ?? (isArchive ? "archive" : "delete");
	const lowerType = itemType.toLowerCase();

	const handleConfirm = async () => {
		try {
			await onConfirm();

			if (mode === "archive") {
				toast.success(
					`${itemType} Archived`,
					`"${itemName}" has been archived successfully. You can restore it within 7 days.`
				);
			} else if (mode === "cancel") {
				toast.success(
					`${itemType} Cancelled`,
					`"${itemName}" has been cancelled.`
				);
			} else {
				toast.success(
					`${itemType} Deleted`,
					`"${itemName}" has been permanently deleted.`
				);
			}

			onClose();
		} catch (error) {
			const verb =
				mode === "archive"
					? "archive"
					: mode === "cancel"
						? "cancel"
						: "delete";
			toast.error(
				`Failed to ${verb} ${lowerType}`,
				error instanceof Error ? error.message : "An unexpected error occurred"
			);
		}
	};

	// Red destructive framing only for permanent deletes; archive/cancel are amber.
	const iconColor = mode === "delete" ? "text-red-500" : "text-yellow-500";

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
				</AlertDialogHeader>
				<div className="space-y-4">
					<div className="flex items-center space-x-3">
						<div className="shrink-0">
							<svg
								className={`h-10 w-10 ${iconColor}`}
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth="1.5"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
								/>
							</svg>
						</div>
						<div>
							<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
								Are you sure?
							</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400">
								{mode === "archive" ? (
									<>
										This will archive the <strong>{itemType}</strong> &quot;
										{itemName}&quot;. Archived {lowerType}s will have all
										associated details deleted in 7 days, but you can restore
										them before then.
									</>
								) : mode === "cancel" ? (
									<>
										This will cancel the <strong>{itemType}</strong> &quot;
										{itemName}&quot;. No further activity will be recorded
										against it.
									</>
								) : (
									<>
										This action cannot be undone. This will permanently delete the{" "}
										<strong>{itemType}</strong> &quot;{itemName}&quot; and remove
										all associated data.
									</>
								)}
							</p>
						</div>
					</div>

					{mode === "delete" && (
						<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
							<div className="flex">
								<div className="shrink-0">
									<svg
										className="h-5 w-5 text-red-400"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fillRule="evenodd"
											d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
											clipRule="evenodd"
										/>
									</svg>
								</div>
								<div className="ml-3">
									<p className="text-sm text-red-700 dark:text-red-300">
										<strong>Warning:</strong> This is a destructive action that
										cannot be reversed.
									</p>
								</div>
							</div>
						</div>
					)}

					{mode === "archive" && (
						<div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
							<div className="flex">
								<div className="shrink-0">
									<svg
										className="h-5 w-5 text-yellow-400"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fillRule="evenodd"
											d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
											clipRule="evenodd"
										/>
									</svg>
								</div>
								<div className="ml-3">
									<p className="text-sm text-yellow-700 dark:text-yellow-300">
										<strong>Archive Notice:</strong> Archived items can be
										restored within 7 days. After 7 days, they will be permanently
										deleted.
									</p>
								</div>
							</div>
						</div>
					)}

					{mode === "cancel" && (
						<div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
							<div className="flex">
								<div className="shrink-0">
									<svg
										className="h-5 w-5 text-yellow-400"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fillRule="evenodd"
											d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
											clipRule="evenodd"
										/>
									</svg>
								</div>
								<div className="ml-3">
									<p className="text-sm text-yellow-700 dark:text-yellow-300">
										<strong>Note:</strong> The {lowerType} won&apos;t be deleted —
										it will be marked cancelled and kept for your records.
									</p>
								</div>
							</div>
						</div>
					)}

					<div className="flex justify-end space-x-3">
						<Button onClick={onClose} variant="secondary">
							{mode === "cancel" ? `Keep ${itemType}` : "Cancel"}
						</Button>
						<Button
							onClick={handleConfirm}
							variant={mode === "archive" ? "outline" : "destructive"}
						>
							{mode === "archive"
								? `Archive ${itemType}`
								: mode === "cancel"
									? `Cancel ${itemType}`
									: `Delete ${itemType}`}
						</Button>
					</div>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	);
};

export default DeleteConfirmationModal;
