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
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
	const [selectedContactId, setSelectedContactId] =
		useState<Id<"clientContacts"> | null>(null);
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

	const selectedContact = selectedContactId
		? allContacts?.find((c) => c._id === selectedContactId)
		: primaryContact;

	// Auto-scroll to bottom when thread updates
	useEffect(() => {
		if (thread && thread.length > 0) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [thread]);

	// Reset form when sheet closes
	const [wasOpen, setWasOpen] = useState(isOpen);
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (!isOpen) {
			setSubject("");
			setSelectedContactId(null);
		}
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
		if (!selectedContact?.email) {
			toast.error(
				"No email address",
				"The selected contact doesn't have an email address"
			);
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
					contactId: selectedContactId ?? primaryContact?._id,
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
				});
				toast.success("Reply sent", "Your reply has been sent");
			}

			setSubject("");
			setSelectedContactId(null);
			onComplete?.();
			return true;
		} catch (error) {
			console.error("Error sending email:", error);
			toast.error(
				"Send failed",
				error instanceof Error ? error.message : "Failed to send email"
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
							{selectedContact && (
								<span className="block text-xs mt-1">
									To: {selectedContact.email}
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
								<div className="space-y-2">
									<label
										htmlFor="contact-select"
										className="text-sm font-medium text-foreground"
									>
										Send To
									</label>
									<Select
										value={selectedContactId ?? primaryContact?._id ?? ""}
										onValueChange={(value) =>
											setSelectedContactId(value as Id<"clientContacts">)
										}
									>
										<SelectTrigger id="contact-select">
											<SelectValue placeholder="Select a contact" />
										</SelectTrigger>
										<SelectContent>
											{allContacts.map((contact) => (
												<SelectItem key={contact._id} value={contact._id}>
													<div className="flex items-center gap-2">
														<span className="font-medium">
															{contact.firstName} {contact.lastName}
														</span>
														{contact.isPrimary && (
															<span className="text-xs text-primary">
																(Primary)
															</span>
														)}
														<span className="text-xs text-muted-foreground">
															{contact.email}
														</span>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
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
