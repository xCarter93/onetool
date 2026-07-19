"use client";

import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { EmailThreadSummary } from "@onetool/backend/convex/emailMessages";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Plus,
	ChevronLeft,
	ChevronRight,
	Mail,
	MailOpen,
} from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const THREADS_PER_PAGE = 5;

interface EmailsTabProps {
	threads: EmailThreadSummary[] | undefined;
	onComposeEmail: () => void;
	onThreadClick?: (threadDocId: Id<"emailThreads">) => void;
}

export function EmailsTab({
	threads,
	onComposeEmail,
	onThreadClick,
}: EmailsTabProps) {
	const [currentPage, setCurrentPage] = useState(1);

	const allThreads = threads ?? [];
	const totalThreads = allThreads.length;
	const totalPages = Math.max(1, Math.ceil(totalThreads / THREADS_PER_PAGE));
	const startIdx = (currentPage - 1) * THREADS_PER_PAGE;
	const paginated = allThreads.slice(startIdx, startIdx + THREADS_PER_PAGE);

	return (
		<div>
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Email Threads ({totalThreads})
				</h3>
				<Button variant="outline" size="sm" onClick={onComposeEmail}>
					<Plus className="h-4 w-4" />
					Compose
				</Button>
			</div>
			<Separator className="mb-4" />

			{totalThreads === 0 ? (
				<EmptyState
					size="md"
					illustration="messages-none"
					title="No email threads yet"
					description="Compose an email to start a conversation"
				/>
			) : (
				<div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
					{paginated.map((thread) => (
						<button
							key={thread.threadDocId}
							onClick={() => onThreadClick?.(thread.threadDocId)}
							className="w-full px-4 py-3 text-left hover:bg-accent transition-colors"
						>
							<div className="flex items-start gap-3">
								<div
									className={cn(
										"mt-0.5",
										thread.hasUnread ? "text-primary" : "text-muted-foreground"
									)}
								>
									{thread.hasUnread ? (
										<Mail className="w-4 h-4" />
									) : (
										<MailOpen className="w-4 h-4" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-baseline justify-between gap-2 mb-1">
										<h4
											className={cn(
												"text-sm truncate",
												thread.hasUnread ? "font-semibold" : "font-medium"
											)}
										>
											{thread.subject}
										</h4>
										<span className="text-xs text-muted-foreground shrink-0">
											{formatDistanceToNow(new Date(thread.latestMessageAt), {
												addSuffix: true,
											})}
										</span>
									</div>
									<p className="text-xs text-muted-foreground line-clamp-2">
										{thread.latestMessage}
									</p>
									<div className="flex items-center gap-2 mt-1">
										<span className="text-xs text-muted-foreground">
											{thread.messageCount}{" "}
											{thread.messageCount === 1 ? "message" : "messages"}
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

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
					<span className="text-xs text-muted-foreground">
						{startIdx + 1}–{Math.min(startIdx + THREADS_PER_PAGE, totalThreads)}{" "}
						of {totalThreads}
					</span>
					<div className="flex items-center gap-1">
						<button
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
							className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span className="text-xs text-muted-foreground px-2">
							{currentPage} / {totalPages}
						</span>
						<button
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
							disabled={currentPage === totalPages}
							className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
