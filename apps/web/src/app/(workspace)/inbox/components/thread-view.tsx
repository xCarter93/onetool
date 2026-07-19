"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ArrowLeft, Archive, MailMinus } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { initialsOf, type InboxThread } from "../lib/inbox-utils";
import { MessageComposer } from "./message-composer";
import { LinkClientPopover } from "./link-client-popover";

interface ThreadViewProps {
	thread: InboxThread;
	onBack: () => void;
	onArchived: () => void;
}

export function ThreadView({ thread, onBack, onArchived }: ThreadViewProps) {
	const { threadDocId } = thread;
	const messages = useQuery(api.emailMessages.getEmailThread, { threadDocId });

	const markRead = useMutation(api.emailThreads.markRead);
	const markUnread = useMutation(api.emailThreads.markUnread);
	const archiveThread = useMutation(api.emailThreads.archiveThread);
	const linkThreadToClient = useMutation(api.emailThreads.linkThreadToClient);
	const replyToEmail = useMutation(api.resend.replyToEmail);
	const toast = useToast();

	const [isSending, setIsSending] = useState(false);

	const isLinked = thread.clientId !== null;
	// getEmailThread returns null when access is denied; treat like empty.
	const loadedMessages = messages ?? [];
	const lastMessageId =
		loadedMessages.length > 0
			? loadedMessages[loadedMessages.length - 1]!._id
			: null;

	// Mark read once per opened thread that still has unread messages.
	useEffect(() => {
		if (thread.unreadCount > 0) {
			void markRead({ threadDocId });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [threadDocId]);

	const handleMarkUnread = async () => {
		try {
			await markUnread({ threadDocId });
		} catch {
			toast.error("Couldn't mark unread", "Please try again.");
		}
	};

	const handleArchive = async () => {
		try {
			await archiveThread({ threadDocId, archived: true });
			onArchived();
		} catch {
			toast.error("Couldn't archive", "Please try again.");
		}
	};

	const handleLink = async (clientId: Id<"clients">) => {
		try {
			await linkThreadToClient({ threadDocId, clientId });
		} catch {
			toast.error("Couldn't link client", "Please try again.");
		}
	};

	const handleSend = async (body: string): Promise<boolean> => {
		if (!lastMessageId) {
			toast.error(
				"Couldn't send reply",
				"Thread isn't ready yet — try again in a moment."
			);
			return false;
		}
		setIsSending(true);
		try {
			await replyToEmail({ emailMessageId: lastMessageId, messageBody: body });
			return true;
		} catch {
			toast.error("Couldn't send reply", "Please try again.");
			return false;
		} finally {
			setIsSending(false);
		}
	};

	return (
		<>
			<header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">
				<div className="flex min-w-0 items-start gap-2">
					<button
						type="button"
						onClick={onBack}
						aria-label="Back to inbox"
						className="mt-0.5 -ml-1 inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
					>
						<ArrowLeft className="h-4 w-4" aria-hidden="true" />
					</button>
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold text-foreground">
							{thread.subject || "(no subject)"}
						</h2>
						<div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
							{thread.contact && (
								<span className="truncate">
									{thread.contact.name}
									{thread.contact.email && (
										<span className="text-muted-foreground/70">
											{" "}
											&lt;{thread.contact.email}&gt;
										</span>
									)}
								</span>
							)}
							{isLinked && thread.clientId ? (
								<Link
									href={`/clients/${thread.clientId}`}
									className="truncate text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-primary hover:underline"
								>
									{thread.clientName ?? "View client"}
								</Link>
							) : (
								<span className="inline-flex items-center gap-1.5">
									<span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
										Unlinked
									</span>
									<LinkClientPopover compact onSelect={handleLink} />
								</span>
							)}
						</div>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleMarkUnread}
						className="hidden sm:inline-flex"
					>
						<MailMinus className="h-4 w-4" aria-hidden="true" />
						Mark unread
					</Button>
					<Button variant="outline" size="sm" onClick={handleArchive}>
						<Archive className="h-4 w-4" aria-hidden="true" />
						Archive
					</Button>
				</div>
			</header>

			<div className="flex-1 space-y-3 overflow-y-auto min-h-0 px-6 py-4">
				{messages === undefined ? (
					<MessageSkeleton />
				) : loadedMessages.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No messages in this conversation.
					</p>
				) : (
					loadedMessages.map((msg) => {
						const outbound = msg.direction === "outbound";
						const body =
							(msg.visibleText && msg.visibleText.trim()) ||
							msg.messagePreview ||
							msg.messageBody ||
							"";
						return (
							<article
								key={msg._id}
								className={cn(
									"rounded-lg border border-border p-4",
									outbound ? "bg-muted/30" : "bg-background"
								)}
							>
								<div className="mb-3 flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-center gap-2.5">
										<Avatar className="size-8">
											{msg.senderAvatar && (
												<AvatarImage
													src={msg.senderAvatar}
													alt={msg.senderName}
												/>
											)}
											<AvatarFallback className="text-xs font-medium text-muted-foreground">
												{initialsOf(msg.senderName)}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<span className="truncate text-sm font-medium text-foreground">
													{msg.senderName}
												</span>
												{outbound && (
													<span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
														You
													</span>
												)}
											</div>
											<span className="block truncate text-xs text-muted-foreground">
												{msg.fromEmail}
											</span>
										</div>
									</div>
									<time className="shrink-0 text-xs text-muted-foreground">
										{formatTimestamp(msg.sentAt)}
									</time>
								</div>
								<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
									{body || (
										<span className="italic text-muted-foreground">
											No content.
										</span>
									)}
								</p>
							</article>
						);
					})
				)}
			</div>

			<MessageComposer
				canReply={isLinked}
				isSending={isSending}
				onSend={handleSend}
				onLinkClient={handleLink}
			/>
		</>
	);
}

function formatTimestamp(ms: number): string {
	return new Date(ms).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function MessageSkeleton() {
	return (
		<div className="space-y-3">
			{Array.from({ length: 3 }).map((_, i) => (
				<div key={i} className="rounded-lg border border-border p-4">
					<div className="mb-3 flex items-center gap-2.5">
						<Skeleton className="size-8 rounded-full" />
						<div className="space-y-1.5">
							<Skeleton className="h-3.5 w-32" />
							<Skeleton className="h-3 w-40" />
						</div>
					</div>
					<Skeleton className="h-3 w-full" />
					<Skeleton className="mt-2 h-3 w-4/5" />
				</div>
			))}
		</div>
	);
}

/** Desktop no-selection placeholder. */
export function ThreadViewEmpty() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<EmptyState
				size="md"
				illustration="select-conversation"
				title="Select a conversation"
				description="Choose a thread on the left to read and reply."
			/>
		</div>
	);
}
