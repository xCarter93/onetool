"use client";

import { useState } from "react";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { TagsInput } from "@/components/ui/tags-input";
import { Mail, X, FileText } from "lucide-react";
import { Recipient } from "@/types/quote";

interface SendEmailPopoverProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (recipients: Recipient[], message?: string) => Promise<void>;
	primaryContact?: {
		firstName: string;
		lastName: string;
		email?: string;
	} | null;
	quoteNumber?: string;
	documentVersion?: number;
	children: React.ReactNode;
}

const isValidEmail = (email: string): boolean => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
};

export function SendEmailPopover({
	isOpen,
	onOpenChange,
	onConfirm,
	primaryContact,
	quoteNumber,
	documentVersion,
	children,
}: SendEmailPopoverProps) {
	const [ccEmails, setCcEmails] = useState<string[]>([]);
	const [message, setMessage] = useState("");
	const [isSending, setIsSending] = useState(false);

	// Reset form when popover opens
	const [wasOpen, setWasOpen] = useState(isOpen);
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setCcEmails([]);
			setMessage("");
		}
	}

	const handleSend = async () => {
		if (!primaryContact?.email) {
			return;
		}

		// Validate all CC emails
		const invalidEmails = ccEmails.filter((email) => !isValidEmail(email));
		if (invalidEmails.length > 0) {
			return;
		}

		setIsSending(true);

		try {
			// Build recipients array
			const recipients: Recipient[] = [
				{
					id: crypto.randomUUID(),
					name: `${primaryContact.firstName} ${primaryContact.lastName}`,
					email: primaryContact.email,
					signerType: "Signer",
				},
				...ccEmails.map((email) => ({
					id: crypto.randomUUID(),
					name: email,
					email: email,
					signerType: "CC" as const,
				})),
			];

			await onConfirm(recipients, message || undefined);
			onOpenChange(false);
		} catch (error) {
			// Error handling is done in parent component
			console.error("Send failed:", error);
		} finally {
			setIsSending(false);
		}
	};

	const handleCancel = () => {
		onOpenChange(false);
	};

	const canSend =
		primaryContact?.email &&
		ccEmails.every((email) => isValidEmail(email)) &&
		!isSending;

	return (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				align="end"
				side="top"
				sideOffset={12}
				className="w-[550px] p-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl"
			>
				<div className="flex flex-col">
					{/* Header */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
						<div className="flex items-center gap-2">
							<Mail className="h-5 w-5 text-primary" />
							<h3 className="font-semibold text-gray-900 dark:text-white">
								Send Quote for Signature
							</h3>
						</div>
						<button
							onClick={handleCancel}
							className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
						>
							<X className="h-4 w-4" />
						</button>
					</div>

					{/* Content */}
					<div className="px-6 py-4 space-y-4">
						{/* Document Badge */}
						{quoteNumber && (
							<div className="flex items-center gap-2">
								<FileText className="h-4 w-4 text-gray-400" />
								<Badge variant="outline" className="text-xs">
									Quote {quoteNumber}
									{documentVersion && ` - v${documentVersion}`}
								</Badge>
							</div>
						)}

						{/* Primary Recipient */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								To
							</label>
							<div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
								<Mail className="h-4 w-4 text-gray-400" />
								<div className="flex-1 text-sm text-gray-900 dark:text-white">
									{primaryContact?.email ? (
										<>
											<span className="font-medium">
												{primaryContact.firstName} {primaryContact.lastName}
											</span>
											<span className="text-gray-500 dark:text-gray-400">
												{" "}
												({primaryContact.email})
											</span>
										</>
									) : (
										<span className="text-gray-500 dark:text-gray-400">
											No primary contact email
										</span>
									)}
								</div>
							</div>
						</div>

						{/* CC Recipients */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								CC Recipients (optional)
							</label>
							<TagsInput
								tags={ccEmails}
								setTags={setCcEmails}
								editTag={false}
								className="min-h-[42px]"
							/>
							<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Add email and press Enter
							</p>
						</div>

						{/* Message */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Message (optional)
							</label>
							<textarea
								placeholder="Add a message to your email..."
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								className="w-full min-h-[80px] px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
							/>
						</div>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
						<button
							onClick={handleCancel}
							disabled={isSending}
							className={`group inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200 px-4 py-2 rounded-lg ring-1 shadow-sm hover:shadow-md backdrop-blur-sm text-gray-600 hover:text-gray-700 bg-white hover:bg-gray-50 ring-gray-200 hover:ring-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:bg-gray-900 dark:hover:bg-gray-800 dark:ring-gray-700 dark:hover:ring-gray-600 ${isSending ? "opacity-50 cursor-not-allowed" : ""}`}
						>
							Cancel
							{!isSending && (
								<span
									aria-hidden="true"
									className="group-hover:translate-x-1 transition-transform duration-200"
								>
									→
								</span>
							)}
						</button>
						<button
							onClick={handleSend}
							disabled={!canSend}
							className={`group inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200 px-4 py-2 rounded-lg ring-1 shadow-sm hover:shadow-md backdrop-blur-sm text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40 ${!canSend ? "opacity-50 cursor-not-allowed" : ""}`}
						>
							<Mail className="h-4 w-4" />
							{isSending ? "Sending..." : "Send"}
							{!isSending && (
								<span
									aria-hidden="true"
									className="group-hover:translate-x-1 transition-transform duration-200"
								>
									→
								</span>
							)}
						</button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
