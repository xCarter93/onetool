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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
	EmailComposer,
	type EmailComposerPayload,
} from "@/components/shared/email/email-composer";

interface NewEmailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Standalone compose: pick a client contact, add a subject, write, send. */
export function NewEmailDialog({ open, onOpenChange }: NewEmailDialogProps) {
	const toast = useToast();
	const sendClientEmail = useMutation(api.resend.sendClientEmail);

	const [clientId, setClientId] = useState<Id<"clients"> | null>(null);
	const [contactId, setContactId] = useState<Id<"clientContacts"> | null>(null);
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

	const selectedContact = contactId
		? contacts?.find((c) => c._id === contactId)
		: primaryContact;

	const resetAndClose = () => {
		setClientId(null);
		setContactId(null);
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
			toast.error(
				"No email address",
				"The selected contact doesn't have an email address."
			);
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
			});
			toast.success("Email sent", `Sent to ${selectedContact.email}.`);
			resetAndClose();
			return true;
		} catch (error) {
			toast.error(
				"Couldn't send",
				error instanceof Error ? error.message : "Please try again."
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
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
								onChange={(id) => {
									setClientId(id);
									setContactId(null);
								}}
							/>
						</div>

						<div className="space-y-1.5">
							<label
								htmlFor="new-email-contact"
								className="text-sm font-medium text-foreground"
							>
								Send to
							</label>
							<Select
								value={selectedContact?._id ?? ""}
								onValueChange={(value) =>
									setContactId(value as Id<"clientContacts">)
								}
								disabled={!clientId}
							>
								<SelectTrigger id="new-email-contact" className="w-full">
									<SelectValue
										placeholder={
											clientId ? "Select a contact" : "Pick a client first"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{(contacts ?? []).map((contact) => (
										<SelectItem key={contact._id} value={contact._id}>
											<span className="flex items-center gap-2">
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
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{clientId && contacts && contacts.length === 0 && (
								<p className="text-xs text-muted-foreground">
									This client has no contacts yet. Add one on their page first.
								</p>
							)}
						</div>
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
