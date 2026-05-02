"use client";

/**
 * ApprovalReceipt — REVIEWS-mandated: renders ONLY fields received via props.
 * Never fabricates audit data locally. Props strictly typed against the
 * Plan 14-02 latestApproval / Plan 14-04 receipt response shape.
 *
 * The signature thumbnail uses receipt.signatureUrl when defined; otherwise
 * the thumbnail block is omitted (decline rows always omit it).
 *
 * Respects prefers-reduced-motion for the Collapsible animation.
 */

import { useState, useEffect } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";

export interface ApprovalReceiptProps {
	receipt: {
		auditId: string;
		action: "approved" | "declined";
		createdAt: number;
		documentVersion: number;
		lineItemsCount: number;
		total: number;
		signatureStorageId?: string;
		signatureUrl?: string | null;
	};
	clientName: string;
	clientEmail: string;
	ipAddress?: string;
}

function formatMoney(amount: number): string {
	return amount.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

function formatDateTime(ts: number): { date: string; time: string } {
	const d = new Date(ts);
	return {
		date: d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		}),
		time: d.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
		}),
	};
}

export function ApprovalReceipt({
	receipt,
	clientName,
	clientEmail,
	ipAddress,
}: ApprovalReceiptProps) {
	const [expanded, setExpanded] = useState(false);
	const [reduceMotion, setReduceMotion] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduceMotion(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const isApproved = receipt.action === "approved";
	const { date, time } = formatDateTime(receipt.createdAt);

	const containerClasses = isApproved
		? "rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6"
		: "rounded-2xl border border-border bg-muted/40 p-6";

	const eyebrowText = isApproved ? "Approved" : "Declined";
	const headingText = isApproved ? "Quote approved" : "Quote declined";

	return (
		<div className={containerClasses}>
			<div className="flex items-start gap-3">
				{isApproved && (
					<CheckCircle2
						className="h-5 w-5 mt-0.5 text-emerald-600 shrink-0"
						aria-hidden="true"
					/>
				)}
				<div className="flex-1">
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						{eyebrowText}
					</p>
					<h3 className="mt-1 text-[20px] font-semibold leading-[1.25]">
						{headingText}
					</h3>
					<p className="mt-1.5 text-[14px] text-foreground">
						{isApproved ? "Approved by " : "Declined by "}
						<span className="font-medium">{clientName}</span>
					</p>
					<p className="text-[13px] text-muted-foreground">
						{date} at {time}
					</p>
				</div>
			</div>

			{isApproved && receipt.signatureUrl ? (
				<div className="mt-4 rounded-lg border border-border bg-card p-3">
					<img
						src={receipt.signatureUrl}
						alt={`Signature of ${clientName}`}
						className="max-h-24 w-auto"
					/>
				</div>
			) : null}

			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={expanded}
				className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
			>
				View approval receipt
				<ChevronDown
					className={`h-3.5 w-3.5 ${
						reduceMotion ? "" : "transition-transform"
					} ${expanded ? "rotate-180" : ""}`}
					style={
						reduceMotion ? { transition: "none" } : undefined
					}
					aria-hidden="true"
				/>
			</button>

			{expanded && (
				<dl
					className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12px]"
					style={reduceMotion ? { transition: "none" } : undefined}
				>
					<dt className="text-muted-foreground">
						{isApproved ? "Approved by" : "Declined by"}
					</dt>
					<dd className="font-medium">{clientName}</dd>
					<dt className="text-muted-foreground">Email</dt>
					<dd className="font-medium tabular-nums">{clientEmail}</dd>
					<dt className="text-muted-foreground">Date</dt>
					<dd className="font-medium">
						{date} at {time}
					</dd>
					<dt className="text-muted-foreground">Quote version</dt>
					<dd className="font-medium tabular-nums">
						v{receipt.documentVersion}
					</dd>
					{ipAddress ? (
						<>
							<dt className="text-muted-foreground">IP address</dt>
							<dd className="font-medium tabular-nums">{ipAddress}</dd>
						</>
					) : null}
					<dt className="text-muted-foreground">Items approved</dt>
					<dd className="font-medium tabular-nums">
						{receipt.lineItemsCount}
					</dd>
					<dt className="text-muted-foreground">Total</dt>
					<dd className="font-medium tabular-nums">
						{formatMoney(receipt.total)}
					</dd>
				</dl>
			)}
		</div>
	);
}
