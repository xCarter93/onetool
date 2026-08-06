"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
	EmailComposer,
	type EmailComposerPayload,
} from "@/components/shared/email/email-composer";
import { EmailMessageBody } from "@/components/shared/email/email-message-body";
import { EmailAttachmentList } from "@/components/shared/email/email-attachment-list";
import {
	EmailDeliveryIndicator,
	formatMessageTimestamp,
} from "@/components/shared/email/email-delivery-indicator";
import { initialsOf, type InboxThread } from "../lib/inbox-utils";
import { LinkClientPopover } from "./link-client-popover";

type ThreadMessage = NonNullable<
	ReturnType<typeof useThreadMessages>
>[number];

function useThreadMessages(threadDocId: Id<"emailThreads">) {
	return useQuery(api.emailMessages.getEmailThread, { threadDocId });
}

interface ThreadViewProps {
	thread: InboxThread;
	onBack: () => void;
	onArchived: () => void;
	/** Kept-alive reply draft for this thread (TipTap HTML, "" when empty). */
	draft: string;
	onDraftChange: (html: string) => void;
}

export function ThreadView({
	thread,
	onBack,
	onArchived,
	draft,
	onDraftChange,
}: ThreadViewProps) {
	const { threadDocId } = thread;
	const messages = useThreadMessages(threadDocId);

	const markRead = useMutation(api.emailThreads.markRead);
	const markUnread = useMutation(api.emailThreads.markUnread);
	const archiveThread = useMutation(api.emailThreads.archiveThread);
	const linkThreadToClient = useMutation(api.emailThreads.linkThreadToClient);
	const replyToEmail = useMutation(api.resend.replyToEmail);
	const toast = useToast();

	const [isSending, setIsSending] = useState(false);
	// Explicit expand/collapse choices; anything untouched derives its state
	// from position (only the newest message starts expanded).
	const [manualExpanded, setManualExpanded] = useState<
		ReadonlyMap<string, boolean>
	>(() => new Map());

	const isLinked = thread.clientId !== null;
	// getEmailThread returns null when access is denied; treat like empty.
	const loadedMessages = useMemo(() => messages ?? [], [messages]);
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

	const handleSend = async (
		payload: EmailComposerPayload
	): Promise<boolean> => {
		if (!lastMessageId) {
			toast.error(
				"Couldn't send reply",
				"Thread isn't ready yet — try again in a moment."
			);
			return false;
		}
		setIsSending(true);
		try {
			await replyToEmail({
				emailMessageId: lastMessageId,
				messageBody: payload.text,
				messageHtml: payload.html,
			});
			return true;
		} catch {
			toast.error("Couldn't send reply", "Please try again.");
			return false;
		} finally {
			setIsSending(false);
		}
	};

	const toggleMessage = (id: string, next: boolean) => {
		setManualExpanded((prev) => {
			const map = new Map(prev);
			map.set(id, next);
			return map;
		});
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

			<div className="flex-1 overflow-y-auto min-h-0 px-6">
				{messages === undefined ? (
					<MessageSkeleton />
				) : loadedMessages.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No messages in this conversation.
					</p>
				) : (
					<ol className="divide-y divide-border/60">
						{loadedMessages.map((msg, index) => {
							const isLast = index === loadedMessages.length - 1;
							const expanded = manualExpanded.get(msg._id) ?? isLast;
							return (
								<li key={msg._id}>
									{expanded ? (
										<ExpandedMessage
											message={msg}
											collapsible={!isLast || loadedMessages.length > 1}
											onCollapse={() => toggleMessage(msg._id, false)}
										/>
									) : (
										<CollapsedMessage
											message={msg}
											onExpand={() => toggleMessage(msg._id, true)}
										/>
									)}
								</li>
							);
						})}
					</ol>
				)}
			</div>

			<div className="shrink-0 border-t border-border bg-background p-3">
				{isLinked ? (
					<EmailComposer
						key={threadDocId}
						onSend={handleSend}
						isSending={isSending}
						placeholder="Reply…"
						sendLabel="Send"
						initialHtml={draft}
						onChangeHtml={onDraftChange}
					/>
				) : (
					<div className="flex flex-col items-start gap-2 rounded-lg bg-muted/20 p-3 text-sm text-muted-foreground">
						<p>Link this conversation to a client to reply.</p>
						<LinkClientPopover onSelect={handleLink} />
					</div>
				)}
			</div>
		</>
	);
}

/** One-line strip for an older message; click to expand. */
function CollapsedMessage({
	message,
	onExpand,
}: {
	message: ThreadMessage;
	onExpand: () => void;
}) {
	const snippet =
		message.visibleText?.trim() ||
		message.messagePreview ||
		message.messageBody ||
		"";
	return (
		<button
			type="button"
			onClick={onExpand}
			aria-expanded={false}
			className="flex w-full cursor-pointer items-baseline gap-2 py-2.5 text-left transition-colors duration-150 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
		>
			<span className="w-32 shrink-0 truncate text-sm font-medium text-foreground">
				{message.senderName}
			</span>
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
				{snippet}
			</span>
			<time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
				{formatMessageTimestamp(message.sentAt)}
			</time>
		</button>
	);
}

function ExpandedMessage({
	message,
	collapsible,
	onCollapse,
}: {
	message: ThreadMessage;
	collapsible: boolean;
	onCollapse: () => void;
}) {
	const outbound = message.direction === "outbound";

	// Spans (not divs) so the header stays valid phrasing content when the
	// collapsible branch wraps it in a <button>.
	const header = (
		<span className="flex items-start justify-between gap-3">
			<span className="flex min-w-0 items-center gap-2.5">
				<Avatar className="size-7">
					{message.senderAvatar && (
						<AvatarImage src={message.senderAvatar} alt={message.senderName} />
					)}
					<AvatarFallback className="text-xs font-medium text-muted-foreground">
						{initialsOf(message.senderName)}
					</AvatarFallback>
				</Avatar>
				<span className="block min-w-0">
					<span className="flex items-center gap-1.5">
						<span className="truncate text-sm font-medium text-foreground">
							{message.senderName}
						</span>
						{outbound && (
							<span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
								You
							</span>
						)}
					</span>
					<span className="block truncate text-xs text-muted-foreground">
						{message.fromEmail}
					</span>
				</span>
			</span>
			<time className="shrink-0 text-xs tabular-nums text-muted-foreground">
				{formatMessageTimestamp(message.sentAt)}
			</time>
		</span>
	);

	return (
		<article className="py-4">
			{collapsible ? (
				<button
					type="button"
					onClick={onCollapse}
					aria-expanded={true}
					aria-label="Collapse message"
					className="block w-full cursor-pointer rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{header}
				</button>
			) : (
				header
			)}

			<EmailMessageBody message={message} className="mt-3 pl-9.5" />

			<EmailAttachmentList
				emailMessageId={message._id}
				hasAttachments={message.hasAttachments}
				className="mt-3 pl-9.5"
			/>

			{outbound && (
				<div className="mt-2 pl-9.5">
					<EmailDeliveryIndicator message={message} />
				</div>
			)}
		</article>
	);
}

function MessageSkeleton() {
	return (
		<div className="space-y-3 py-4">
			{Array.from({ length: 3 }).map((_, i) => (
				<div key={i} className="py-2">
					<div className="mb-3 flex items-center gap-2.5">
						<Skeleton className="size-7 rounded-full" />
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
				illustrationSize="hero"
				title="Select a conversation"
				description="Choose a thread on the left to read and reply."
			/>
		</div>
	);
}
