"use client";

import { Fragment, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { FileText, History, Paperclip, RefreshCw, X } from "lucide-react";

import {
	Attachment,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
	isBlockedAttachmentFilename,
	type ComposerAttachment,
} from "./attachment-types";
import { formatBytes } from "./email-attachment-list";

/** Which stored PDF is riding along, or null once the user removes it. */
export type PdfSelection =
	| { kind: "latest" }
	| { kind: "version"; documentId: Id<"documents"> }
	| { kind: "signed"; documentId: Id<"documents"> }
	| null;

const UPLOAD_ACCEPT =
	".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,.txt";

function formatVersionDate(ms: number): string {
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

export function pdfFileName(
	entityLabel: string,
	version: number,
	signed: boolean
): string {
	return `${entityLabel}-v${version}${signed ? "-signed" : ""}.pdf`;
}

/** The stored document a selection points at, or null when it no longer exists. */
export function resolvePdfSelection(
	selection: PdfSelection,
	latestDocument: Doc<"documents"> | null | undefined,
	versions: Doc<"documents">[] | undefined
): { document: Doc<"documents">; signed: boolean } | null {
	if (!selection) return null;
	if (selection.kind === "latest") {
		return latestDocument ? { document: latestDocument, signed: false } : null;
	}
	const match = versions?.find((doc) => doc._id === selection.documentId);
	if (!match) return null;
	if (selection.kind === "signed") {
		return match.signedStorageId ? { document: match, signed: true } : null;
	}
	return { document: match, signed: false };
}

interface EntityEmailAttachmentsProps {
	/** File-name stem, e.g. "Quote-Q-000042". */
	entityLabel: string;
	latestDocument: Doc<"documents"> | null | undefined;
	versions: Doc<"documents">[] | undefined;
	selection: PdfSelection;
	onSelectionChange: (selection: PdfSelection) => void;
	/** The entity changed after this PDF was generated. */
	isStale: boolean;
	/** Re-renders and stores a new version. Omit where no render pipeline exists. */
	onRegenerate?: () => Promise<void> | void;
	uploads: ComposerAttachment[];
	onUploadsChange: (uploads: ComposerAttachment[]) => void;
	canUpload: boolean;
	disabled?: boolean;
}

/**
 * Attachment tray for the entity email modal: the generated PDF with its
 * version picker and stale badge, plus locally uploaded files.
 */
export function EntityEmailAttachments({
	entityLabel,
	latestDocument,
	versions,
	selection,
	onSelectionChange,
	isStale,
	onRegenerate,
	uploads,
	onUploadsChange,
	canUpload,
	disabled = false,
}: EntityEmailAttachmentsProps) {
	const toast = useToast();
	const generateUploadUrl = useMutation(api.emailAttachments.generateUploadUrl);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);

	const resolved = resolvePdfSelection(selection, latestDocument, versions);
	const pickerVersions = versions ?? [];
	const showStale = Boolean(resolved && isStale && selection?.kind === "latest");

	const handleRegenerate = async () => {
		if (!onRegenerate || isRegenerating) return;
		setIsRegenerating(true);
		try {
			await onRegenerate();
			// The chip tracks "latest", so the new version flows in from the query.
			onSelectionChange({ kind: "latest" });
		} finally {
			setIsRegenerating(false);
		}
	};

	const handleFiles = async (files: FileList | null) => {
		if (!files || files.length === 0) return;

		const picked = Array.from(files);
		const blocked = picked.filter((file) =>
			isBlockedAttachmentFilename(file.name)
		);
		if (blocked.length > 0) {
			setAttachmentError(
				`Programs and scripts can't be emailed (${blocked
					.map((file) => file.name)
					.join(", ")}). Attach a document, image, or PDF instead.`
			);
			// Re-picking the same file fires no change event unless the input is cleared.
			if (fileInputRef.current) fileInputRef.current.value = "";
			return;
		}

		setAttachmentError(null);
		setIsUploading(true);
		try {
			const added: ComposerAttachment[] = [];
			for (const file of picked) {
				const uploadUrl = await generateUploadUrl({});
				const res = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type || "application/octet-stream" },
					body: file,
				});
				if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
				const { storageId } = await res.json();
				added.push({
					storageId: storageId as Id<"_storage">,
					filename: file.name,
					mimeType: file.type || "application/octet-stream",
					size: file.size,
					source: "upload",
				});
			}
			onUploadsChange([...uploads, ...added]);
		} catch (error) {
			toast.error(
				"Upload failed",
				error instanceof Error ? error.message : "Try attaching the file again."
			);
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	return (
		<div className="space-y-2">
			{resolved || uploads.length > 0 ? (
				<AttachmentGroup className="gap-2">
					{resolved ? (
						<Attachment size="sm" className="max-w-[22rem] rounded-lg px-2 py-1.5">
							<AttachmentMedia className="rounded-md bg-muted">
								<FileText className="h-4 w-4" aria-hidden="true" />
							</AttachmentMedia>
							<AttachmentContent className="px-2">
								<AttachmentTitle className="text-xs font-medium">
									{pdfFileName(
										entityLabel,
										resolved.document.version,
										resolved.signed
									)}
								</AttachmentTitle>
								<AttachmentDescription className="text-xs">
									{showStale ? (
										<span className="text-warning-foreground">
											Content changed since generation
										</span>
									) : (
										`Version ${resolved.document.version}${resolved.signed ? ", signed" : ""}`
									)}
								</AttachmentDescription>
							</AttachmentContent>
							<AttachmentActions className="gap-0.5">
								{showStale && onRegenerate ? (
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={handleRegenerate}
										disabled={disabled || isRegenerating}
										aria-label="Regenerate the PDF"
										title="Regenerate the PDF"
									>
										<RefreshCw
											className={
												isRegenerating
													? "h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
													: "h-3.5 w-3.5"
											}
											aria-hidden="true"
										/>
									</Button>
								) : null}
								{pickerVersions.length > 0 ? (
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													disabled={disabled}
													aria-label="Choose a version"
													title="Choose a version"
												>
													<History
														className="h-3.5 w-3.5"
														aria-hidden="true"
													/>
												</Button>
											}
										/>
										<DropdownMenuContent align="end" className="w-60">
											{/* GroupLabel throws outside a Menu.Group in Base UI */}
											<DropdownMenuGroup>
												<DropdownMenuLabel>Attach version</DropdownMenuLabel>
											<DropdownMenuItem
												onClick={() => onSelectionChange({ kind: "latest" })}
											>
												Always the latest
											</DropdownMenuItem>
											{pickerVersions.map((doc) => (
												<Fragment key={doc._id}>
													<DropdownMenuItem
														onClick={() =>
															onSelectionChange({
																kind: "version",
																documentId: doc._id,
															})
														}
													>
														Version {doc.version} ·{" "}
														{formatVersionDate(doc.generatedAt)}
													</DropdownMenuItem>
													{doc.signedStorageId ? (
														<DropdownMenuItem
															onClick={() =>
																onSelectionChange({
																	kind: "signed",
																	documentId: doc._id,
																})
															}
														>
															Version {doc.version}, signed
														</DropdownMenuItem>
													) : null}
												</Fragment>
											))}
											</DropdownMenuGroup>
										</DropdownMenuContent>
									</DropdownMenu>
								) : null}
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => onSelectionChange(null)}
									disabled={disabled}
									aria-label="Remove the PDF attachment"
								>
									<X className="h-3.5 w-3.5" aria-hidden="true" />
								</Button>
							</AttachmentActions>
						</Attachment>
					) : null}

					{uploads.map((upload) => (
						<Attachment
							key={upload.storageId}
							size="sm"
							className="max-w-[22rem] rounded-lg px-2 py-1.5"
						>
							<AttachmentMedia className="rounded-md bg-muted">
								<Paperclip className="h-4 w-4" aria-hidden="true" />
							</AttachmentMedia>
							<AttachmentContent className="px-2">
								<AttachmentTitle className="text-xs font-medium">
									{upload.filename}
								</AttachmentTitle>
								<AttachmentDescription className="text-xs">
									{formatBytes(upload.size)}
								</AttachmentDescription>
							</AttachmentContent>
							<AttachmentActions>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() =>
										onUploadsChange(
											uploads.filter((f) => f.storageId !== upload.storageId)
										)
									}
									disabled={disabled}
									aria-label={`Remove ${upload.filename}`}
								>
									<X className="h-3.5 w-3.5" aria-hidden="true" />
								</Button>
							</AttachmentActions>
						</Attachment>
					))}
				</AttachmentGroup>
			) : null}

			{canUpload ? (
				<>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						accept={UPLOAD_ACCEPT}
						className="sr-only"
						onChange={(event) => void handleFiles(event.target.files)}
					/>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => fileInputRef.current?.click()}
						disabled={disabled || isUploading}
					>
						<Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
						{isUploading ? "Attaching…" : "Attach file"}
					</Button>
				</>
			) : null}

			{attachmentError ? (
				<p role="alert" className="text-xs text-destructive">
					{attachmentError}
				</p>
			) : null}
		</div>
	);
}
