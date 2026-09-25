"use client";

import type { Route } from "next";
import Link from "next/link";
import { PartyPopper, X } from "lucide-react";

interface CelebrationToastProps {
	title: string;
	message?: string;
	flair?: string;
	actionUrl?: string;
	actionLabel?: string;
	/** Additional wins that arrived in the same burst. */
	extraCount?: number;
	onDismiss: () => void;
}

/**
 * Custom sonner toast body for celebration notifications (quote approved /
 * invoice paid). Rendered via sonnerToast.custom by CelebrationListener;
 * confetti fires separately from the same listener.
 */
export function CelebrationToast({
	title,
	message,
	flair,
	actionUrl,
	actionLabel,
	extraCount = 0,
	onDismiss,
}: CelebrationToastProps) {
	return (
		<div
			role="status"
			className="pointer-events-auto flex w-full items-start gap-3 rounded-sm border border-toast-border bg-toast p-4 text-toast-foreground shadow-floating sm:w-[356px]"
		>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-toast-accent-foreground">
				<PartyPopper className="h-4 w-4" aria-hidden />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold">{title}</p>
				{message ? (
					<p className="mt-0.5 text-sm text-toast-muted">{message}</p>
				) : null}
				{flair ? (
					<p className="mt-2 text-xs font-medium">{flair}</p>
				) : null}
				{extraCount > 0 ? (
					<p className="mt-1 text-xs text-toast-muted">
						+{extraCount} more {extraCount === 1 ? "win" : "wins"} in your
						notifications
					</p>
				) : null}
				{actionUrl ? (
					<Link
						href={actionUrl as Route}
						onClick={onDismiss}
						className="mt-2 inline-block text-xs font-medium underline underline-offset-2 hover:text-toast-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						{actionLabel ?? "View details"}
					</Link>
				) : null}
			</div>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Dismiss"
				className="shrink-0 rounded-sm p-1 text-toast-muted transition-colors hover:text-toast-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				<X className="h-4 w-4" aria-hidden />
			</button>
		</div>
	);
}
