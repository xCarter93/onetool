"use client";

import { useEditor, EditorContent, type JSONContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
	Bold,
	Italic,
	Heading1,
	Heading2,
	Heading3,
	List,
	ListOrdered,
	Link as LinkIcon,
	Image as ImageIcon,
	Undo,
	Redo,
	Quote,
	Minus,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { StyledInput } from "@/components/ui/styled/styled-input";
import { StyledButton } from "@/components/ui/styled/styled-button";

interface CommunityEditorProps {
	content?: JSONContent;
	onChange?: (content: JSONContent) => void;
	placeholder?: string;
	editable?: boolean;
	className?: string;
}

export function CommunityEditor({
	content,
	onChange,
	placeholder = "Start writing your community page content...",
	editable = true,
	className,
}: CommunityEditorProps) {
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				bulletList: {
					HTMLAttributes: {
						class: "tiptap-bullet-list",
					},
				},
				orderedList: {
					HTMLAttributes: {
						class: "tiptap-ordered-list",
					},
				},
				blockquote: {
					HTMLAttributes: {
						class: "tiptap-blockquote",
					},
				},
			}),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: {
					class: "text-primary underline hover:text-primary/80 cursor-pointer",
				},
			}),
			Image.configure({
				HTMLAttributes: {
					class: "rounded-lg max-w-full h-auto my-4",
				},
			}),
			Placeholder.configure({
				placeholder,
				emptyEditorClass:
					"before:content-[attr(data-placeholder)] before:text-muted-fg before:float-left before:h-0 before:pointer-events-none",
			}),
		],
		content,
		editable,
		immediatelyRender: false, // Prevent SSR hydration mismatch
		onUpdate: ({ editor }) => {
			onChange?.(editor.getJSON());
		},
		editorProps: {
			attributes: {
				class: cn(
					"tiptap-editor",
					"max-w-none focus:outline-none",
					"min-h-[300px] p-4"
				),
			},
		},
	});

	// Update editor content when the content prop changes (fixes persistence issue)
	// This handles the case where data loads asynchronously after editor initialization
	useEffect(() => {
		if (editor && content && !editor.isDestroyed) {
			// Only update if content is different to avoid infinite loops
			const currentContent = editor.getJSON();
			const contentStr = JSON.stringify(content);
			const currentStr = JSON.stringify(currentContent);

			if (contentStr !== currentStr && content.content && content.content.length > 0) {
				editor.commands.setContent(content);
			}
		}
	}, [editor, content]);

	const setLink = useCallback((url: string) => {
		if (!editor) return;

		if (url === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}

		// Ensure URL has protocol
		const formattedUrl = url.startsWith("http://") || url.startsWith("https://")
			? url
			: `https://${url}`;

		editor.chain().focus().extendMarkRange("link").setLink({ href: formattedUrl }).run();
	}, [editor]);

	const setImage = useCallback((url: string) => {
		if (!editor || !url) return;

		// Ensure URL has protocol
		const formattedUrl = url.startsWith("http://") || url.startsWith("https://")
			? url
			: `https://${url}`;

		editor.chain().focus().setImage({ src: formattedUrl }).run();
	}, [editor]);

	if (!editor) return null;

	return (
		<div
			className={cn(
				"border border-border rounded-xl overflow-hidden bg-bg",
				className
			)}
		>
			{editable && (
				<Toolbar
					editor={editor}
					onSetLink={setLink}
					onSetImage={setImage}
				/>
			)}
			<EditorContent editor={editor} />
			<style jsx global>{`
				/* TipTap Editor Typography Styles */
				.tiptap-editor {
					color: var(--fg);
				}

				/* Headings */
				.tiptap-editor h1 {
					font-size: 2rem;
					font-weight: 700;
					line-height: 1.2;
					margin-top: 1.5rem;
					margin-bottom: 0.75rem;
					color: var(--fg);
				}

				.tiptap-editor h2 {
					font-size: 1.5rem;
					font-weight: 600;
					line-height: 1.3;
					margin-top: 1.25rem;
					margin-bottom: 0.5rem;
					color: var(--fg);
				}

				.tiptap-editor h3 {
					font-size: 1.25rem;
					font-weight: 600;
					line-height: 1.4;
					margin-top: 1rem;
					margin-bottom: 0.5rem;
					color: var(--fg);
				}

				/* Paragraphs */
				.tiptap-editor p {
					margin-bottom: 0.75rem;
					line-height: 1.625;
					color: var(--fg);
				}

				.tiptap-editor p:last-child {
					margin-bottom: 0;
				}

				/* Bullet Lists */
				.tiptap-editor .tiptap-bullet-list,
				.tiptap-editor ul {
					list-style-type: disc;
					padding-left: 1.5rem;
					margin-bottom: 0.75rem;
					color: var(--fg);
				}

				.tiptap-editor .tiptap-bullet-list li,
				.tiptap-editor ul li {
					margin-bottom: 0.25rem;
					padding-left: 0.25rem;
				}

				.tiptap-editor .tiptap-bullet-list li p,
				.tiptap-editor ul li p {
					margin-bottom: 0;
				}

				/* Ordered Lists */
				.tiptap-editor .tiptap-ordered-list,
				.tiptap-editor ol {
					list-style-type: decimal;
					padding-left: 1.5rem;
					margin-bottom: 0.75rem;
					color: var(--fg);
				}

				.tiptap-editor .tiptap-ordered-list li,
				.tiptap-editor ol li {
					margin-bottom: 0.25rem;
					padding-left: 0.25rem;
				}

				.tiptap-editor .tiptap-ordered-list li p,
				.tiptap-editor ol li p {
					margin-bottom: 0;
				}

				/* Blockquote */
				.tiptap-editor .tiptap-blockquote,
				.tiptap-editor blockquote {
					border-left: 4px solid var(--border);
					padding-left: 1rem;
					margin-left: 0;
					margin-bottom: 0.75rem;
					font-style: italic;
					color: var(--muted-fg);
				}

				.tiptap-editor blockquote p {
					color: var(--muted-fg);
				}

				/* Horizontal Rule */
				.tiptap-editor hr {
					border: none;
					border-top: 1px solid var(--border);
					margin: 1.5rem 0;
				}

				/* Bold and Italic */
				.tiptap-editor strong {
					font-weight: 700;
					color: var(--fg);
				}

				.tiptap-editor em {
					font-style: italic;
				}

				/* Code */
				.tiptap-editor code {
					background-color: var(--muted);
					padding: 0.125rem 0.375rem;
					border-radius: 0.25rem;
					font-size: 0.875em;
					font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
				}

				/* Pre (code blocks) */
				.tiptap-editor pre {
					background-color: var(--muted);
					padding: 0.75rem 1rem;
					border-radius: 0.5rem;
					overflow-x: auto;
					margin-bottom: 0.75rem;
				}

				.tiptap-editor pre code {
					background: none;
					padding: 0;
				}
			`}</style>
		</div>
	);
}

