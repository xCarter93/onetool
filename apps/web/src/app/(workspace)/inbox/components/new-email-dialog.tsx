"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
	EmailComposer,
	type EmailComposerPayload,
} from "@/components/shared/email/email-composer";
import {
	EmailRecipientsField,
	type RecipientsValue,
} from "@/components/shared/email/email-recipients-field";
import {
	toOutboundAttachments,
	type ComposerAttachment,
} from "@/components/shared/email/attachment-types";
import { emailSendErrorMessage } from "@/components/shared/email/send-error";

const NO_RECIPIENTS: RecipientsValue = { to: [], cc: [], bcc: [] };

/** Case-insensitive dedupe that also drops anything already addressed in `to`. */
function mergeCc(to: string[], cc: string[]): string[] {
	const seen = new Set(to.map((email) => email.toLowerCase()));
	return cc.filter((email) => {
		const key = email.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

interface NewEmailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Standalone compose: pick a client contact, add a subject, write, send. */
export function NewEmailDialog({ open, onOpenChange }: NewEmailDialogProps) {
	const toast = useToast();
	const sendClientEmail = useMutation(api.resend.sendClientEmail);

	const [clientId, setClientId] = useState<Id<"clients"> | null>(null);
	const [recipients, setRecipients] = useState<RecipientsValue>(NO_RECIPIENTS);
	const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
	const [subject, setSubject] = useState("");
	const [isSending, setIsSending] = useState(false);

	const contacts = useQuery(
		api.clientContacts.listByClient,
		clientId ? { clientId } : "skip"
	);
	const primaryContact = useQuery(
		api.clientContacts.getPrimaryContact,
		clientId ? { clientId } : "skip"
	);

	const [lastClientId, setLastClientId] = useState<Id<"clients"> | null>(null);
	const [seeded, setSeeded] = useState(false);
	if (lastClientId !== clientId) {
		setLastClientId(clientId);
		setRecipients(NO_RECIPIENTS);
		setSeeded(false);
	} else if (clientId && !seeded && primaryContact?.email) {
		setSeeded(true);
		setRecipients({ to: [primaryContact.email], cc: [], bcc: [] });
	}

	const suggestions = (contacts ?? []).flatMap((contact) =>
		contact.email
			? [
					{
						email: contact.email,
						name: `${contact.firstName} ${contact.lastName}`.trim(),
					},
				]
			: []
	);

	const selectedContact = contacts?.find(
		(contact) =>
			contact.email?.toLowerCase() === recipients.to[0]?.toLowerCase()
	);

	const resetAndClose = () => {
		setClientId(null);
		setRecipients(NO_RECIPIENTS);
		setAttachments([]);
		setSubject("");
		onOpenChange(false);
	};

	const handleSend = async (
		payload: EmailComposerPayload
	): Promise<boolean> => {
		if (!clientId) {
			toast.error("Pick a client", "Choose who this email is for.");
			return false;
		}
		if (!selectedContact?.email) {
			toast.error("Add a recipient", "Choose a contact to send this to.");
			return false;
		}
		if (!subject.trim()) {
			toast.error("Subject required", "Add a subject before sending.");
			return false;
		}
		setIsSending(true);
		try {
			await sendClientEmail({
				clientId,
				contactId: selectedContact._id,
				subject: subject.trim(),
				messageBody: payload.text,
				messageHtml: payload.html,
				cc: recipients.cc,
				bcc: recipients.bcc,
				attachments: toOutboundAttachments(attachments),
			});
			toast.success("Email sent", `Sent to ${selectedContact.email}.`);
			resetAndClose();
			return true;
		} catch (error) {
			toast.error(
				"Couldn't send",
				emailSendErrorMessage(error, "Please try again.")
			);
			return false;
		} finally {
			setIsSending(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) resetAndClose();
			}}
		>
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>New email</DialogTitle>
					<DialogDescription>
						Sent from your OneTool address; the reply lands back in this inbox.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 p-4 pt-2">
					<div className="space-y-1.5">
						<label
							htmlFor="new-email-client"
							className="text-sm font-medium text-foreground"
						>
							Client
						</label>
						<ClientPicker
							id="new-email-client"
							value={clientId}
							onChange={setClientId}
						/>
					</div>

					<div
						role="group"
						aria-labelledby="new-email-recipients-label"
						className="space-y-1.5"
					>
						<span
							id="new-email-recipients-label"
							className="block text-sm font-medium text-foreground"
						>
							Recipients
						</span>
						<EmailRecipientsField
							value={recipients}
							// sendClientEmail addresses one contact; the rest move to cc.
							onChange={(next) => {
								const to = next.to.slice(-1);
								setRecipients({
									...next,
									to,
									cc: mergeCc(to, [...next.cc, ...next.to.slice(0, -1)]),
								});
							}}
							suggestions={suggestions}
							toLocked
							disabled={!clientId || isSending}
						/>
						{!clientId && (
							<p className="text-xs text-muted-foreground">
								Choose a client to add recipients.
							</p>
						)}
						{clientId && contacts && contacts.length === 0 && (
							<p className="text-xs text-muted-foreground">
								This client has no contacts yet. Add one on their page first.
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="new-email-subject"
							className="text-sm font-medium text-foreground"
						>
							Subject
						</label>
						<Input
							id="new-email-subject"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							placeholder="What's this about?"
							disabled={isSending}
						/>
					</div>

					<div className="space-y-1.5">
						<span className="text-sm font-medium text-foreground">Message</span>
						<EmailComposer
							onSend={handleSend}
							isSending={isSending}
							placeholder="Write your message…"
							sendLabel="Send email"
							disabled={!clientId}
							size="large"
							attachments={attachments}
							onAttachmentsChange={setAttachments}
						/>
						<p className="text-xs text-muted-foreground">
							A greeting and your signature are added automatically.
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ClientPicker({
	id,
	value,
	onChange,
}: {
	id: string;
	value: Id<"clients"> | null;
	onChange: (clientId: Id<"clients">) => void;
}) {
	const [open, setOpen] = useState(false);
	// Subscribe only while the picker is open or a name needs resolving.
	const clients = useQuery(api.clients.list, open || value ? {} : "skip");
	const selected = value ? clients?.find((c) => c._id === value) : null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						id={id}
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between font-normal"
					>
						<span className={cn(!selected && "text-muted-foreground")}>
							{selected?.companyName ?? "Choose a client"}
						</span>
						<ChevronsUpDown
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-(--anchor-width) p-0">
				<Command>
					<CommandInput placeholder="Search clients…" />
					<CommandList>
						<CommandEmpty>
							{clients === undefined ? "Loading clients…" : "No clients found."}
						</CommandEmpty>
						{clients && clients.length > 0 && (
							<CommandGroup>
								{clients.map((client) => (
									<CommandItem
										key={client._id}
										value={client.companyName}
										onSelect={() => {
											onChange(client._id);
											setOpen(false);
										}}
										className="cursor-pointer"
									>
										<Check
											className={cn(
												"size-4",
												client._id === value ? "opacity-100" : "opacity-0"
											)}
											aria-hidden="true"
										/>
										<span className="truncate">{client.companyName}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
