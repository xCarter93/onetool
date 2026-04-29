"use client";

/**
 * ResolvedStatusPanel — Plan 14-10 Gap 6 fallback. Rendered by ApprovalRail /
 * ApprovalBottomSheet when `quote.status` is approved/declined but the portal
 * `latestApproval` audit row is null OR has been marked stale by CR-02 (the
 * audit row's documentVersion no longer matches latestDocument.version).
 *
 * Purely presentational: never renders the SignatureCard / Approve / Decline
 * controls — guarantees an already-resolved quote can never present the form.
 */

import { Check, X } from "lucide-react";

export interface ResolvedStatusPanelProps {
	action: "approved" | "declined";
	resolvedAt: number;
	total: number;
	clientName: string;
}

function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatMoney(cents: number): string {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

export function ResolvedStatusPanel({
	action,
	resolvedAt,
	total,
	clientName,
}: ResolvedStatusPanelProps) {
	const isApproved = action === "approved";
	return (
		<div
			role="status"
			className={
				isApproved
					? "rounded-xl border border-green-200 bg-green-50 p-5"
					: "rounded-xl border border-border bg-muted/40 p-5"
			}
		>
			<div className="flex items-center gap-2">
				{isApproved ? (
					<Check
						className="h-4 w-4 text-green-700"
						aria-hidden="true"
					/>
				) : (
					<X
						className="h-4 w-4 text-muted-foreground"
						aria-hidden="true"
					/>
				)}
				<p
					className={`text-[14px] font-semibold ${
						isApproved ? "text-green-800" : "text-foreground"
					}`}
				>
					{isApproved ? "Approved" : "Declined"}
				</p>
			</div>
			<dl className="mt-4 grid grid-cols-1 gap-2 text-[13px]">
				<div className="flex items-center justify-between">
					<dt className="text-muted-foreground">Client</dt>
					<dd className="font-medium">{clientName}</dd>
				</div>
				<div className="flex items-center justify-between">
					<dt className="text-muted-foreground">Date</dt>
					<dd className="font-medium">{formatDate(resolvedAt)}</dd>
				</div>
				<div className="flex items-center justify-between">
					<dt className="text-muted-foreground">Quote total</dt>
					<dd className="font-medium tabular-nums">{formatMoney(total)}</dd>
				</div>
			</dl>
			<p className="mt-4 text-[12px] text-muted-foreground">
				No portal-side signature audit on file — this quote was{" "}
				{isApproved ? "approved" : "declined"} via another channel.
			</p>
		</div>
	);
}