interface ToolbarProps {
	editor: Editor;
	onSetLink: (url: string) => void;
	onSetImage: (url: string) => void;
}

function Toolbar({ editor, onSetLink, onSetImage }: ToolbarProps) {
	return (
		<div className="flex flex-wrap gap-1 p-2 border-b border-border bg-muted/30">
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleBold().run()}
				active={editor.isActive("bold")}
				icon={<Bold className="size-4" />}
				title="Bold"
			/>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleItalic().run()}
				active={editor.isActive("italic")}
				icon={<Italic className="size-4" />}
				title="Italic"
			/>

			<ToolbarDivider />

			<ToolbarButton
				onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
				active={editor.isActive("heading", { level: 1 })}
				icon={<Heading1 className="size-4" />}
				title="Heading 1"
			/>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
				active={editor.isActive("heading", { level: 2 })}
				icon={<Heading2 className="size-4" />}
				title="Heading 2"
			/>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
				active={editor.isActive("heading", { level: 3 })}
				icon={<Heading3 className="size-4" />}
				title="Heading 3"
			/>

			<ToolbarDivider />

			<ToolbarButton
				onClick={() => editor.chain().focus().toggleBulletList().run()}
				active={editor.isActive("bulletList")}
				icon={<List className="size-4" />}
				title="Bullet List"
			/>
			<ToolbarButton
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
				active={editor.isActive("orderedList")}
				icon={<ListOrdered className="size-4" />}
				title="Numbered List"
			/>

			<ToolbarDivider />

			<ToolbarButton
				onClick={() => editor.chain().focus().toggleBlockquote().run()}
				active={editor.isActive("blockquote")}
				icon={<Quote className="size-4" />}
				title="Quote"
			/>
			<ToolbarButton
				onClick={() => editor.chain().focus().setHorizontalRule().run()}
				icon={<Minus className="size-4" />}
				title="Horizontal Rule"
			/>

			<ToolbarDivider />

			<LinkPopover
				editor={editor}
				onSetLink={onSetLink}
			/>
			<ImagePopover
				onSetImage={onSetImage}
			/>

			<div className="flex-1" />

			<ToolbarButton
				onClick={() => editor.chain().focus().undo().run()}
				disabled={!editor.can().undo()}
				icon={<Undo className="size-4" />}
				title="Undo"
			/>
			<ToolbarButton
				onClick={() => editor.chain().focus().redo().run()}
				disabled={!editor.can().redo()}
				icon={<Redo className="size-4" />}
				title="Redo"
			/>
		</div>
	);
}

