"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import DOMPurify from "dompurify";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Textarea } from "@/components/ui/textarea";
import { StyledInput } from "@/components/ui/styled";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/styled/styled-select";
import { useToast } from "@/hooks/use-toast";
import { Send, Paperclip, Download } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface EmailThreadSheetProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	clientId: Id<"clients">;
	threadDocId?: Id<"emailThreads">;
	onComplete?: () => void;
	mode?: "new" | "reply"; // New prop to determine if composing new or replying
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
	const [replyBody, setReplyBody] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [selectedContactId, setSelectedContactId] =
		useState<Id<"clientContacts"> | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Fetch thread messages (only if threadDocId provided)
	const thread = useQuery(
		api.emailMessages.getEmailThread,
		threadDocId ? { threadDocId } : "skip"
	);

	// Fetch client info
	const client = useQuery(api.clients.get, { id: clientId });

	// Fetch all contacts for the client
	const allContacts = useQuery(api.clientContacts.listByClient, { clientId });

	// Fetch primary contact for new emails
	const primaryContact = useQuery(api.clientContacts.getPrimaryContact, {
		clientId,
	});

	// Fetch current user for signature preview
	const currentUser = useQuery(api.users.current, {});

	// Fetch organization for signature preview
	const organization = useQuery(api.organizations.get, {});

	const replyToEmail = useMutation(api.resend.replyToEmail);
	const sendClientEmail = useMutation(api.resend.sendClientEmail);

	// Get the selected contact or default to primary
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
			setReplyBody("");
			setSelectedContactId(null);
		}
	}

	const handleSendEmail = async () => {
		// Validate inputs
		if (!replyBody.trim()) {
			toast.error("Empty Message", "Please enter a message to send");
			return;
		}

		// While the thread query is loading (undefined), a reply sheet must not
		// flash the new-email fields.
		const isNewEmail =
			mode === "new" || (thread !== undefined && (!thread || thread.length === 0));

		if (isNewEmail && !subject.trim()) {
			toast.error("Subject Required", "Please enter a subject for the email");
			return;
		}

		if (!selectedContact?.email) {
			toast.error(
				"No Email",
				"The selected contact doesn't have an email address"
			);
			return;
		}

		setIsSending(true);
		try {
			if (isNewEmail) {
				// Send new email
				await sendClientEmail({
					clientId,
					subject: subject.trim(),
					messageBody: replyBody.trim(),
					contactId: selectedContactId ?? primaryContact?._id,
				});
				toast.success("Email Sent", "Your email has been sent successfully");
			} else {
				// Reply to existing thread (unreachable while the query is still
				// loading, but the type needs the guard)
				if (!thread || thread.length === 0) {
					toast.error("Thread Loading", "Please wait for the thread to load");
					return;
				}
				const latestMessage = thread[thread.length - 1];
				await replyToEmail({
					emailMessageId: latestMessage._id,
					messageBody: replyBody.trim(),
				});
				toast.success("Reply Sent", "Your reply has been sent successfully");
			}

			setSubject("");
			setReplyBody("");
			setSelectedContactId(null);
			onComplete?.();
		} catch (error) {
			console.error("Error sending email:", error);
			toast.error(
				"Send Failed",
				error instanceof Error ? error.message : "Failed to send email"
			);
		} finally {
			setIsSending(false);
		}
	};

	const handleClose = () => {
		setSubject("");
		setReplyBody("");
		setSelectedContactId(null);
		onOpenChange(false);
	};

	// While the thread query is loading (undefined), a reply sheet must not
	// flash the new-email fields.
	const isNewEmail =
		mode === "new" || (thread !== undefined && (!thread || thread.length === 0));
	const showSubjectField = isNewEmail;

	// Build email preview with auto-added content
	const getEmailPreview = () => {
		if (!replyBody.trim()) return "";

		const contactName = selectedContact
			? `${selectedContact.firstName || ""} ${
					selectedContact.lastName || ""
			  }`.trim() || "Client Name"
			: "Client Name";
		const senderName = currentUser?.name || "Your Name";
		const orgName = organization?.name || "Organization";

		return `Hi ${contactName},\n\n${replyBody}\n\nBest regards,\n${senderName}\n${orgName}`;
	};

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-3xl bg-background">
				<div className="flex flex-col h-full overflow-hidden">
					{/* Header */}
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

					{/* Thread Display - Scrollable (only show if there are messages) */}
					{thread && thread.length > 0 && (
						<div className="flex-1 overflow-y-auto py-6 px-6">
							<div className="space-y-6">
								{thread.map((message) => (
									<EmailMessageBubble key={message._id} message={message} />
								))}
								<div ref={messagesEndRef} />
							</div>
						</div>
					)}

					{/* Empty state for new emails */}
					{(!thread || thread.length === 0) && (
						<div className="flex-1 flex items-center justify-center text-muted-foreground py-6">
							<div className="text-center">
								<Send className="w-12 h-12 mx-auto mb-3 opacity-50" />
								<p className="text-sm">Start a new conversation</p>
							</div>
						</div>
					)}

					{/* Compose/Reply Section - Sticky Footer */}
					<div className="border-t border-border shrink-0 bg-background">
						<div className="p-6 space-y-4">
							{/* Contact Selector (only for new emails) */}
							{showSubjectField && allContacts && allContacts.length > 0 && (
								<div className="space-y-2">
									<label
										htmlFor="contact-select"
										className="text-sm font-medium text-foreground"
									>
										Send To
									</label>
									<StyledSelect
										value={selectedContactId ?? primaryContact?._id ?? ""}
										onValueChange={(value) =>
											setSelectedContactId(value as Id<"clientContacts">)
										}
									>
										<StyledSelectTrigger id="contact-select">
											<SelectValue placeholder="Select a contact" />
										</StyledSelectTrigger>
										<StyledSelectContent>
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
										</StyledSelectContent>
									</StyledSelect>
								</div>
							)}

							{/* Subject field (only for new emails) */}
							{showSubjectField && (
								<div className="space-y-2">
									<label
										htmlFor="email-subject"
										className="text-sm font-medium text-foreground"
									>
										Subject
									</label>
									<StyledInput
										id="email-subject"
										value={subject}
										onChange={(e) => setSubject(e.target.value)}
										placeholder="Enter email subject..."
										disabled={isSending}
									/>
								</div>
							)}

							{/* Message body */}
							<div className="space-y-2">
								<label
									htmlFor="reply-body"
									className="text-sm font-medium text-foreground"
								>
									{isNewEmail ? "Message" : "Reply to this thread"}
								</label>
								<Textarea
									id="reply-body"
									value={replyBody}
									onChange={(e) => setReplyBody(e.target.value)}
									placeholder="Type your message here..."
									className="min-h-[120px] resize-none"
									disabled={isSending}
								/>
								<div className="flex justify-between items-center text-sm text-muted-foreground">
									<span>{replyBody.length} characters</span>
									{/* Future: Attachment button */}
								</div>

								{/* Email Preview */}
								{replyBody.trim() && (
									<div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
										<div className="flex items-start gap-2 mb-2">
											<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
												Email Preview
											</div>
										</div>
										<div className="text-sm text-foreground/80 whitespace-pre-wrap font-mono">
											{getEmailPreview()}
										</div>
										<div className="mt-2 text-xs text-muted-foreground italic">
											This shows what your recipient will see (greeting and
											signature are auto-added)
										</div>
									</div>
								)}
							</div>

							<div className="flex justify-end gap-3">
								<StyledButton
									type="button"
									intent="outline"
									onClick={handleClose}
									label="Close"
									showArrow={false}
									disabled={isSending}
								/>
								<StyledButton
									type="button"
									intent="primary"
									onClick={handleSendEmail}
									isLoading={isSending}
									disabled={
										!replyBody.trim() ||
										(showSubjectField && !subject.trim()) ||
										isSending
									}
									label={
										isSending
											? "Sending..."
											: isNewEmail
											? "Send Email"
											: "Send Reply"
									}
									icon={!isSending && <Send className="w-4 h-4" />}
									showArrow={false}
								/>
							</div>
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

