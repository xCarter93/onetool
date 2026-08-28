"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	EditorContent,
	useEditor,
	useEditorState,
	type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import {
	Bold,
	File,
	FileText,
	Image as ImageIcon,
	Italic,
	Link2,
	List,
	ListOrdered,
	Loader2,
	Paperclip,
	Send,
	TextQuote,
	Underline,
	X,
} from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Toggle } from "@/components/ui/toggle";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentMedia,
	AttachmentTitle,
} from "@/components/ui/attachment";
import { EMAIL_HTML_CLASSES } from "./email-message-body";
import { formatBytes } from "./email-attachment-list";
import {
	isBlockedAttachmentFilename,
	MAX_TOTAL_ATTACHMENT_BYTES,
	totalAttachmentBytes,
	type ComposerAttachment,
} from "./attachment-types";

export interface EmailComposerPayload {
	/** Rich body as TipTap HTML (server sanitizes before sending/storing). */
	html: string;
	/** Plain-text version for the text/plain part and previews. */
	text: string;
}

interface EmailComposerProps {
	/** Resolves true when the send succeeded; the draft clears only then. */
	onSend: (payload: EmailComposerPayload) => Promise<boolean>;
	isSending: boolean;
	disabled?: boolean;
	placeholder?: string;
	/** Restores a kept-alive draft; pair with a stable `key` per thread. */
	initialHtml?: string;
	/** Reports every edit ("" once empty) so the parent can keep the draft. */
	onChangeHtml?: (html: string) => void;
	autoFocus?: boolean;
	sendLabel?: string;
	className?: string;
	/** Compact for inline replies, roomy for standalone compose. */
	size?: "default" | "large";
	/** Pass with `onAttachmentsChange` to turn on the attachment tray. */
	attachments?: ComposerAttachment[];
	onAttachmentsChange?: (next: ComposerAttachment[]) => void;
	/** Hide the toolbar send button when the host renders its own; Mod+Enter still submits. */
	hideSendButton?: boolean;
}

interface PendingUpload {
	id: string;
	filename: string;
	size: number;
}

function fileIconFor(mimeType: string) {
	if (mimeType.startsWith("image/")) return ImageIcon;
	if (mimeType === "application/pdf" || mimeType.startsWith("text/"))
		return FileText;
	return File;
}

/** Allowed link schemes, mirroring the backend sanitizer. */
const LINK_SCHEME = /^(https?:|mailto:|tel:)/i;

function normalizeHref(raw: string): string | null {
	const value = raw.trim();
	if (!value) return null;
	if (LINK_SCHEME.test(value)) return value;
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // other schemes: reject
	return `https://${value}`;
}

/**
 * Shared rich email composer (inbox reply, standalone compose, client sheet).
 * Email-safe schema only: bold, italic, underline, lists, link, blockquote.
 */