interface LinkPopoverProps {
	editor: Editor;
	onSetLink: (url: string) => void;
}

function LinkPopover({ editor, onSetLink }: LinkPopoverProps) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");

	const handleOpen = (isOpen: boolean) => {
		if (isOpen) {
			// Pre-fill with existing link URL if any
			const previousUrl = editor.getAttributes("link").href || "";
			setUrl(previousUrl);
		}
		setOpen(isOpen);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSetLink(url);
		setOpen(false);
		setUrl("");
	};

	const handleRemoveLink = () => {
		onSetLink("");
		setOpen(false);
		setUrl("");
	};

	const isActive = editor.isActive("link");

	return (
		<Popover open={open} onOpenChange={handleOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						className={cn(
							"inline-flex items-center justify-center size-8 rounded-md transition-colors",
							"text-muted-fg hover:text-fg hover:bg-muted/50",
							isActive && "bg-muted text-fg"
						)}
						aria-label="Add Link"
						aria-pressed={isActive}
						title="Add Link"
					/>
				}
			>
				<LinkIcon className="size-4" />
			</PopoverTrigger>
			<PopoverContent className="w-80" align="start">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="flex items-center justify-between">
						<h4 className="font-medium text-sm text-fg">Insert Link</h4>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="text-muted-fg hover:text-fg"
						>
							<X className="size-4" />
						</button>
					</div>
					<div className="space-y-2">
						<Label htmlFor="link-url" className="text-sm">
							URL
						</Label>
						<StyledInput
							id="link-url"
							type="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://example.com"
							autoFocus
						/>
					</div>
					<div className="flex gap-2">
						<StyledButton
							type="submit"
							intent="primary"
							className="flex-1"
							disabled={!url.trim()}
						>
							{isActive ? "Update Link" : "Add Link"}
						</StyledButton>
						{isActive && (
							<StyledButton
								type="button"
								intent="secondary"
								onClick={handleRemoveLink}
							>
								Remove
							</StyledButton>
						)}
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}

interface ImagePopoverProps {
	onSetImage: (url: string) => void;
}

function ImagePopover({ onSetImage }: ImagePopoverProps) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (url.trim()) {
			onSetImage(url);
			setOpen(false);
			setUrl("");
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						className={cn(
							"inline-flex items-center justify-center size-8 rounded-md transition-colors",
							"text-muted-fg hover:text-fg hover:bg-muted/50"
						)}
						aria-label="Add Image"
						title="Add Image"
					/>
				}
			>
				<ImageIcon className="size-4" />
			</PopoverTrigger>
			<PopoverContent className="w-80" align="start">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="flex items-center justify-between">
						<h4 className="font-medium text-sm text-fg">Insert Image</h4>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="text-muted-fg hover:text-fg"
						>
							<X className="size-4" />
						</button>
					</div>
					<div className="space-y-2">
						<Label htmlFor="image-url" className="text-sm">
							Image URL
						</Label>
						<StyledInput
							id="image-url"
							type="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://example.com/image.jpg"
							autoFocus
						/>
						<p className="text-xs text-muted-fg">
							Paste a URL to an image hosted online
						</p>
					</div>
					<StyledButton
						type="submit"
						intent="primary"
						className="w-full"
						disabled={!url.trim()}
					>
						Insert Image
					</StyledButton>
				</form>
			</PopoverContent>
		</Popover>
	);
}

interface ToolbarButtonProps {
	onClick: () => void;
	active?: boolean;
	disabled?: boolean;
	icon: React.ReactNode;
	title: string;
}

function ToolbarButton({
	onClick,
	active,
	disabled,
	icon,
	title,
}: ToolbarButtonProps) {
	return (
		<button
			type="button"
			onMouseDown={(e) => {
				// Prevent focus loss from editor when clicking toolbar buttons
				e.preventDefault();
			}}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"inline-flex items-center justify-center size-8 rounded-md transition-colors",
				"text-muted-fg hover:text-fg hover:bg-muted/50",
				"disabled:opacity-50 disabled:pointer-events-none",
				active && "bg-muted text-fg"
			)}
			aria-label={title}
			aria-pressed={active}
			title={title}
		>
			{icon}
		</button>
	);
}

function ToolbarDivider() {
	return <div className="w-px h-6 bg-border mx-1 self-center" />;
}

