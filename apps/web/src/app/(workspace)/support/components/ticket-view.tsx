"use client";

import * as React from "react";
import { format } from "date-fns";
import { ArrowLeft, Plus } from "lucide-react";
import type { GetMessagesResponse, Message } from "posthog-js";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { SupportMessageBody } from "./support-message-body";
import {
	getSupportMessages,
	intentFromMessage,
	markSupportTicketRead,
	rememberTicketIntent,
	replyToSupportTicket,
	type SupportIntent,
} from "@/lib/support";
import {
	markTicketReadLocally,
	refreshSupportTickets,
} from "@/lib/support-tickets";
import { cn } from "@/lib/utils";
import {
	intentMeta,
	isResolved,
	ticketStatusBadge,
} from "../lib/support-utils";

const MAX_REPLY_LENGTH = 2000;

interface TicketViewProps {
	ticketId: string;
	intent: SupportIntent | undefined;
	/** Recovered from the thread's opening message (cross-device tickets). */
	onIntentDiscovered: (ticketId: string, intent: SupportIntent) => void;
	onBack: () => void;
	onNewRequest: () => void;
	replyTraits: { name?: string; email?: string };
}

export function TicketView({
	ticketId,
	intent,
	onIntentDiscovered,
	onBack,
	onNewRequest,
	replyTraits,
}: TicketViewProps) {
	// undefined = loading, null = failed to load.
	const [data, setData] = React.useState<GetMessagesResponse | null | undefined>(
		undefined
	);
	const [reply, setReply] = React.useState("");
	const [sending, setSending] = React.useState(false);
	const [sendError, setSendError] = React.useState<string | null>(null);

	// Reset per ticket during render (setState-in-effect is a lint error).
	const [prevTicketId, setPrevTicketId] = React.useState(ticketId);
	if (ticketId !== prevTicketId) {
		setPrevTicketId(ticketId);
		setData(undefined);
		setReply("");
		setSending(false);
		setSendError(null);
	}

	const load = React.useCallback(async () => {
		const response = await getSupportMessages(ticketId);
		if (response && (response.unread_count ?? 0) > 0) {
			void markSupportTicketRead(ticketId).then((ok) => {
				if (ok) markTicketReadLocally(ticketId);
			});
		}
		return response;
	}, [ticketId]);

	React.useEffect(() => {
		let cancelled = false;
		void load().then((response) => {
			if (cancelled) return;
			setData(response);
			const opening = response?.messages.find(
				(m) => m.author_type === "customer"
			);
			const discovered = opening ? intentFromMessage(opening.content) : null;
			if (discovered) {
				rememberTicketIntent(ticketId, discovered);
				onIntentDiscovered(ticketId, discovered);
			}
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId]);

	const messages = React.useMemo(
		() =>
			[...(data?.messages ?? [])]
				.filter((m) => !m.is_private)
				.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
		[data]
	);

	const meta = intentMeta(intent);
	const badge = data ? ticketStatusBadge(data.ticket_status) : null;
	const resolved = data ? isResolved(data.ticket_status) : false;
	const canSend = !sending && reply.trim().length > 0;

	const handleSend = async () => {
		if (!canSend) return;
		setSending(true);
		setSendError(null);
		const sent = await replyToSupportTicket(ticketId, reply.trim(), replyTraits);
		if (!sent) {
			setSending(false);
			setSendError(
				"That didn't go through. Try again, or email support@onetool.biz."
			);
			return;
		}
		const response = await load();
		setData(response ?? null);
		setReply("");
		setSending(false);
		// The list's snippet/timestamp are stale now.
		void refreshSupportTickets();
	};

	return (
		<>
			<header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 md:px-6">
				<button
					type="button"
					onClick={onBack}
					aria-label="Back to requests"
					className="-ml-1 inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
				>
					<ArrowLeft className="size-4" aria-hidden="true" />
				</button>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<meta.icon className="size-4" aria-hidden="true" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h2 className="truncate text-sm font-semibold text-foreground">
							{meta.label}
						</h2>
						{badge && (
							<StatusBadge role={badge.role} size="sm" className="shrink-0">
								{badge.label}
							</StatusBadge>
						)}
					</div>
					{messages[0] && (
						<p className="text-xs text-muted-foreground">
							Started {format(new Date(messages[0].created_at), "MMM d, yyyy")}
						</p>
					)}
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
				{data === undefined ? (
					<MessageSkeleton />
				) : data === null ? (
					<div className="flex h-full items-center justify-center p-6">
						<EmptyState
							size="sm"
							illustration="messages-none"
							title="Couldn't load this conversation"
							description="Check your connection and try again, or email support@onetool.biz."
						/>
					</div>
				) : (
					<ol className="space-y-4 py-4">
						{messages.map((message) => (
							<li key={message.id}>
								<SupportMessage message={message} />
							</li>
						))}
					</ol>
				)}
			</div>

			<div className="shrink-0 border-t border-border bg-background p-3">
				{resolved ? (
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
						<p>This conversation was resolved.</p>
						<Button size="sm" variant="outline" onClick={onNewRequest}>
							<Plus className="size-4" aria-hidden="true" />
							New request
						</Button>
					</div>
				) : (
					<div className="space-y-2">
						{sendError && (
							<p
								role="alert"
								className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
							>
								{sendError}
							</p>
						)}
						<div className="flex items-end gap-2">
							<Textarea
								value={reply}
								onChange={(e) => setReply(e.target.value)}
								placeholder="Reply…"
								aria-label="Reply"
								rows={2}
								maxLength={MAX_REPLY_LENGTH}
								disabled={data === undefined || data === null}
								className="min-h-9 flex-1 resize-none"
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
										e.preventDefault();
										void handleSend();
									}
								}}
							/>
							<Button
								onClick={() => void handleSend()}
								disabled={!canSend || data == null}
							>
								{sending ? "Sending…" : "Send"}
							</Button>
						</div>
					</div>
				)}
			</div>
		</>
	);
}

function SupportMessage({ message }: { message: Message }) {
	const fromCustomer = message.author_type === "customer";
	const senderName = fromCustomer
		? "You"
		: message.author_name || "OneTool Support";

	return (
		<article>
			<div className="flex items-baseline justify-between gap-3">
				<span
					className={cn(
						"text-sm font-medium",
						fromCustomer ? "text-foreground" : "text-primary"
					)}
				>
					{senderName}
				</span>
				<time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
					{format(new Date(message.created_at), "MMM d, h:mm a")}
				</time>
			</div>
			<SupportMessageBody
				message={message}
				className="mt-1 space-y-2 text-sm leading-relaxed text-foreground/90"
			/>
		</article>
	);
}

function MessageSkeleton() {
	return (
		<div className="space-y-5 py-4">
			{Array.from({ length: 3 }).map((_, i) => (
				<div key={i} className="space-y-2">
					<div className="flex items-center justify-between gap-2">
						<Skeleton className="h-3.5 w-24" />
						<Skeleton className="h-3 w-16" />
					</div>
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-3/4" />
				</div>
			))}
		</div>
	);
}

/** Desktop no-selection placeholder. */
export function TicketViewEmpty() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<EmptyState
				size="md"
				illustration="select-conversation"
				illustrationSize="hero"
				title="Select a request"
				description="Choose a request on the left to read the thread and reply."
			/>
		</div>
	);
}
