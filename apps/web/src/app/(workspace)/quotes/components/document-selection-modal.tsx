"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { FileText, ExternalLink } from "lucide-react";

interface DocumentSelectionModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (selectedDocumentIds: Id<"organizationDocuments">[]) => void;
}

export function DocumentSelectionModal({
	isOpen,
	onClose,
	onConfirm,
}: DocumentSelectionModalProps) {
	const [selectedIds, setSelectedIds] = useState<Id<"organizationDocuments">[]>(
		[]
	);
	const documents = useQuery(api.organizationDocuments.list);

	const handleToggle = (id: Id<"organizationDocuments">) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
		);
	};

	const handleConfirm = () => {
		onConfirm(selectedIds);
		setSelectedIds([]);
		onClose();
	};

	const handleClose = () => {
		setSelectedIds([]);
		onClose();
	};

	const formatFileSize = (bytes?: number) => {
		if (!bytes) return "";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title="Append Documents to Quote"
			size="lg"
		>
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Optionally select documents to append to your quote PDF. Selected
					documents will be added after the quote content, or continue without
					attachments.
				</p>

				{documents === undefined ? (
					<div className="text-center py-8">
						<div className="animate-pulse space-y-4">
							<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto"></div>
							<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto"></div>
						</div>
					</div>
				) : documents.length === 0 ? (
					<div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
						<FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
						<p className="text-muted-foreground mb-2 font-medium">
							No documents available
						</p>
						<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
							Upload documents in Settings → Documents to use them in quotes
						</p>
						<a
							href="/organization/profile?tab=documents"
							target="_blank"
							rel="noopener noreferrer"
						>
							<Button variant="outline" size="sm">
								<ExternalLink className="h-3 w-3 mr-2" />
								Go to Documents
							</Button>
						</a>
					</div>
				) : (
					<div className="space-y-2 max-h-96 overflow-y-auto">
						{documents.map((doc) => (
							<label
								key={doc._id}
								className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
							>
								<Checkbox
									checked={selectedIds.includes(doc._id)}
									onCheckedChange={() => handleToggle(doc._id)}
								/>
								<div className="flex items-center justify-center w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 shrink-0">
									<FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="font-medium text-gray-900 dark:text-white truncate">
										{doc.name}
									</p>
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
										{doc.fileSize && (
											<>
												<span>•</span>
												<span>{formatFileSize(doc.fileSize)}</span>
											</>
										)}
									</div>
									{doc.description && (
										<p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
											{doc.description}
										</p>
									)}
								</div>
							</label>
						))}
					</div>
				)}

				<div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
					<div className="text-sm text-muted-foreground">
						{selectedIds.length > 0 ? (
							<span>
								{selectedIds.length} document{selectedIds.length !== 1 && "s"}{" "}
								selected
							</span>
						) : (
							<span className="text-gray-500 dark:text-gray-400 italic">
								No documents selected
							</span>
						)}
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button onClick={handleConfirm}>
							{selectedIds.length > 0
								? `Generate with ${selectedIds.length} document${selectedIds.length !== 1 ? "s" : ""}`
								: "Generate PDF Only"}
						</Button>
					</div>
				</div>
			</div>
		</Modal>
	);
}
