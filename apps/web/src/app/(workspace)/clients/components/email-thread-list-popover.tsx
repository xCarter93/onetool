"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Mail, MailOpen, MessageSquare, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { EmailThreadSheet } from "./email-thread-sheet";

interface EmailThreadListPopoverProps {
	clientId: Id<"clients">;
	children: React.ReactNode;
}

export function EmailThreadListPopover({
	clientId,
	children,
}: EmailThreadListPopoverProps) {
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedThreadId, setSelectedThreadId] = useState<
		string | undefined
	>();

	// Fetch all email threads for this client
	const threads = useQuery(api.emailMessages.listThreadsByClient, { clientId }) as
		| Array<{
				threadId: string;
				subject: string;
				latestMessage: string;
				latestMessageAt: number;
				messageCount: number;
				hasUnread: boolean;
				participants: string[];
		  }>
		| undefined;

	const handleThreadClick = (threadId: string) => {
		setSelectedThreadId(threadId);
		setPopoverOpen(false);
		setSheetOpen(true);
	};

	return (
		<>
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>{children}</PopoverTrigger>
				<PopoverContent
					className="w-96 p-0 bg-background! backdrop-blur-xl border-border shadow-xl"
					align="end"
				>
					<div className="flex flex-col max-h-[500px]">
						{/* Header */}
						<div className="px-4 py-3 border-b border-border bg-background">
							<h3 className="font-semibold text-sm">Email Threads</h3>
						</div>

						{/* Thread List */}
						<div className="overflow-y-auto bg-background">
							{threads === undefined ? (
								<div
									className="px-4 py-8 flex flex-col items-center justify-center gap-3"
									aria-busy="true"
									aria-live="polite"
								>
									<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
									<span className="text-sm text-muted-foreground">
										Loading email threads...
									</span>
									<span className="sr-only">
										Loading email threads, please wait
									</span>
								</div>
							) : threads.length === 0 ? (
								<div className="px-4 py-8 text-center text-sm text-muted-foreground">
									<MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
									<p>No email threads yet</p>
									<p className="text-xs mt-1">
										Send an email to start a conversation
									</p>
								</div>
							) : (
								<div className="divide-y divide-border">
									{threads.map((thread) => (
										<button
											key={thread.threadId}
											onClick={() => handleThreadClick(thread.threadId)}
											className="w-full px-4 py-3 text-left hover:bg-accent transition-colors"
										>
											<div className="flex items-start gap-3">
												{/* Icon */}
												<div
													className={cn(
														"mt-0.5",
														thread.hasUnread
															? "text-primary"
															: "text-muted-foreground"
													)}
												>
													{thread.hasUnread ? (
														<Mail className="w-4 h-4" />
													) : (
														<MailOpen className="w-4 h-4" />
													)}
												</div>

												{/* Content */}
												<div className="flex-1 min-w-0">
													<div className="flex items-baseline justify-between gap-2 mb-1">
														<h4
															className={cn(
																"text-sm truncate",
																thread.hasUnread
																	? "font-semibold"
																	: "font-medium"
															)}
														>
															{thread.subject}
														</h4>
														<span className="text-xs text-muted-foreground shrink-0">
															{formatDistanceToNow(
																new Date(thread.latestMessageAt),
																{
																	addSuffix: true,
																}
															)}
														</span>
													</div>
													<p className="text-xs text-muted-foreground line-clamp-2">
														{thread.latestMessage}
													</p>
													<div className="flex items-center gap-2 mt-1">
														<span className="text-xs text-muted-foreground">
															{thread.messageCount}{" "}
															{thread.messageCount === 1
																? "message"
																: "messages"}
														</span>
														{thread.hasUnread && (
															<span className="text-xs font-medium text-primary">
																• New
															</span>
														)}
													</div>
												</div>
											</div>
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</PopoverContent>
			</Popover>

			{/* Email Thread Sheet */}
			<EmailThreadSheet
				isOpen={sheetOpen}
				onOpenChange={setSheetOpen}
				clientId={clientId}
				threadId={selectedThreadId}
				mode={selectedThreadId ? "reply" : "new"}
				onComplete={() => {
					setSheetOpen(false);
				}}
			/>
		</>
	);
}
