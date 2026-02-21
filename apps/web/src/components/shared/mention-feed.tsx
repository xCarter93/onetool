"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	formatRelativeTime,
	parseMessageParts,
} from "@/lib/notification-utils";
import { MessageSquare, Download, FileIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import Image from "next/image";

interface MentionFeedProps {
	entityType: "client" | "project" | "quote";
	entityId: string;
	pageSize?: number;
}

// Component to display attachments
function AttachmentItem({
	notificationId,
}: {
	notificationId: Id<"notifications">;
}) {
	// Fetch attachments with download URLs in bulk to avoid N+1 query problem
	const attachments = useQuery(
		api.messageAttachments.listByNotificationWithUrls,
		{
			notificationId,
		}
	);

	if (!attachments || attachments.length === 0) {
		return null;
	}

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
		const i = Math.min(
			Math.floor(Math.log(bytes) / Math.log(k)),
			sizes.length - 1
		);
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
	};

	const isImage = (mimeType: string) => mimeType.startsWith("image/");

	return (
		<div className="mt-2 flex flex-wrap gap-2">
			{attachments.map((attachment) => {
				// Pass download URL as prop to avoid per-attachment query
				return (
					<AttachmentDownloadLink
						key={attachment._id}
						attachment={attachment}
						downloadUrl={attachment.downloadUrl}
						formatFileSize={formatFileSize}
						isImage={isImage}
					/>
				);
			})}
		</div>
	);
}

// Component to handle individual attachment download
function AttachmentDownloadLink({
	attachment,
	downloadUrl,
	formatFileSize,
	isImage,
}: {
	attachment: Doc<"messageAttachments"> & { downloadUrl: string | null };
	downloadUrl: string | null;
	formatFileSize: (bytes: number) => string;
	isImage: (mimeType: string) => boolean;
}) {
	if (!downloadUrl) {
		return null;
	}

	const isPdf = attachment.mimeType === "application/pdf";

	// For images, show a thumbnail preview
	if (isImage(attachment.mimeType)) {
		return (
			<a
				href={downloadUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="group relative inline-block"
				title={`${attachment.fileName} (${formatFileSize(attachment.fileSize)})`}
			>
				<Image
					src={downloadUrl}
					alt={attachment.fileName}
					width={80}
					height={80}
					className="h-20 w-20 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
				/>
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
					<Download className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
				</div>
			</a>
		);
	}

	// For other files, show compact inline badge
	return (
		<a
			href={downloadUrl}
			target="_blank"
			rel="noopener noreferrer"
			download={attachment.fileName}
			className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-700 transition-colors group max-w-[200px]"
			title={`${attachment.fileName} (${formatFileSize(attachment.fileSize)})`}
		>
			{isPdf ? (
				<FileIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
			) : (
				<FileIcon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
			)}
			<span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
				{attachment.fileName}
			</span>
			<Download className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0 ml-auto" />
		</a>
	);
}

export function MentionFeed({ entityType, entityId, pageSize }: MentionFeedProps) {
	const mentions = useQuery(api.notifications.listByEntity, {
		entityType,
		entityId,
	});
	const [currentPage, setCurrentPage] = useState(1);

	// Get initials for avatar fallback
	const getInitials = (name: string) => {
		const names = name.split(" ");
		if (names.length >= 2) {
			return `${names[0][0]}${names[1][0]}`.toUpperCase();
		}
		return name.slice(0, 2).toUpperCase();
	};

	// Loading state
	if (mentions === undefined) {
		return (
			<div className="space-y-4 animate-pulse">
				{[1, 2, 3].map((i) => (
					<div key={i} className="flex gap-3">
						<div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
						<div className="flex-1 space-y-2">
							<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
							<div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
						</div>
					</div>
				))}
			</div>
		);
	}

	// Empty state
	if (mentions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
					<MessageSquare className="h-8 w-8 text-gray-400 dark:text-gray-600" />
				</div>
				<h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
					No messages yet
				</h3>
				<p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">
					Start a conversation by mentioning a team member with @ in the input
					above.
				</p>
			</div>
		);
	}

	// Pagination
	const perPage = pageSize ?? mentions.length;
	const totalPages = Math.max(1, Math.ceil(mentions.length / perPage));
	const startIdx = (currentPage - 1) * perPage;
	const paginatedMentions = pageSize
		? mentions.slice(startIdx, startIdx + perPage)
		: mentions;

	return (
		<div className="space-y-6">
			{paginatedMentions.map((mention) => (
				<div key={mention._id} className="flex gap-3">
					{/* Avatar - showing the author (person who sent the message) */}
					<Avatar className="h-10 w-10 shrink-0">
						<AvatarImage
							src={mention.author?.image ?? undefined}
							alt={mention.author?.name || mention.author?.email || "User"}
						/>
						<AvatarFallback className="text-sm">
							{mention.author?.name
								? getInitials(mention.author.name)
								: mention.author?.email
									? mention.author.email.substring(0, 2).toUpperCase()
									: "??"}
						</AvatarFallback>
					</Avatar>

					{/* Message content */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-sm font-semibold text-gray-900 dark:text-white">
								{mention.author?.name ||
									mention.author?.email ||
									"Unknown User"}
							</span>
							<span className="text-xs text-gray-500 dark:text-gray-400">
								{formatRelativeTime(mention._creationTime)}
							</span>
						</div>

						{/* Message text with styled mentions */}
						<div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
							<div className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">
								{parseMessageParts(mention.message).map((part, index) =>
									part.isMention ? (
										<Badge
											key={index}
											variant="secondary"
											className="inline-flex mx-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium"
										>
											{part.text}
										</Badge>
									) : (
										<span key={index}>{part.text}</span>
									)
								)}
							</div>
						</div>

						{/* Attachments - rendered outside the message bubble */}
						{mention.hasAttachments && (
							<AttachmentItem notificationId={mention._id} />
						)}
					</div>
				</div>
			))}

			{/* Pagination */}
			{pageSize && totalPages > 1 && (
				<div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
					<span className="text-xs text-muted-foreground">
						{startIdx + 1}–{Math.min(startIdx + perPage, mentions.length)} of{" "}
						{mentions.length}
					</span>
					<div className="flex items-center gap-1">
						<button
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
							className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span className="text-xs text-muted-foreground px-2">
							{currentPage} / {totalPages}
						</span>
						<button
							onClick={() =>
								setCurrentPage((p) => Math.min(totalPages, p + 1))
							}
							disabled={currentPage === totalPages}
							className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
