import { Bug, Lightbulb, MessageCircle } from "lucide-react";
import type { Ticket, TicketStatus } from "posthog-js";
import type { SupportIntent } from "@/lib/support";

export const INTENT_META: Record<
	SupportIntent,
	{ label: string; actionLabel: string; icon: typeof MessageCircle }
> = {
	contact: {
		label: "Support request",
		actionLabel: "Contact support",
		icon: MessageCircle,
	},
	bug: { label: "Bug report", actionLabel: "Report a bug", icon: Bug },
	feature: {
		label: "Feature request",
		actionLabel: "Request a feature",
		icon: Lightbulb,
	},
};

/** Cross-device tickets whose intent we can't recover locally. */
export const UNKNOWN_INTENT_META = {
	label: "Conversation",
	icon: MessageCircle,
} as const;

export function intentMeta(intent: SupportIntent | undefined) {
	return intent ? INTENT_META[intent] : UNKNOWN_INTENT_META;
}

/** V2-8: statuses collapse to two buckets. */
export function isResolved(status: TicketStatus): boolean {
	return status === "resolved";
}

export function ticketStatusBadge(status: TicketStatus): {
	label: string;
	role: "info" | "neutral";
} {
	return isResolved(status)
		? { label: "Resolved", role: "neutral" }
		: { label: "Open", role: "info" };
}

export function isUnread(ticket: Ticket): boolean {
	return (ticket.unread_count ?? 0) > 0;
}
