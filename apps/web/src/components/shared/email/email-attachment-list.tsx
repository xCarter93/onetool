"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, Download, Paperclip } from "lucide-react";
import type { ReactNode } from "react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export interface EmailAttachment {
	_id: Id<"emailAttachments">;
	filename: string;
	size: number;
	contentType: string;
	// Absent on legacy and outbound rows, which are stored by construction.
	downloadState?: "pending" | "stored" | "failed";
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

const chipClass =
	"flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 transition-colors duration-150";

function AttachmentChip({ attachment }: { attachment: EmailAttachment }) {
	const pending = attachment.downloadState === "pending";
	const failed = attachment.downloadState === "failed";

	// A row that can never resolve to a URL shouldn't ask for one.
	const downloadUrl = useQuery(
		api.emailAttachments.getDownloadUrl,
		pending || failed ? "skip" : { attachmentId: attachment._id }
	);

	const label = (
		icon: ReactNode,
		detail: string,
		detailClass = "text-muted-foreground"
	) => (
		<>
			{icon}
			<span className="min-w-0">
				<span className="block max-w-[180px] truncate text-xs font-medium text-foreground">
					{attachment.filename}
				</span>
				<span className={cn("block text-[11px]", detailClass)}>{detail}</span>
			</span>
		</>
	);

	const paperclip = (
		<Paperclip
			className="size-3.5 shrink-0 text-muted-foreground"
			aria-hidden="true"
		/>
	);

	// The label carries the state, not a dimmed chip: pending can last through a
	// full retry budget, and opacity on the whole chip puts the filename under
	// AA contrast for the duration.
	if (pending) {
		return (
			<span className={cn(chipClass, "border-dashed")} aria-busy="true">
				{label(paperclip, "Downloading…")}
			</span>
		);
	}

	if (failed) {
		return (
			<span className={cn(chipClass, "border-danger/30 bg-danger/10")}>
				{label(
					<AlertTriangle
						className="size-3.5 shrink-0 text-danger"
						aria-hidden="true"
					/>,
					"Couldn't download",
					"text-danger"
				)}
			</span>
		);
	}

	// Stored, but the signed URL query hasn't come back yet — genuinely transient.
	if (!downloadUrl) {
		return (
			<span className={chipClass} aria-busy="true">
				{label(paperclip, formatBytes(attachment.size))}
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
			{label(paperclip, formatBytes(attachment.size))}
			<Download
				className="size-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		</a>
	);
}