export function EmailComposer({
	onSend,
	isSending,
	disabled = false,
	placeholder = "Write your message…",
	initialHtml,
	onChangeHtml,
	autoFocus = false,
	sendLabel = "Send",
	className,
	size = "default",
	attachments,
	onAttachmentsChange,
	hideSendButton = false,
}: EmailComposerProps) {
	// The submit extension is created once; route through a ref so it always
	// calls the latest handler without rebuilding the editor.
	const submitRef = useRef<() => void>(() => {});

	const attachmentsEnabled = !!attachments && !!onAttachmentsChange;
	const generateUploadUrl = useMutation(api.emailAttachments.generateUploadUrl);
	const registerUpload = useMutation(api.emailAttachments.registerUpload);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);

	// Uploads resolve out of order and the parent owns the list, so append
	// against the newest props rather than the closure that started the upload.
	const attachmentsRef = useRef(attachments);
	useEffect(() => {
		attachmentsRef.current = attachments;
	});

	// Write the ref before the parent re-renders, so an upload still in flight
	// appends to this list instead of the snapshot it started from.
	const commitAttachments = (next: ComposerAttachment[]) => {
		attachmentsRef.current = next;
		onAttachmentsChange?.(next);
	};

	const uploadFile = async (file: File): Promise<ComposerAttachment> => {
		const uploadUrl = await generateUploadUrl();
		const mimeType = file.type || "application/octet-stream";
		const response = await fetch(uploadUrl, {
			method: "POST",
			headers: { "Content-Type": mimeType },
			body: file,
		});
		if (!response.ok) {
			throw new Error(`Upload failed with status ${response.status}`);
		}
		const { storageId } = (await response.json()) as {
			storageId: Id<"_storage">;
		};
		await registerUpload({ storageId, filename: file.name });
		return {
			storageId,
			filename: file.name,
			mimeType,
			size: file.size,
			source: "upload",
		};
	};

	const handleFilesPicked = async (fileList: FileList | null) => {
		const files = Array.from(fileList ?? []);
		if (files.length === 0 || !onAttachmentsChange) return;

		const blocked = files.filter((file) =>
			isBlockedAttachmentFilename(file.name)
		);
		if (blocked.length > 0) {
			setAttachmentError(
				`Programs and scripts can't be emailed (${blocked
					.map((file) => file.name)
					.join(", ")}). Attach a document, image, or PDF instead.`
			);
			return;
		}

		const already =
			totalAttachmentBytes(attachmentsRef.current ?? []) +
			totalAttachmentBytes(pendingUploads);
		const incoming = totalAttachmentBytes(files);
		if (already + incoming > MAX_TOTAL_ATTACHMENT_BYTES) {
			setAttachmentError(
				`Attachments can total ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}. Remove a file and try again.`
			);
			return;
		}

		setAttachmentError(null);
		const queued = files.map((file) => ({
			id: crypto.randomUUID(),
			filename: file.name,
			size: file.size,
		}));
		setPendingUploads((prev) => [...prev, ...queued]);

		const uploaded: ComposerAttachment[] = [];
		const failed: string[] = [];
		for (const [index, file] of files.entries()) {
			try {
				uploaded.push(await uploadFile(file));
			} catch {
				failed.push(file.name);
			} finally {
				const { id } = queued[index];
				setPendingUploads((prev) => prev.filter((item) => item.id !== id));
			}
		}

		if (uploaded.length > 0) {
			commitAttachments([...(attachmentsRef.current ?? []), ...uploaded]);
		}
		if (failed.length > 0) {
			setAttachmentError(
				`Couldn't upload ${failed.join(", ")}. Check your connection and try again.`
			);
		}
	};

	const removeAttachment = (storageId: Id<"_storage">) => {
		setAttachmentError(null);
		commitAttachments(
			(attachmentsRef.current ?? []).filter(
				(item) => item.storageId !== storageId
			)
		);
	};

	const extensions = useMemo(
		() => [
			StarterKit.configure({
				heading: false,
				code: false,
				codeBlock: false,
				horizontalRule: false,
				strike: false,
				link: false,
			}),
			Link.configure({
				openOnClick: false,
				autolink: true,
				linkOnPaste: true,
				defaultProtocol: "https",
				protocols: ["http", "https", "mailto", "tel"],
				HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
			}),
			Placeholder.configure({ placeholder }),
			// priority must beat HardBreak (100), which owns Mod-Enter.
			Extension.create({
				name: "submitShortcut",
				priority: 1000,
				addKeyboardShortcuts() {
					return {
						"Mod-Enter": () => {
							submitRef.current();
							return true;
						},
					};
				},
			}),
		],
		[placeholder]
	);

	const editor = useEditor({
		immediatelyRender: false,
		extensions,
		content: initialHtml ?? "",
		autofocus: autoFocus ? "end" : false,
		editorProps: {
			attributes: { "aria-label": "Message", role: "textbox" },
		},
		onUpdate: ({ editor }) => {
			onChangeHtml?.(editor.isEmpty ? "" : editor.getHTML());
		},
	});

	const state = useEditorState({
		editor,
		selector: ({ editor }) => ({
			isBold: editor?.isActive("bold") ?? false,
			isItalic: editor?.isActive("italic") ?? false,
			isUnderline: editor?.isActive("underline") ?? false,
			isBulletList: editor?.isActive("bulletList") ?? false,
			isOrderedList: editor?.isActive("orderedList") ?? false,
			isBlockquote: editor?.isActive("blockquote") ?? false,
			isLink: editor?.isActive("link") ?? false,
			linkHref: (editor?.getAttributes("link").href as string | undefined) ?? "",
			isEmpty: editor?.isEmpty ?? true,
		}),
	});

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	const canSend =
		!disabled &&
		!isSending &&
		!(state?.isEmpty ?? true) &&
		pendingUploads.length === 0;

	const handleSend = async () => {
		if (!editor || !canSend) return;
		const ok = await onSend({
			html: editor.getHTML(),
			text: editor.getText({ blockSeparator: "\n\n" }),
		});
		if (ok) {
			// v3 setContent emits an update by default → onChangeHtml("") clears
			// the kept draft too.
			editor.commands.setContent("");
		}
	};
	useEffect(() => {
		submitRef.current = () => void handleSend();
	});

	const isMac =
		typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-background transition-colors duration-150 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20",
				disabled && "opacity-70",
				className
			)}
		>
			<EditorContent
				editor={editor}
				className={cn(
					"overflow-y-auto px-3 py-2",
					// Large lives inside a scrolling modal body; a second cap would nest scrollers.
					size === "large" ? undefined : "max-h-[240px]",
					EMAIL_HTML_CLASSES,
					size === "large"
						? "[&_.tiptap]:min-h-[180px]"
						: "[&_.tiptap]:min-h-[72px]",
					"[&_.tiptap]:outline-none",
					"[&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:text-muted-foreground [&_.is-editor-empty]:before:content-[attr(data-placeholder)]"
				)}
			/>

			{attachmentsEnabled &&
				(attachments.length > 0 || pendingUploads.length > 0) && (
					<ul
						aria-label="Attachments"
						className="flex flex-wrap gap-2 border-t border-border px-2 py-2"
					>
						{attachments.map((attachment) => {
							const Icon = fileIconFor(attachment.mimeType);
							return (
								<li key={attachment.storageId}>
									<Attachment size="sm" state="done">
										<AttachmentMedia>
											<Icon aria-hidden="true" />
										</AttachmentMedia>
										<AttachmentContent>
											<AttachmentTitle>{attachment.filename}</AttachmentTitle>
											<AttachmentDescription>
												{formatBytes(attachment.size)}
											</AttachmentDescription>
										</AttachmentContent>
										<AttachmentActions>
											<AttachmentAction
												aria-label={`Remove ${attachment.filename}`}
												onClick={() => removeAttachment(attachment.storageId)}
												disabled={disabled || isSending}
											>
												<X className="size-3.5" aria-hidden="true" />
											</AttachmentAction>
										</AttachmentActions>
									</Attachment>
								</li>
							);
						})}
						{pendingUploads.map((upload) => (
							<li key={upload.id}>
								<Attachment size="sm" state="uploading" aria-busy="true">
									<AttachmentMedia>
										<Loader2 className="animate-spin" aria-hidden="true" />
									</AttachmentMedia>
									<AttachmentContent>
										<AttachmentTitle>{upload.filename}</AttachmentTitle>
										<AttachmentDescription>Uploading</AttachmentDescription>
									</AttachmentContent>
								</Attachment>
							</li>
						))}
					</ul>
				)}

			{attachmentError && (
				<p
					role="alert"
					className="border-t border-border px-3 py-2 text-xs text-destructive"
				>
					{attachmentError}
				</p>
			)}

			<div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
				<div
					className="flex items-center gap-0.5"
					role="toolbar"
					aria-label="Formatting"
				>
					<FormatToggle
						pressed={state?.isBold ?? false}
						label="Bold"
						onToggle={() => editor?.chain().focus().toggleBold().run()}
					>
						<Bold className="size-3.5" aria-hidden="true" />
					</FormatToggle>
					<FormatToggle
						pressed={state?.isItalic ?? false}
						label="Italic"
						onToggle={() => editor?.chain().focus().toggleItalic().run()}
					>
						<Italic className="size-3.5" aria-hidden="true" />
					</FormatToggle>
					<FormatToggle
						pressed={state?.isUnderline ?? false}
						label="Underline"
						onToggle={() => editor?.chain().focus().toggleUnderline().run()}
					>
						<Underline className="size-3.5" aria-hidden="true" />
					</FormatToggle>
					<FormatToggle
						pressed={state?.isBulletList ?? false}
						label="Bullet list"
						onToggle={() => editor?.chain().focus().toggleBulletList().run()}
					>
						<List className="size-3.5" aria-hidden="true" />
					</FormatToggle>
					<FormatToggle
						pressed={state?.isOrderedList ?? false}
						label="Numbered list"
						onToggle={() => editor?.chain().focus().toggleOrderedList().run()}
					>
						<ListOrdered className="size-3.5" aria-hidden="true" />
					</FormatToggle>
					<FormatToggle
						pressed={state?.isBlockquote ?? false}
						label="Quote"
						onToggle={() => editor?.chain().focus().toggleBlockquote().run()}
					>
						<TextQuote className="size-3.5" aria-hidden="true" />
					</FormatToggle>
					<LinkControl
						editor={editor}
						isLink={state?.isLink ?? false}
						currentHref={state?.linkHref ?? ""}
					/>
				</div>

				<div className="flex items-center gap-1">
					{attachmentsEnabled && (
						<>
							<input
								ref={fileInputRef}
								type="file"
								multiple
								className="hidden"
								onChange={(e) => {
									void handleFilesPicked(e.target.files);
									e.target.value = "";
								}}
							/>
							<Button
								variant="ghost"
								size="sm"
								className="size-7 p-0"
								aria-label="Attach files"
								onClick={() => fileInputRef.current?.click()}
								disabled={disabled || isSending}
							>
								<Paperclip className="size-3.5" aria-hidden="true" />
							</Button>
						</>
					)}
					{!hideSendButton && (
						<Button
							size="sm"
							onClick={() => void handleSend()}
							disabled={!canSend}
							aria-keyshortcuts="Meta+Enter Control+Enter"
						>
							{isSending ? (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							) : (
								<Send className="size-4" aria-hidden="true" />
							)}
							{sendLabel}
							<Kbd className="ml-1">{isMac ? "⌘↵" : "Ctrl ↵"}</Kbd>
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

function FormatToggle({
	pressed,
	label,
	onToggle,
	children,
}: {
	pressed: boolean;
	label: string;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	return (
		<Toggle
			size="sm"
			pressed={pressed}
			onPressedChange={onToggle}
			aria-label={label}
			// Keep the editor selection: don't let the button steal focus.
			onMouseDown={(e) => e.preventDefault()}
			className="size-7 p-0"
		>
			{children}
		</Toggle>
	);
}

function LinkControl({
	editor,
	isLink,
	currentHref,
}: {
	editor: Editor | null;
	isLink: boolean;
	currentHref: string;
}) {
	const [open, setOpen] = useState(false);
	const [href, setHref] = useState("");
	const [invalid, setInvalid] = useState(false);

	const apply = () => {
		const normalized = normalizeHref(href);
		if (!normalized) {
			setInvalid(true);
			return;
		}
		editor
			?.chain()
			.focus()
			.extendMarkRange("link")
			.setLink({ href: normalized })
			.run();
		setOpen(false);
	};

	const remove = () => {
		editor?.chain().focus().extendMarkRange("link").unsetLink().run();
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setHref(currentHref);
					setInvalid(false);
				}
			}}
		>
			<PopoverTrigger
				render={
					<Toggle
						size="sm"
						pressed={isLink}
						aria-label="Link"
						onMouseDown={(e) => e.preventDefault()}
						className="size-7 p-0"
					>
						<Link2 className="size-3.5" aria-hidden="true" />
					</Toggle>
				}
			/>
			<PopoverContent align="start" className="w-72 p-3">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						apply();
					}}
					className="space-y-2"
				>
					<label
						htmlFor="email-composer-link"
						className="text-xs font-medium text-foreground"
					>
						Link URL
					</label>
					<Input
						id="email-composer-link"
						value={href}
						onChange={(e) => {
							setHref(e.target.value);
							setInvalid(false);
						}}
						placeholder="https://example.com"
						autoFocus
						aria-invalid={invalid || undefined}
					/>
					{invalid && (
						<p role="alert" className="text-xs text-destructive">
							Enter a web, mailto, or tel link.
						</p>
					)}
					<div className="flex justify-end gap-2">
						{isLink && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={remove}
							>
								Remove
							</Button>
						)}
						<Button type="submit" size="sm">
							{isLink ? "Update link" : "Add link"}
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
