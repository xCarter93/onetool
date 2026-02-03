"use client";

import { Mail, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface EmailActivityListProps {
	emails: Doc<"emailMessages">[];
	onThreadClick?: (threadId: string) => void;
}

function formatTimestamp(timestamp: number) {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) {
		return "Just now";
	} else if (diffMins < 60) {
		return `${diffMins}m ago`;
	} else if (diffHours < 24) {
		return `${diffHours}h ago`;
	} else if (diffDays < 7) {
		return `${diffDays}d ago`;
	} else {
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
		});
	}
}

function getStatusDot(status: string) {
	switch (status) {
		case "delivered":
		case "opened":
			return "bg-green-500";
		case "bounced":
		case "complained":
			return "bg-red-500";
		case "sent":
			return "bg-blue-500";
		default:
			return "bg-muted-foreground";
	}
}

export function EmailActivityList({
	emails,
	onThreadClick,
}: EmailActivityListProps) {
	if (emails.length === 0) {
		return (
			<div className="text-center py-8">
				<div className="flex justify-center mb-3">
					<Mail className="h-12 w-12 text-muted-foreground/40" />
				</div>
				<p className="text-sm text-muted-foreground">
					No emails sent to this client yet
				</p>
			</div>
		);
	}

	return (
		<div className="divide-y divide-border">
			{emails.map((email) => {
				const isInbound = email.direction === "inbound";
				return (
					<button
						key={email._id}
						type="button"
						onClick={() => {
							const id = email.threadId || email._id;
							onThreadClick?.(id);
						}}
						className={cn(
							"flex items-center gap-3 w-full text-left px-3 py-3",
							"hover:bg-muted/50 transition-colors cursor-pointer"
						)}
					>
						{/* Direction indicator */}
						<div
							className={cn(
								"flex items-center justify-center w-7 h-7 rounded-full shrink-0",
								isInbound
									? "bg-blue-500/10 text-blue-500"
									: "bg-primary/10 text-primary"
							)}
						>
							{isInbound ? (
								<ArrowDownLeft className="h-3.5 w-3.5" />
							) : (
								<ArrowUpRight className="h-3.5 w-3.5" />
							)}
						</div>

						{/* Subject + preview */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-sm font-medium text-foreground truncate">
									{email.subject ?? "(No Subject)"}
								</span>
								<span
									className={cn(
										"w-1.5 h-1.5 rounded-full shrink-0",
										getStatusDot(email.status)
									)}
								/>
							</div>
							{email.messagePreview && (
								<p className="text-xs text-muted-foreground truncate mt-0.5">
									{email.messagePreview}
								</p>
							)}
						</div>

						{/* Timestamp */}
						<span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
							{formatTimestamp(email.sentAt)}
						</span>
					</button>
				);
			})}
		</div>
	);
}
