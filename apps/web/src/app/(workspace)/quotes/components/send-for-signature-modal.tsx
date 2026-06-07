"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Mail } from "lucide-react";
import { Recipient } from "@/types/quote";

interface SendForSignatureModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (recipients: Recipient[], message?: string) => Promise<void>;
	primaryContact?: {
		firstName: string;
		lastName: string;
		email?: string;
	} | null;
	isLoading?: boolean;
}

export function SendForSignatureModal({
	isOpen,
	onClose,
	onConfirm,
	primaryContact,
	isLoading = false,
}: SendForSignatureModalProps) {
	const [recipients, setRecipients] = useState<Recipient[]>([]);
	const [message, setMessage] = useState("");

	// Reset recipients/message when the modal opens, closes, or contact changes
	const [prevState, setPrevState] = useState({ isOpen, primaryContact });
	if (
		prevState.isOpen !== isOpen ||
		prevState.primaryContact !== primaryContact
	) {
		setPrevState({ isOpen, primaryContact });
		if (isOpen && primaryContact?.email) {
			setRecipients([
				{
					id: crypto.randomUUID(),
					name: `${primaryContact.firstName} ${primaryContact.lastName}`,
					email: primaryContact.email,
					signerType: "Signer",
				},
			]);
		} else if (isOpen && !primaryContact?.email) {
			setRecipients([
				{ id: crypto.randomUUID(), name: "", email: "", signerType: "Signer" },
			]);
		} else if (!isOpen) {
			setRecipients([]);
			setMessage("");
		}
	}

	const addRecipient = () => {
		setRecipients([
			...recipients,
			{ id: crypto.randomUUID(), name: "", email: "", signerType: "CC" },
		]);
	};

	const removeRecipient = (id: string) => {
		setRecipients(recipients.filter((r) => r.id !== id));
	};

	const updateRecipient = (
		id: string,
		field: keyof Recipient,
		value: string
	) => {
		setRecipients(
			recipients.map((r) => (r.id === id ? { ...r, [field]: value } : r))
		);
	};

	const handleSend = async () => {
		const validRecipients = recipients.filter((r) => r.name && r.email);
		if (validRecipients.length === 0) return;
		await onConfirm(validRecipients, message || undefined);
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Send Quote for Signature"
			size="2xl"
		>
			<div className="space-y-4">
				{/* Recipients list */}
				<div className="space-y-3">
					{recipients.map((recipient, index) => (
						<div key={recipient.id} className="flex gap-2 items-start">
							<Input
								placeholder="Name"
								value={recipient.name}
								onChange={(e) =>
									updateRecipient(recipient.id, "name", e.target.value)
								}
								className="flex-1"
							/>
							<Input
								placeholder="Email"
								type="email"
								value={recipient.email}
								onChange={(e) =>
									updateRecipient(recipient.id, "email", e.target.value)
								}
								className="flex-1"
							/>
							<select
								value={recipient.signerType}
								onChange={(e) =>
									updateRecipient(
										recipient.id,
										"signerType",
										e.target.value as "Signer" | "CC"
									)
								}
								className="px-3 py-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white"
							>
								<option value="Signer">Signer</option>
								<option value="CC">CC</option>
							</select>
							{index > 0 && (
								<Button
									size="sm"
									intent="outline"
									onClick={() => removeRecipient(recipient.id)}
								>
									<X className="h-4 w-4" />
								</Button>
							)}
						</div>
					))}
				</div>

				<Button intent="outline" size="sm" onClick={addRecipient}>
					<Plus className="h-4 w-4 mr-2" />
					Add Recipient
				</Button>

				{/* Message */}
				<textarea
					placeholder="Optional message to recipients"
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					className="w-full min-h-[100px] px-3 py-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white"
				/>

				{/* Actions */}
				<div className="flex justify-end gap-2">
					<Button intent="outline" onClick={onClose} isDisabled={isLoading}>
						Cancel
					</Button>
					<Button onClick={handleSend} isPending={isLoading}>
						<Mail className="h-4 w-4 mr-2" />
						Send for Signature
					</Button>
				</div>
			</div>
		</Modal>
	);
}