// Message Bubble Component
interface EmailMessageBubbleProps {
	message: {
		_id: Id<"emailMessages">;
		direction: "inbound" | "outbound";
		fromName: string;
		messageBody: string;
		htmlBody?: string;
		textBody?: string;
		visibleText?: string;
		sentAt: number;
		status: string;
		senderName?: string;
		senderAvatar?: string | null;
		hasAttachments?: boolean;
	};
}

function EmailMessageBubble({ message }: EmailMessageBubbleProps) {
	const isInbound = message.direction === "inbound";

	// Get attachments if any
	const attachments = useQuery(
		api.emailAttachments.listByEmail,
		message.hasAttachments ? { emailMessageId: message._id } : "skip"
	);

	return (
		<div
			className={cn("flex gap-3", isInbound ? "flex-row" : "flex-row-reverse")}
		>
			{/* Avatar */}
			<Avatar className="w-10 h-10 shrink-0">
				<AvatarImage src={message.senderAvatar || undefined} />
				<AvatarFallback
					className={cn(
						isInbound
							? "bg-blue-100 text-blue-700"
							: "bg-purple-100 text-purple-700"
					)}
				>
					{message.senderName?.[0] || message.fromName[0]}
				</AvatarFallback>
			</Avatar>

			{/* Message Content */}
			<div className={cn("flex-1 max-w-[85%] space-y-1")}>
				<div
					className={cn(
						"flex items-baseline gap-2",
						isInbound ? "flex-row" : "flex-row-reverse"
					)}
				>
					<span className="text-sm font-medium">
						{message.senderName || message.fromName}
					</span>
					<span className="text-xs text-muted-foreground">
						{formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
					</span>
				</div>

				<div
					className={cn(
						"rounded-lg px-4 py-3 text-sm",
						isInbound
							? "bg-muted text-foreground"
							: "bg-primary/10 text-primary ring-1 ring-primary/20 backdrop-blur-sm shadow-sm"
					)}
				>
					{/* Prefer the server-stripped visibleText (quotes/signature removed
					    on ingest); fall back to sanitized HTML for legacy messages,
					    else plain body. */}
					{message.visibleText ? (
						<div className="whitespace-pre-wrap [&>*:last-child]:mb-0">
							{message.visibleText}
						</div>
					) : message.htmlBody ? (
						<div
							className="prose prose-sm max-w-none dark:prose-invert [&>*:last-child]:mb-0"
							dangerouslySetInnerHTML={{
								__html: sanitizeHtml(message.htmlBody),
							}}
						/>
					) : (
						<div className="whitespace-pre-wrap [&>*:last-child]:mb-0">
							{message.messageBody}
						</div>
					)}

					{/* Attachments */}
					{message.hasAttachments && attachments && attachments.length > 0 && (
						<div className="mt-3 pt-3 border-t border-border/50 space-y-2">
							{attachments.map((attachment) => (
								<AttachmentCard key={attachment._id} attachment={attachment} />
							))}
						</div>
					)}
				</div>

				{/* Status indicator for outbound messages */}
				{!isInbound && (
					<div className="text-xs text-muted-foreground text-right">
						{message.status === "delivered" && "✓ Delivered"}
						{message.status === "opened" && "✓✓ Opened"}
						{message.status === "sent" && "✓ Sent"}
						{message.status === "bounced" && "⚠ Bounced"}
					</div>
				)}
			</div>
		</div>
	);
}

// Attachment Card Component
interface AttachmentData {
	_id: Id<"emailAttachments">;
	filename: string;
	size: number;
	contentType: string;
}

function AttachmentCard({ attachment }: { attachment: AttachmentData }) {
	const downloadUrl = useQuery(api.emailAttachments.getDownloadUrl, {
		attachmentId: attachment._id,
	});

	return (
		<a
			href={downloadUrl || "#"}
			download={attachment.filename}
			className={cn(
				"flex items-center gap-2 p-2 rounded bg-background/50 hover:bg-background/80 transition-colors",
				!downloadUrl && "opacity-50 cursor-not-allowed"
			)}
			onClick={(e) => {
				if (!downloadUrl) {
					e.preventDefault();
				}
			}}
		>
			<Paperclip className="w-4 h-4" />
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate">{attachment.filename}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(attachment.size)}
				</p>
			</div>
			<Download className="w-4 h-4 shrink-0" />
		</a>
	);
}

// Helper functions
function sanitizeHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [
			"p",
			"br",
			"b",
			"i",
			"u",
			"strong",
			"em",
			"a",
			"ul",
			"ol",
			"li",
			"span",
			"div",
		],
		ALLOWED_ATTR: ["href", "target", "rel", "class"],
	});
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export default EmailThreadSheet;
