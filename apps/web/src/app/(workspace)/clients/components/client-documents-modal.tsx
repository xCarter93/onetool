"use client";

import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import Modal from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
	FileIcon,
	Download,
	Trash2,
	Image as ImageIcon,
	FolderOpen,
} from "lucide-react";
import type { UnifiedClientDocument } from "./client-documents-section";

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDate(timestamp: number): string {
	const userLocale =
		typeof navigator !== "undefined" ? navigator.language : undefined;
	return new Date(timestamp).toLocaleDateString(userLocale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

const isImage = (mimeType: string) => mimeType.startsWith("image/");
const isPdf = (mimeType: string) => mimeType === "application/pdf";

interface ClientDocumentsModalProps {
	isOpen: boolean;
	onClose: () => void;
	documents: UnifiedClientDocument[];
	clientId: Id<"clients">;
}

export function ClientDocumentsModal({
	isOpen,
	onClose,
	documents,
	clientId,
}: ClientDocumentsModalProps) {
	const toast = useToast();
	const { confirm } = useConfirmDialog();
	const removeDocument = useMutation(api.clientDocuments.remove);

	const handleDelete = async (doc: UnifiedClientDocument) => {
		const confirmed = await confirm({
			title: "Delete Document",
			message: "This will permanently delete this document.",
			confirmLabel: "Delete",
			variant: "destructive",
			itemName: doc.fileName,
		});

		if (!confirmed) return;

		try {
			await removeDocument({ id: doc._id as Id<"clientDocuments"> });
			toast.success("Deleted", `${doc.fileName} has been removed.`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to delete";
			toast.error("Delete failed", message);
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Client Documents" size="lg">
			{documents.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
						<FolderOpen className="h-8 w-8 text-gray-400 dark:text-gray-600" />
					</div>
					<h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
						No documents yet
					</h3>
					<p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">
						Upload documents from the sidebar or attach files in team communications.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3">
					{documents.map((doc) => (
						<div
							key={doc._id}
							className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							{/* File icon */}
							<div className="shrink-0">
								{isImage(doc.mimeType) ? (
									<div className="h-12 w-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
										<ImageIcon className="h-5 w-5 text-blue-500" />
									</div>
								) : (
									<div className="h-12 w-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
										<FileIcon
											className={`h-5 w-5 ${isPdf(doc.mimeType) ? "text-red-500" : "text-gray-500"}`}
										/>
									</div>
								)}
							</div>

							{/* File details */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-0.5">
									<p className="text-sm font-medium text-gray-900 dark:text-white truncate">
										{doc.fileName}
									</p>
									<Badge
										variant="outline"
										className={
											doc.source === "uploaded"
												? "shrink-0 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
												: "shrink-0 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800"
										}
									>
										{doc.source === "uploaded" ? "Uploaded" : "From Chat"}
									</Badge>
								</div>
								<div className="flex items-center gap-2">
									<p className="text-xs text-gray-500 dark:text-gray-400">
										{formatFileSize(doc.fileSize)}
									</p>
									<span className="text-xs text-gray-400">&middot;</span>
									<p className="text-xs text-gray-500 dark:text-gray-400">
										{formatDate(doc.uploadedAt)}
									</p>
								</div>
							</div>

							{/* Actions */}
							<div className="flex items-center gap-1 shrink-0">
								{doc.downloadUrl && (
									<a
										href={doc.downloadUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
										aria-label={`Download ${doc.fileName}`}
									>
										<Download className="h-4 w-4" />
									</a>
								)}
								{doc.source === "uploaded" && (
									<button
										onClick={() => handleDelete(doc)}
										className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
										aria-label={`Delete ${doc.fileName}`}
									>
										<Trash2 className="h-4 w-4" />
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</Modal>
	);
}