// Read-only renderer for published content
export function CommunityPageContent({
	content,
	className,
}: {
	content: JSONContent;
	className?: string;
}) {
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				bulletList: {
					HTMLAttributes: {
						class: "tiptap-bullet-list",
					},
				},
				orderedList: {
					HTMLAttributes: {
						class: "tiptap-ordered-list",
					},
				},
				blockquote: {
					HTMLAttributes: {
						class: "tiptap-blockquote",
					},
				},
			}),
			Link.configure({
				openOnClick: true,
				HTMLAttributes: {
					class: "text-primary underline hover:text-primary/80",
					target: "_blank",
					rel: "noopener noreferrer",
				},
			}),
			Image.configure({
				HTMLAttributes: {
					class: "rounded-lg max-w-full h-auto my-4",
				},
			}),
		],
		content,
		editable: false,
		immediatelyRender: false, // Prevent SSR hydration mismatch
		editorProps: {
			attributes: {
				class: cn(
					"tiptap-content",
					"max-w-none",
					className
				),
			},
		},
	});

	// Update content when it changes (for read-only view)
	useEffect(() => {
		if (editor && content && !editor.isDestroyed) {
			editor.commands.setContent(content);
		}
	}, [editor, content]);

	if (!editor) return null;

	return (
		<>
			<EditorContent editor={editor} />
			<style jsx global>{`
				/* TipTap Content Typography Styles (Read-only) */
				.tiptap-content {
					color: var(--fg);
				}

				/* Headings */
				.tiptap-content h1 {
					font-size: 2.25rem;
					font-weight: 700;
					line-height: 1.2;
					margin-top: 1.5rem;
					margin-bottom: 0.75rem;
					color: var(--fg);
				}

				.tiptap-content h2 {
					font-size: 1.75rem;
					font-weight: 600;
					line-height: 1.3;
					margin-top: 1.25rem;
					margin-bottom: 0.5rem;
					color: var(--fg);
				}

				.tiptap-content h3 {
					font-size: 1.375rem;
					font-weight: 600;
					line-height: 1.4;
					margin-top: 1rem;
					margin-bottom: 0.5rem;
					color: var(--fg);
				}

				/* Paragraphs */
				.tiptap-content p {
					margin-bottom: 1rem;
					line-height: 1.75;
					color: var(--fg);
				}

				.tiptap-content p:last-child {
					margin-bottom: 0;
				}

				/* Bullet Lists */
				.tiptap-content .tiptap-bullet-list,
				.tiptap-content ul {
					list-style-type: disc;
					padding-left: 1.5rem;
					margin-bottom: 1rem;
					color: var(--fg);
				}

				.tiptap-content .tiptap-bullet-list li,
				.tiptap-content ul li {
					margin-bottom: 0.375rem;
					padding-left: 0.25rem;
				}

				.tiptap-content .tiptap-bullet-list li p,
				.tiptap-content ul li p {
					margin-bottom: 0;
				}

				/* Ordered Lists */
				.tiptap-content .tiptap-ordered-list,
				.tiptap-content ol {
					list-style-type: decimal;
					padding-left: 1.5rem;
					margin-bottom: 1rem;
					color: var(--fg);
				}

				.tiptap-content .tiptap-ordered-list li,
				.tiptap-content ol li {
					margin-bottom: 0.375rem;
					padding-left: 0.25rem;
				}

				.tiptap-content .tiptap-ordered-list li p,
				.tiptap-content ol li p {
					margin-bottom: 0;
				}

				/* Blockquote */
				.tiptap-content .tiptap-blockquote,
				.tiptap-content blockquote {
					border-left: 4px solid var(--border);
					padding-left: 1rem;
					margin-left: 0;
					margin-bottom: 1rem;
					font-style: italic;
					color: var(--muted-fg);
				}

				.tiptap-content blockquote p {
					color: var(--muted-fg);
				}

				/* Horizontal Rule */
				.tiptap-content hr {
					border: none;
					border-top: 1px solid var(--border);
					margin: 2rem 0;
				}

				/* Bold and Italic */
				.tiptap-content strong {
					font-weight: 700;
					color: var(--fg);
				}

				.tiptap-content em {
					font-style: italic;
				}

				/* Code */
				.tiptap-content code {
					background-color: var(--muted);
					padding: 0.125rem 0.375rem;
					border-radius: 0.25rem;
					font-size: 0.875em;
					font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
				}

				/* Pre (code blocks) */
				.tiptap-content pre {
					background-color: var(--muted);
					padding: 1rem 1.25rem;
					border-radius: 0.5rem;
					overflow-x: auto;
					margin-bottom: 1rem;
				}

				.tiptap-content pre code {
					background: none;
					padding: 0;
				}
			`}</style>
		</>
	);
}
