"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { EmailThreadSummary } from "@onetool/backend/convex/emailMessages";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Mail, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmailThreadListPopover } from "./email-thread-list-popover";

interface EmailThreadListButtonProps {
	clientId: Id<"clients">;
	variant?: "button" | "icon";
}

export function EmailThreadListButton({
	clientId,
	variant = "button",
}: EmailThreadListButtonProps) {
	// Fetch thread list for unread count
	const threads = useQuery(api.emailMessages.listThreadsByClient, { clientId });

	// Count unread threads
	const unreadCount = threads
		? (threads as EmailThreadSummary[]).filter((t) => t.hasUnread).length
		: 0;

	if (variant === "icon") {
		return (
			<EmailThreadListPopover clientId={clientId}>
				<button
					type="button"
					className="relative p-2 rounded-lg hover:bg-accent transition-colors"
					aria-label="View email threads"
				>
					<Mail className="w-5 h-5" />
					{unreadCount > 0 && (
						<Badge
							variant="destructive"
							className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
						>
							{unreadCount}
						</Badge>
					)}
				</button>
			</EmailThreadListPopover>
		);
	}

	return (
		<EmailThreadListPopover clientId={clientId}>
			<StyledButton
				type="button"
				intent="outline"
				label="Messages"
				icon={<Inbox className="w-4 h-4" />}
				showArrow={false}
			>
				{unreadCount > 0 && (
					<Badge variant="destructive" className="ml-2 h-5 px-2 text-xs">
						{unreadCount}
					</Badge>
				)}
			</StyledButton>
		</EmailThreadListPopover>
	);
}

export default EmailThreadListButton;
