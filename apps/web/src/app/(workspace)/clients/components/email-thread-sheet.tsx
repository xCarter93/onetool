"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Send } from "lucide-react";

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
	EmailComposer,
	type EmailComposerPayload,
} from "@/components/shared/email/email-composer";
import {
	EmailRecipientsField,
	mergeCc,
	NO_RECIPIENTS,
	type RecipientsValue,
} from "@/components/shared/email/email-recipients-field";
import {
	toOutboundAttachments,
	type ComposerAttachment,
} from "@/components/shared/email/attachment-types";
import { emailSendErrorMessage } from "@/components/shared/email/send-error";
import { EmailMessageBody } from "@/components/shared/email/email-message-body";
import { EmailAttachmentList } from "@/components/shared/email/email-attachment-list";
import {
	EmailDeliveryIndicator,
	formatMessageTimestamp,
} from "@/components/shared/email/email-delivery-indicator";
import { initialsOf } from "@/app/(workspace)/inbox/lib/inbox-utils";

interface EmailThreadSheetProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	clientId: Id<"clients">;
	threadDocId?: Id<"emailThreads">;
	onComplete?: () => void;
	mode?: "new" | "reply";
}

export function EmailThreadSheet({
	isOpen,
	onOpenChange,
	clientId,
	threadDocId,
	onComplete,
	mode = "reply",
}: EmailThreadSheetProps) {
	const toast = useToast();
	const [subject, setSubject] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [recipients, setRecipients] = useState<RecipientsValue>(NO_RECIPIENTS);
	const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const thread = useQuery(
		api.emailMessages.getEmailThread,
		threadDocId ? { threadDocId } : "skip"
	);
	const client = useQuery(api.clients.get, { id: clientId });
	const allContacts = useQuery(api.clientContacts.listByClient, { clientId });
	const primaryContact = useQuery(api.clientContacts.getPrimaryContact, {
		clientId,
	});

	const replyToEmail = useMutation(api.resend.replyToEmail);
	const sendClientEmail = useMutation(api.resend.sendClientEmail);

	const suggestions = (allContacts ?? []).flatMap((contact) =>
		contact.email
			? [
					{
						email: contact.email,
						name: `${contact.firstName} ${contact.lastName}`.trim(),
					},
				]
			: []
	);

	const selectedContact = allContacts?.find(
		(contact) =>
			contact.email?.toLowerCase() === recipients.to[0]?.toLowerCase()
	);

	// Auto-scroll to bottom when thread updates
	useEffect(() => {
		if (thread && thread.length > 0) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [thread]);

	// Reset form when sheet closes
	const [wasOpen, setWasOpen] = useState(isOpen);
	const [seeded, setSeeded] = useState(false);
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (!isOpen) {
			setSubject("");
			setRecipients(NO_RECIPIENTS);
			setAttachments([]);
			setSeeded(false);
		}
	} else if (isOpen && !seeded && primaryContact?.email) {
		setSeeded(true);
		setRecipients({ to: [primaryContact.email], cc: [], bcc: [] });
	}

	// While the thread query is loading (undefined), a reply sheet must not
	// flash the new-email fields.
	const isNewEmail =
		mode === "new" ||
		(thread !== undefined && (!thread || thread.length === 0));

	const handleSend = async (
		payload: EmailComposerPayload
	): Promise<boolean> => {
		if (isNewEmail && !subject.trim()) {
			toast.error("Subject required", "Please enter a subject for the email");
			return false;
		}
		if (isNewEmail && !selectedContact?.email) {
			toast.error("Add a recipient", "Choose a contact to send this to.");
			return false;
		}

		setIsSending(true);
		try {
			if (isNewEmail) {
				await sendClientEmail({
					clientId,
					subject: subject.trim(),
					messageBody: payload.text,
					messageHtml: payload.html,
					contactId: selectedContact?._id,
					cc: recipients.cc,
					bcc: recipients.bcc,
					attachments: toOutboundAttachments(attachments),
				});
				toast.success("Email sent", "Your email has been sent");
			} else {
				// Unreachable while the query is still loading, but the type
				// needs the guard.
				if (!thread || thread.length === 0) {
					toast.error("Thread loading", "Please wait for the thread to load");
					return false;
				}
				const latestMessage = thread[thread.length - 1];
				await replyToEmail({
					emailMessageId: latestMessage._id,
					messageBody: payload.text,
					messageHtml: payload.html,
					attachments: toOutboundAttachments(attachments),
				});
				toast.success("Reply sent", "Your reply has been sent");
			}

			setSubject("");
			setAttachments([]);
			onComplete?.();
			return true;
		} catch (error) {
			toast.error(
				"Send failed",
				emailSendErrorMessage(error, "Failed to send email")
			);
			return false;
		} finally {
			setIsSending(false);
		}
	};

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-3xl bg-background">
				<div className="flex flex-col h-full overflow-hidden">
					<SheetHeader className="border-b border-border pb-4 shrink-0">
						<SheetTitle className="text-2xl font-semibold">
							{thread && thread.length > 0 ? thread[0].subject : "New Email"}
						</SheetTitle>
						<SheetDescription className="text-muted-foreground">
							{client
								? `Conversation with ${client.companyName}`
								: "Loading..."}
							{(selectedContact ?? primaryContact)?.email && (
								<span className="block text-xs mt-1">
									To: {(selectedContact ?? primaryContact)?.email}
								</span>
							)}
						</SheetDescription>
					</SheetHeader>

					{/* Thread display (only when there are messages) */}
					{thread && thread.length > 0 && (
						<div className="flex-1 overflow-y-auto px-6">
							<ol className="divide-y divide-border/60">
								{thread.map((message) => (
									<SheetMessage key={message._id} message={message} />
								))}
							</ol>
							<div ref={messagesEndRef} />
						</div>
					)}

					{/* Empty state for new emails */}
					{(!thread || thread.length === 0) && (
						<div className="flex-1 flex items-center justify-center text-muted-foreground py-6">
							<div className="text-center">
								<Send
									className="w-12 h-12 mx-auto mb-3 opacity-50"
									aria-hidden="true"
								/>
								<p className="text-sm">Start a new conversation</p>
							</div>
						</div>
					)}

					{/* Compose / reply */}
					<div className="border-t border-border shrink-0 bg-background">
						<div className="p-6 space-y-4">
							{isNewEmail && allContacts && allContacts.length > 0 && (
								<div
									role="group"
									aria-labelledby="thread-recipients-label"
									className="space-y-2"
								>
									<span
										id="thread-recipients-label"
										className="block text-sm font-medium text-foreground"
									>
										Recipients
									</span>
									<EmailRecipientsField
										value={recipients}
										// sendClientEmail addresses one contact; the rest move to cc.
										onChange={(next) => {
											// A typed recipient outranks the primary-contact seed,
											// which may still be resolving.
											setSeeded(true);
											const to = next.to.slice(-1);
											setRecipients({
												...next,
												to,
												cc: mergeCc(to, [...next.cc, ...next.to.slice(0, -1)]),
											});
										}}
										suggestions={suggestions}
										toLocked
										disabled={isSending}
									/>
								</div>
							)}

							{isNewEmail && (
								<div className="space-y-2">
									<label
										htmlFor="email-subject"
										className="text-sm font-medium text-foreground"
									>
										Subject
									</label>
									<Input
										id="email-subject"
										value={subject}
										onChange={(e) => setSubject(e.target.value)}
										placeholder="Enter email subject..."
										disabled={isSending}
									/>
								</div>
							)}

							<div className="space-y-2">
								<span className="block text-sm font-medium text-foreground">
									{isNewEmail ? "Message" : "Reply to this thread"}
								</span>
								<EmailComposer
									onSend={handleSend}
									isSending={isSending}
									placeholder="Type your message here…"
									sendLabel={isNewEmail ? "Send email" : "Send reply"}
									attachments={attachments}
									onAttachmentsChange={setAttachments}
								/>
								<p className="text-xs text-muted-foreground">
									A greeting and your signature are added automatically.
								</p>
							</div>
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

interface SheetMessageProps {
	message: {
		_id: Id<"emailMessages">;
		direction: "inbound" | "outbound";
		fromName: string;
		fromEmail: string;
		messageBody: string;
		htmlBody?: string;
		textBody?: string;
		visibleText?: string;
		messagePreview?: string;
		sentAt: number;
		status:
			| "sent"
			| "delivered"
			| "opened"
			| "bounced"
			| "complained"
			| "failed";
		deliveredAt?: number;
		openedAt?: number;
		bouncedAt?: number;
		failedAt?: number;
		senderName: string;
		senderAvatar: string | null;
		hasAttachments?: boolean;
	};
}

/** Same message idiom as the inbox thread view: flat block, hairline-divided. */
function SheetMessage({ message }: SheetMessageProps) {
	const outbound = message.direction === "outbound";

	return (
		<li className="py-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2.5">
					<Avatar className="size-7">
						{message.senderAvatar && (
							<AvatarImage
								src={message.senderAvatar}
								alt={message.senderName}
							/>
						)}
						<AvatarFallback className="text-xs font-medium text-muted-foreground">
							{initialsOf(message.senderName || message.fromName)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<div className="flex items-center gap-1.5">
							<span className="truncate text-sm font-medium text-foreground">
								{message.senderName || message.fromName}
							</span>
							{outbound && (
								<span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									You
								</span>
							)}
						</div>
						<span className="block truncate text-xs text-muted-foreground">
							{message.fromEmail}
						</span>
					</div>
				</div>
				<time className="shrink-0 text-xs tabular-nums text-muted-foreground">
					{formatMessageTimestamp(message.sentAt)}
				</time>
			</div>

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
		</li>
	);
}

export default EmailThreadSheet;
