"use client";

import { useState, useEffect } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { TagsInput } from "@/components/ui/tags-input";
import { Mail, Send, FileText, Users, User } from "lucide-react";
import { Recipient } from "@/types/quote";

interface SendEmailSheetProps {
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
	countersigner?: {
		name: string;
		email: string;
	} | null;
	signingOrder?: "client_first" | "org_first";
}

const isValidEmail = (email: string): boolean => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
};

export function SendEmailSheet({
	isOpen,
	onOpenChange,
	onConfirm,
	primaryContact,
	quoteNumber,
	documentVersion,
	countersigner,
	signingOrder = "client_first",
}: SendEmailSheetProps) {
	const [ccEmails, setCcEmails] = useState<string[]>([]);
	const [message, setMessage] = useState("");
	const [isSending, setIsSending] = useState(false);

	// Reset form when sheet opens
	useEffect(() => {
		if (isOpen) {
			setCcEmails([]);
			setMessage("");
		}
	}, [isOpen]);

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
			// Build recipients array with correct signer order
			const recipients: Recipient[] = [];

			// Determine signer order numbers
			const clientSignerOrder = signingOrder === "org_first" ? 2 : 1;
			const orgSignerOrder = signingOrder === "org_first" ? 1 : 2;

			// Add client (primary contact) as signer
			recipients.push({
				id: crypto.randomUUID(),
				name: `${primaryContact.firstName} ${primaryContact.lastName}`,
				email: primaryContact.email,
				signerType: "Signer",
				signerOrder: countersigner ? clientSignerOrder : 1,
			});

			// Add countersigner if present
			if (countersigner) {
				recipients.push({
					id: crypto.randomUUID(),
					name: countersigner.name,
					email: countersigner.email,
					signerType: "Signer",
					signerOrder: orgSignerOrder,
				});
			}

			// Add CC recipients
			ccEmails.forEach((email) => {
				recipients.push({
					id: crypto.randomUUID(),
					name: email,
					email: email,
					signerType: "CC",
				});
			});

			await onConfirm(recipients, message || undefined);
			onOpenChange(false);
		} catch (error) {
			// Error handling is done in parent component
			console.error("Send failed:", error);
		} finally {
			setIsSending(false);
		}
	};

	const handleClose = () => {
		onOpenChange(false);
	};

	const canSend =
		primaryContact?.email &&
		ccEmails.every((email) => isValidEmail(email)) &&
		!isSending;

	// Get signer order display
	const getSignerOrderDisplay = () => {
		if (!countersigner) return null;
		if (signingOrder === "org_first") {
			return "Organization signs first, then client";
		}
		return "Client signs first, then organization";
	};

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full sm:max-w-3xl p-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-l border-gray-200 dark:border-gray-700"
			>
				<div className="flex flex-col h-full">
					{/* Header */}
					<SheetHeader className="flex flex-row items-center gap-2 px-6 py-4 border-b border-gray-200 dark:border-gray-700 space-y-0">
						<Mail className="h-5 w-5 text-primary shrink-0" />
						<SheetTitle>Send Quote for Signature</SheetTitle>
					</SheetHeader>

					{/* Content - Scrollable */}
					<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
								<User className="h-4 w-4 text-gray-400" />
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
											{countersigner && (
												<Badge variant="outline" className="ml-2 text-xs">
													{signingOrder === "org_first"
														? "Signs second"
														: "Signs first"}
												</Badge>
											)}
										</>
									) : (
										<span className="text-gray-500 dark:text-gray-400">
											No primary contact email
										</span>
									)}
								</div>
							</div>
						</div>

						{/* Countersigner Card (if applicable) */}
						{countersigner && (
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
									Organization Countersigner
								</label>
								<div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
									<Users className="h-4 w-4 text-gray-400" />
									<div className="flex-1 text-sm text-gray-900 dark:text-white">
										<span className="font-medium">{countersigner.name}</span>
										<span className="text-gray-500 dark:text-gray-400">
											{" "}
											({countersigner.email})
										</span>
										<Badge variant="outline" className="ml-2 text-xs">
											{signingOrder === "org_first"
												? "Signs first"
												: "Signs second"}
										</Badge>
									</div>
								</div>
								{/* Signing Order Info */}
								<div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
									<span className="text-xs text-amber-700 dark:text-amber-400">
										{getSignerOrderDisplay()}
									</span>
								</div>
							</div>
						)}

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
								disabled={isSending}
								className="w-full min-h-[80px] px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
							/>
						</div>

						{/* Summary */}
						{countersigner && (
							<div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
								<h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
									Signature Request Summary
								</h4>
								<div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
									<div className="flex justify-between">
										<span>Total signers:</span>
										<span className="font-medium text-gray-900 dark:text-white">
											{countersigner ? 2 : 1}
										</span>
									</div>
									<div className="flex justify-between">
										<span>CC recipients:</span>
										<span className="font-medium text-gray-900 dark:text-white">
											{ccEmails.length}
										</span>
									</div>
									<div className="flex justify-between">
										<span>Signing order:</span>
										<span className="font-medium text-gray-900 dark:text-white">
											{signingOrder === "org_first"
												? "Org → Client"
												: "Client → Org"}
										</span>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
						<button
							onClick={handleClose}
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
							<Send className="h-4 w-4" />
							{isSending ? "Sending..." : "Send for Signature"}
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
			</SheetContent>
		</Sheet>
	);
}
