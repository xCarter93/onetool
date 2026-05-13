"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { formatRelativeTime } from "@/lib/notification-utils";

interface LinkedBankAccountRowProps {
	bankName?: string;
	last4?: string;
	updatedAt?: number;
	// Opens the embedded Payouts accordion where ConnectPayouts exposes the
	// external-account collector. The Express dashboard URL is inaccessible
	// for accounts provisioned with dashboard: "none".
	onChangeRequested?: () => void;
}

export function LinkedBankAccountRow({
	bankName,
	last4,
	updatedAt,
	onChangeRequested,
}: LinkedBankAccountRowProps) {
	if (!last4) {
		return (
			<div
				aria-label="Linked bank account"
				className="text-sm text-muted-foreground"
			>
				No bank account linked yet — finish Stripe onboarding to enable payouts.
			</div>
		);
	}

	const displayName = bankName ?? "Linked bank account";

	return (
		<div
			aria-label="Linked bank account"
			className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
		>
			<span className="font-medium text-foreground">{displayName}</span>
			<span className="font-mono tabular-nums text-muted-foreground">
				{`••••${last4}`}
			</span>
			{typeof updatedAt === "number" && (
				<span className="text-xs text-muted-foreground">
					Updated {formatRelativeTime(updatedAt)}
				</span>
			)}
			{onChangeRequested && (
				<button
					type="button"
					onClick={onChangeRequested}
					className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors ml-auto"
				>
					Change in Payouts
					<ChevronDown className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}
