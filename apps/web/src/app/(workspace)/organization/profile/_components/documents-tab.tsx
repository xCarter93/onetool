"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Upload, Trash2, Download, Eye, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Item,
	ItemMedia,
	ItemContent,
	ItemTitle,
	ItemDescription,
	ItemActions,
} from "@/components/ui/item";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { SettingsSection } from "./settings-section";

const eyebrowClass =
	"text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function formatFileSize(bytes?: number) {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Documents Tab Component
export function DocumentsTab() {
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const [isUploading, setIsUploading] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const documents = useQuery(api.organizationDocuments.list);
	const generateUploadUrl = useMutation(
		api.organizationDocuments.generateUploadUrl,
	);
	const createDocument = useMutation(api.organizationDocuments.create);
	const removeDocument = useMutation(api.organizationDocuments.remove);

	const handleFileUpload = async (file: File) => {
		if (file.type !== "application/pdf") {
			toast.error("Invalid file type", "Please upload a PDF file");
			return;
		}

		const maxSize = 10 * 1024 * 1024; // 10MB
		if (file.size > maxSize) {
			toast.error("File too large", "Maximum file size is 10MB");
			return;
		}

		setIsUploading(true);
		try {
			const uploadUrl = await generateUploadUrl({});

			const res = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": "application/pdf" },
				body: file,
			});

			if (!res.ok) throw new Error("Failed to upload");

			const { storageId } = await res.json();

			await createDocument({
				name: file.name.replace(/\.pdf$/i, ""),
				storageId,
				fileSize: file.size,
			});

			toast.success("Document uploaded", "Your document is ready");

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		} catch (error) {
			// Log error securely to error reporting service
			logError(error, {
				action: "upload_organization_document",
				metadata: { fileName: file.name, fileSize: file.size },
			});

			// Show user-friendly error message
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Upload failed", userMessage);
		} finally {
			setIsUploading(false);
		}
	};

	const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		await handleFileUpload(file);
	};

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);

		const file = e.dataTransfer.files?.[0];
		if (!file) return;
		await handleFileUpload(file);
	};

	const handleClick = () => {
		if (isUploading) return;
		fileInputRef.current?.click();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (isUploading) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			fileInputRef.current?.click();
		}
	};

	const handleDelete = async (id: Id<"organizationDocuments">) => {
		// Open accessible confirmation modal
		const confirmed = await confirmDialog({
			title: "Delete Document",
			message:
				"This action cannot be undone. This will permanently delete the document and remove all associated data.",
			confirmLabel: "Delete Document",
			cancelLabel: "Cancel",
			variant: "destructive",
		});

		// User cancelled - exit early
		if (!confirmed) return;

		try {
			await removeDocument({ id });
			toast.success("Document deleted", "The document has been removed");
		} catch (error) {
			// Log error securely to error reporting service
			logError(error, {
				action: "delete_organization_document",
				metadata: { documentId: id },
			});

			// Show generic user-friendly error message
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Delete failed", userMessage);
		}
	};

	return (
		<SettingsSection
			title="Documents"
			description="Upload custom documents that can be appended to quotes and invoices."
			texture
		>
			<div className="flex flex-col gap-6">
				{/* Upload dropzone */}
				<div
					onClick={handleClick}
					onKeyDown={handleKeyDown}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					tabIndex={isUploading ? -1 : 0}
					role="button"
					aria-disabled={isUploading}
					className={cn(
						"relative flex items-center gap-4 rounded-xl border-2 border-dashed px-6 py-4 transition-all duration-200 ease-in-out",
						"cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
						isDragging
							? "border-primary bg-primary/5"
							: "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
						isUploading && "cursor-not-allowed opacity-50",
					)}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="application/pdf"
						onChange={handleUpload}
						disabled={isUploading}
						className="hidden"
					/>

					<div
						className={cn(
							"flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
							isDragging
								? "bg-primary/15 text-primary"
								: "bg-muted text-muted-foreground",
						)}
					>
						{isUploading ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : (
							<Upload className="h-5 w-5" />
						)}
					</div>

					<div className="min-w-0 flex-1">
						{isUploading ? (
							<span className="font-medium text-foreground">
								Uploading document…
							</span>
						) : (
							<>
								<p className="font-medium text-foreground">
									<span className="text-primary">Click to upload</span> or
									drag and drop
								</p>
								<p className="text-sm text-muted-foreground">
									PDF files only (max 10MB)
								</p>
							</>
						)}
					</div>
				</div>

				{/* Documents list */}
				{documents === undefined ? (
					<div className="flex flex-col gap-2">
						<div className="h-14 animate-pulse rounded-lg bg-muted/50" />
						<div className="h-14 animate-pulse rounded-lg bg-muted/50" />
					</div>
				) : documents.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-10 text-center">
						<FileText className="h-8 w-8 text-muted-foreground/60" />
						<p className="text-sm font-medium text-foreground">
							No documents uploaded yet
						</p>
						<p className="text-xs text-muted-foreground">
							Upload your first document to get started.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<h3 className={eyebrowClass}>Uploaded ({documents.length})</h3>
						<div className="flex flex-col gap-2">
							{documents.map((doc) => (
								<DocumentRow
									key={doc._id}
									document={doc}
									onDelete={() => handleDelete(doc._id)}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</SettingsSection>
	);
}

interface DocumentRowProps {
	document: {
		_id: Id<"organizationDocuments">;
		name: string;
		description?: string;
		uploadedAt: number;
		fileSize?: number;
	};
	onDelete: () => void;
}

function DocumentRow({ document, onDelete }: DocumentRowProps) {
	const documentUrl = useQuery(api.organizationDocuments.getDocumentUrl, {
		id: document._id,
	});

	const meta = [
		new Date(document.uploadedAt).toLocaleDateString(),
		formatFileSize(document.fileSize),
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<Item variant="muted" size="sm" className="rounded-lg">
			<ItemMedia variant="icon">
				<FileText className="h-4 w-4" />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{document.name}</ItemTitle>
				{meta && <ItemDescription>{meta}</ItemDescription>}
			</ItemContent>
			<ItemActions>
				{documentUrl && (
					<>
						<a href={documentUrl} target="_blank" rel="noopener noreferrer">
							<Button intent="outline" size="sq-sm" aria-label="View document">
								<Eye className="h-4 w-4" />
							</Button>
						</a>
						<a href={documentUrl} download={`${document.name}.pdf`}>
							<Button
								intent="outline"
								size="sq-sm"
								aria-label="Download document"
							>
								<Download className="h-4 w-4" />
							</Button>
						</a>
					</>
				)}
				<Button
					intent="outline"
					size="sq-sm"
					aria-label="Delete document"
					onPress={onDelete}
					className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</ItemActions>
		</Item>
	);
}
