"use client";

import { format } from "date-fns";
import {
	AlertTriangle,
	Check,
	CheckCheck,
	MailOpen,
	type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** One timestamp format for message headers everywhere email renders. */
export function formatMessageTimestamp(ms: number): string {
	return format(new Date(ms), "MMM d, h:mm a");
}

export type EmailDeliveryStatus =
	| "sent"
	| "delivered"
	| "opened"
	| "bounced"
	| "complained"
	| "failed";

export interface EmailDeliveryFields {
	status: EmailDeliveryStatus;
	deliveredAt?: number;
	openedAt?: number;
	bouncedAt?: number;
	failedAt?: number;
}

const INDICATORS: Record<
	EmailDeliveryStatus,
	{ icon: LucideIcon; label: string; negative: boolean }
> = {
	sent: { icon: Check, label: "Sent", negative: false },
	delivered: { icon: CheckCheck, label: "Delivered", negative: false },
	opened: { icon: MailOpen, label: "Opened", negative: false },
	bounced: { icon: AlertTriangle, label: "Bounced", negative: true },
	complained: { icon: AlertTriangle, label: "Marked as spam", negative: true },
	failed: { icon: AlertTriangle, label: "Failed to send", negative: true },
};

function statusTime(message: EmailDeliveryFields): number | undefined {
	switch (message.status) {
		case "opened":
			return message.openedAt;
		case "delivered":
			return message.deliveredAt;
		case "bounced":
			return message.bouncedAt;
		case "failed":
			return message.failedAt;
		default:
			return undefined;
	}
}

/**
 * Muted one-line delivery state for an outbound message ("Opened · 2:14 PM").
 * Icon + text together so color is never the only signal.
 */
export function EmailDeliveryIndicator({
	message,
	className,
}: {
	message: EmailDeliveryFields;
	className?: string;
}) {
	const indicator = INDICATORS[message.status];
	if (!indicator) return null;

	const at = statusTime(message);
	const Icon = indicator.icon;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-xs",
				indicator.negative ? "text-destructive" : "text-muted-foreground",
				className
			)}
		>
			<Icon className="size-3" aria-hidden="true" />
			{indicator.label}
			{at !== undefined && (
				<span className={indicator.negative ? undefined : "text-muted-foreground/70"}>
					{format(new Date(at), "h:mm a")}
				</span>
			)}
		</span>
	);
}
