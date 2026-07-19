"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Upload, Trash2, Download, Eye, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DotField } from "@/components/ui/dot-field";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Frame,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { SectionHeading } from "./settings-card";
import { EmptyState } from "@/components/domain/empty-state";

const DROPZONE_TEXTURE =
	"text-primary opacity-90 [mask-image:radial-gradient(150%_150%_at_50%_0%,black,transparent_88%)] [-webkit-mask-image:radial-gradient(150%_150%_at_50%_0%,black,transparent_88%)]";

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
	const { can } = usePermissions();
	const canUpload = can("orgDocuments", "modify");
	const canDelete = can("orgDocuments", "delete");
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
		const loadingToastId = toast.loading(
			"Uploading document…",
			file.name,
		);
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

			toast.removeToast(loadingToastId);
			toast.success("Document uploaded", "Your document is ready");

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		} catch (error) {
			toast.removeToast(loadingToastId);
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
		if (isUploading) return;
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		// Moving between the dropzone's own children fires dragleave on the parent;
		// only clear the highlight when the pointer actually leaves the dropzone.
		if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
		setIsDragging(false);
	};

	const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
		// The dropzone is visually disabled mid-upload; ignore drops too so a
		// second concurrent upload can't start.
		if (isUploading) return;

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
		<div className="space-y-6">
			<SectionHeading
				title="Documents"
				description="Upload custom documents that can be appended to quotes and invoices."
			/>

			{/* Upload dropzone */}
			{canUpload && (
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
						"relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border-[1.5px] border-dashed px-5 py-11 text-center transition-all duration-200 ease-in-out",
						"cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
						isDragging
							? "border-primary bg-primary/5"
							: "border-input bg-card hover:border-primary/50 hover:bg-muted/40",
						isUploading && "cursor-not-allowed opacity-60",
					)}
				>
					<DotField className={DROPZONE_TEXTURE} />
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
							"relative flex size-12 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200",
							isDragging
								? "border-primary/30 bg-primary/15 text-primary"
								: "border-border bg-muted text-muted-foreground",
						)}
					>
						{isUploading ? (
							<Loader2 className="size-[22px] animate-spin" />
						) : (
							<Upload className="size-[22px]" />
						)}
					</div>

					<div className="relative min-w-0">
						{isUploading ? (
							<span className="font-medium text-foreground">
								Uploading document…
							</span>
						) : (
							<>
								<p className="text-[15px] text-muted-foreground">
									<span className="font-semibold text-primary">
										Click to upload
									</span>{" "}
									or drag and drop
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									PDF files only (max 10MB)
								</p>
							</>
						)}
					</div>
				</div>
			)}

			{/* Documents list */}
			{documents === undefined ? (
				<div className="flex flex-col gap-2">
					<div className="h-16 animate-pulse rounded-xl bg-muted/50" />
					<div className="h-16 animate-pulse rounded-xl bg-muted/50" />
				</div>
			) : documents.length === 0 ? (
				<div className="rounded-xl border border-dashed border-border bg-muted/20">
					<EmptyState
						illustration="documents-none"
						size="md"
						title="No documents uploaded yet"
						description="Keep licences, insurance certificates and W-9s here so they're on hand when a client asks."
						action={
							canUpload ? (
								<Button
									variant="outline"
									onClick={() => fileInputRef.current?.click()}
									disabled={isUploading}
								>
									<Upload className="size-4" />
									Upload document
								</Button>
							) : undefined
						}
					/>
				</div>
			) : (
				<Frame>
					<FrameHeader>
						<FrameTitle>Uploaded ({documents.length})</FrameTitle>
					</FrameHeader>
					<FramePanel className="p-0">
						<div className="divide-y divide-border">
							{documents.map((doc) => (
								<DocumentRow
									key={doc._id}
									document={doc}
									onDelete={() => handleDelete(doc._id)}
									canDelete={canDelete}
								/>
							))}
						</div>
					</FramePanel>
				</Frame>
			)}
		</div>
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
	canDelete: boolean;
}

function DocumentRow({ document, onDelete, canDelete }: DocumentRowProps) {
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
		<div className="flex items-center gap-3.5 px-4 py-3.5">
			<span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border border-destructive/20 bg-destructive/10 text-destructive/80">
				<FileText className="size-[18px]" />
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-foreground">
					{document.name}
				</p>
				{meta && (
					<p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
				)}
			</div>
			<div className="flex shrink-0 gap-2">
				{documentUrl && (
					<>
						<a href={documentUrl} target="_blank" rel="noopener noreferrer">
							<Button variant="outline" size="icon-sm" aria-label="View document">
								<Eye className="h-4 w-4" />
							</Button>
						</a>
						<a href={documentUrl} download={`${document.name}.pdf`}>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Download document"
							>
								<Download className="h-4 w-4" />
							</Button>
						</a>
					</>
				)}
				{canDelete && (
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Delete document"
						onClick={onDelete}
						className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
