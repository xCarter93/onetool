"use client";

import Link from "next/link";
import { useState } from "react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Business-trial countdown chip for the header notch rail. Renders only while
 * the plan resolves from the reverse trial, so it disappears on subscribe or
 * lapse with no dismissal state. Links to Billing for users who can act on it.
 */
export function TrialCountdownPill() {
	const { source, trialEndsAt } = useEntitlements();
	const { can } = usePermissions();
	// Day granularity, so mount-time "now" is fresh enough for the countdown.
	const [mountedAt] = useState(() => Date.now());

	if (source !== "trial" || !trialEndsAt) return null;

	// source === "trial" guarantees trialEndsAt > now, so daysLeft >= 1.
	const daysLeft = Math.max(1, Math.ceil((trialEndsAt - mountedAt) / DAY_MS));
	const urgent = daysLeft <= 3;
	const label = `Trial · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

	const pillClass = cn(
		"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200",
		urgent
			? "bg-warning/10 text-warning-foreground"
			: "bg-muted/60 text-muted-foreground"
	);

	if (!can("billing")) {
		return <span className={pillClass}>{label}</span>;
	}

	return (
		<Link
			href="/organization/profile?tab=billing"
			aria-label={`${label}. Manage your plan`}
			className={cn(
				pillClass,
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				urgent
					? "hover:bg-warning/15"
					: "hover:bg-muted hover:text-foreground"
			)}
		>
			{label}
		</Link>
	);
}
