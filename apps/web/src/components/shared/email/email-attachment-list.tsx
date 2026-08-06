"use client";

import { useQuery } from "convex/react";
import { Download, Paperclip } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export interface EmailAttachment {
	_id: Id<"emailAttachments">;
	filename: string;
	size: number;
	contentType: string;
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Received-attachment rows for a single email message. Fetches the list only
 * when the message says it has attachments; render nothing otherwise.
 */
export function EmailAttachmentList({
	emailMessageId,
	hasAttachments,
	className,
}: {
	emailMessageId: Id<"emailMessages">;
	hasAttachments: boolean | undefined;
	className?: string;
}) {
	const attachments = useQuery(
		api.emailAttachments.listByEmail,
		hasAttachments ? { emailMessageId } : "skip"
	);

	if (!hasAttachments || !attachments || attachments.length === 0) return null;

	return (
		<ul className={cn("flex flex-wrap gap-2", className)}>
			{attachments.map((attachment) => (
				<li key={attachment._id}>
					<AttachmentChip attachment={attachment} />
				</li>
			))}
		</ul>
	);
}

function AttachmentChip({ attachment }: { attachment: EmailAttachment }) {
	const downloadUrl = useQuery(api.emailAttachments.getDownloadUrl, {
		attachmentId: attachment._id,
	});

	const inner = (
		<>
			<Paperclip
				className="size-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<span className="min-w-0">
				<span className="block max-w-[180px] truncate text-xs font-medium text-foreground">
					{attachment.filename}
				</span>
				<span className="block text-[11px] text-muted-foreground">
					{formatBytes(attachment.size)}
				</span>
			</span>
			<Download
				className="size-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		</>
	);

	const chipClass =
		"flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors duration-150";

	// No dead href while the URL query resolves; swap to a real link once ready.
	if (!downloadUrl) {
		return (
			<span className={cn(chipClass, "opacity-60")} aria-busy="true">
				{inner}
			</span>
		);
	}

	return (
		<a
			href={downloadUrl}
			download={attachment.filename}
			className={cn(
				chipClass,
				"hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			)}
		>
			{inner}
		</a>
	);
}
