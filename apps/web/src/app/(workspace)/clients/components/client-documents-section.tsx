"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useMemo, useRef, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
	FileIcon,
	Upload,
	FolderOpen,
	Loader2,
} from "lucide-react";
import { ClientDocumentsModal } from "./client-documents-modal";

export type UnifiedClientDocument = {
	_id: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: number;
	downloadUrl: string | null;
	source: "uploaded" | "communication";
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/plain",
	"text/csv",
	"application/zip",
	"application/x-zip-compressed",
];

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
		month: "short",
		day: "numeric",
	});
}

interface ClientDocumentsSectionProps {
	clientId: Id<"clients">;
}

export function ClientDocumentsSection({ clientId }: ClientDocumentsSectionProps) {
	const toast = useToast();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const uploadedDocs = useQuery(api.clientDocuments.listByClient, { clientId });
	const communicationDocs = useQuery(api.messageAttachments.listByEntity, {
		entityType: "client",
		entityId: clientId,
	});

	const generateUploadUrl = useMutation(api.clientDocuments.generateUploadUrl);
	const createDocument = useMutation(api.clientDocuments.create);

	// Merge and sort documents
	const allDocuments = useMemo<UnifiedClientDocument[] | undefined>(() => {
		if (uploadedDocs === undefined || communicationDocs === undefined) return undefined;

		const unified: UnifiedClientDocument[] = [
			...uploadedDocs.map((doc) => ({
				_id: doc._id,
				fileName: doc.fileName,
				fileSize: doc.fileSize,
				mimeType: doc.mimeType,
				uploadedAt: doc.uploadedAt,
				downloadUrl: doc.downloadUrl,
				source: "uploaded" as const,
			})),
			...communicationDocs.map((att) => ({
				_id: att._id,
				fileName: att.fileName,
				fileSize: att.fileSize,
				mimeType: att.mimeType,
				uploadedAt: att.uploadedAt,
				downloadUrl: att.downloadUrl,
				source: "communication" as const,
			})),
		];

		return unified.sort((a, b) => b.uploadedAt - a.uploadedAt);
	}, [uploadedDocs, communicationDocs]);

	const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Reset input
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}

		// Validate file
		if (file.size > MAX_FILE_SIZE) {
			toast.error("File too large", "Maximum file size is 10MB.");
			return;
		}
		if (!ALLOWED_MIME_TYPES.includes(file.type)) {
			toast.error("Unsupported file type", `${file.type} is not supported.`);
			return;
		}

		setIsUploading(true);
		try {
			// Get upload URL
			const uploadUrl = await generateUploadUrl();

			// Upload file
			const result = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});

			if (!result.ok) {
				throw new Error("Failed to upload file");
			}

			const { storageId } = await result.json();

			// Create document record
			await createDocument({
				clientId,
				name: file.name,
				fileName: file.name,
				fileSize: file.size,
				mimeType: file.type,
				storageId,
			});

			toast.success("Uploaded", `${file.name} has been uploaded.`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Upload failed";
			toast.error("Upload failed", message);
		} finally {
			setIsUploading(false);
		}
	}, [clientId, createDocument, generateUploadUrl, toast]);

	const mostRecent = allDocuments?.[0];
	const totalCount = allDocuments?.length ?? 0;

	// Loading state
	if (allDocuments === undefined) {
		return (
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
					Documents
				</h3>
				<div className="animate-pulse space-y-2">
					<div className="h-4 bg-muted rounded w-3/4" />
					<div className="h-3 bg-muted rounded w-1/2" />
				</div>
			</div>
		);
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Documents
				</h3>
				<button
					onClick={() => fileInputRef.current?.click()}
					disabled={isUploading}
					className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					aria-label="Upload document"
				>
					{isUploading ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Upload className="h-3.5 w-3.5" />
					)}
				</button>
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					onChange={handleUpload}
					accept={ALLOWED_MIME_TYPES.join(",")}
				/>
			</div>

			{totalCount === 0 ? (
				<div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
					<FolderOpen className="h-4 w-4" />
					<span>No documents yet</span>
				</div>
			) : (
				<div className="space-y-2">
					{/* Most recent document */}
					{mostRecent && (
						<a
							href={mostRecent.downloadUrl ?? undefined}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2.5 py-1.5 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors group"
						>
							<FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm text-foreground truncate">{mostRecent.fileName}</p>
								<p className="text-xs text-muted-foreground">
									{formatFileSize(mostRecent.fileSize)} &middot; {formatDate(mostRecent.uploadedAt)}
								</p>
							</div>
						</a>
					)}

					{/* View All button */}
					<button
						onClick={() => setIsModalOpen(true)}
						className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
					>
						View All ({totalCount})
					</button>
				</div>
			)}

			<ClientDocumentsModal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				documents={allDocuments}
				clientId={clientId}
			/>
		</div>
	);
}
