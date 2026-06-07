"use client";

import { useState } from "react";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import { Mail, X } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";

interface SendClientEmailPopoverProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	clientId: Id<"clients">;
	clientName: string;
	primaryContact?: {
		firstName: string;
		lastName: string;
		email?: string;
	} | null;
	children: React.ReactNode;
}

export function SendClientEmailPopover({
	isOpen,
	onOpenChange,
	clientId,
	primaryContact,
	children,
}: SendClientEmailPopoverProps) {
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [isSending, setIsSending] = useState(false);

	const sendEmail = useMutation(api.resend.sendClientEmail);
	const toast = useToast();

	// Reset form when popover opens
	const [wasOpen, setWasOpen] = useState(isOpen);
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) {
			setSubject("");
			setMessage("");
		}
	}

	const handleSend = async () => {
		if (!primaryContact?.email) {
			toast.error(
				"Error",
				"Client does not have a valid primary contact email"
			);
			return;
		}

		if (!subject.trim()) {
			toast.error("Error", "Please enter an email subject");
			return;
		}

		if (!message.trim()) {
			toast.error("Error", "Please enter an email message");
			return;
		}

		setIsSending(true);

		try {
			await sendEmail({
				clientId,
				subject: subject.trim(),
				messageBody: message.trim(),
			});

			toast.success("Email Sent", "Your email has been sent successfully");
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to send email. Please try again.";
			toast.error("Error", message);
		} finally {
			setIsSending(false);
		}
	};

	const handleCancel = () => {
		onOpenChange(false);
	};

	const canSend =
		primaryContact?.email && subject.trim() && message.trim() && !isSending;

	return (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				align="end"
				side="top"
				sideOffset={12}
				className="w-[650px] p-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl"
			>
				<div className="flex flex-col">
					{/* Header */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
						<div className="flex items-center gap-2">
							<Mail className="h-5 w-5 text-primary" />
							<h3 className="font-semibold text-gray-900 dark:text-white">
								Send Email to Client
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
						{/* Recipient Info */}
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

						{/* Subject Line */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Subject
							</label>
							<input
								type="text"
								placeholder="Enter email subject..."
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
						</div>

						{/* Message Body */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Message
							</label>
							<textarea
								placeholder="Enter your message..."
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								className="w-full min-h-[200px] px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
							/>
							<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Your email will include your organization&apos;s branding
							</p>
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
							{isSending ? "Sending..." : "Send Email"}
							{!isSending && canSend && (
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
