"use client";

/**
 * Plan 14.1-02 (QUOTE-04 workspace half): Approval Audit tab — surfaces
 * portal-quote audit rows on the workspace quote-detail page. Sibling tab
 * to Signatures (BoldSign) and Activity. Always visible with status-aware
 * empty states. Most-recent row prominent; older rows collapse into a
 * native <details> ("Show N earlier audit events", newest-first).
 *
 * Native <details>/<summary> chosen over @/components/ui/accordion because
 * that file's only export is a default custom Accordion({ items }) — the
 * named-import pattern would fail at compile time. Native <details> is
 * accessible by default and matches the "calm density" aesthetic.
 *
 * Audit-pinned: the per-row "Download approved-version PDF" link uses
 * row.auditPinnedPdfUrl (resolved from the row's own documentId) — NOT the
 * quote's current latestDocumentId. A re-published quote therefore surfaces
 * the version the client actually approved.
 *
 * BoldSign empty-state heuristic delegated to hasCompletedBoldsign() —
 * hardened against case/null/partial-signed shape variants.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Badge as ReuiBadge } from "@/components/reui/badge";
import { EmptyState } from "@/components/domain/empty-state";
import { hasCompletedBoldsign } from "./has-completed-boldsign";

type LineItemSnapshot = {
	description: string;
	quantity: number;
	unit: string;
	rate: number;
	amount: number;
	sortOrder: number;
};

interface AuditRow {
	auditId: string;
	action: "approved" | "declined";
	createdAt: number;
	documentVersion: number;
	ipAddress: string;
	userAgent: string;
	declineReason: string | null;
	signatureUrl: string | null;
	signatureMode: "typed" | "drawn" | null;
	contactEmail: string;
	documentId: string;
	auditPinnedPdfUrl: string | null;
	lineItemsSnapshot: LineItemSnapshot[] | null;
	subtotalSnapshot: number;
	taxSnapshot: number;
	totalSnapshot: number;
}

interface ApprovalAuditTabProps {
	quoteId: Id<"quotes">;
	documentsWithSignatures:
		| ReadonlyArray<
				| { boldsign?: { status?: string | null } | null }
				| null
				| undefined
		  >
		| null
		| undefined;
}

function formatTs(ts: number): string {
	return new Date(ts).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function SignatureThumb({ url }: { url: string | null }) {
	const [broken, setBroken] = useState(false);
	if (!url) return null;
	if (broken) {
		return (
			<p className="text-[12px] text-muted-foreground">
				Signature unavailable — reload to view
			</p>
		);
	}
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={url}
			alt="Client signature"
			className="h-16 w-auto rounded border border-border bg-white"
			onError={() => setBroken(true)}
		/>
	);
}

function LineItemsSnapshotBlock({
	items,
}: {
	items: LineItemSnapshot[] | null;
}) {
	const rows = items
		? [...items].sort((a, b) => a.sortOrder - b.sortOrder)
		: null;
	return (
		<details className="rounded-md border border-border bg-card/50 px-3 py-2">
			<summary className="cursor-pointer text-[12px] font-medium text-muted-foreground">
				Line items snapshot
			</summary>
			{rows && rows.length > 0 ? (
				<table className="mt-2 w-full text-[12px]">
					<thead>
						<tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
							<th className="py-1 pr-2">Description</th>
							<th className="py-1 pr-2">Qty</th>
							<th className="py-1 pr-2">Unit</th>
							<th className="py-1 pr-2">Rate</th>
							<th className="py-1">Amount</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((it, i) => (
							<tr
								key={`${it.sortOrder}-${i}`}
								className="border-t border-border/50"
							>
								<td className="py-1 pr-2">{it.description}</td>
								<td className="py-1 pr-2 font-mono">
									{it.quantity}
								</td>
								<td className="py-1 pr-2">{it.unit}</td>
								<td className="py-1 pr-2 font-mono">{it.rate}</td>
								<td className="py-1 font-mono">{it.amount}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<p className="mt-2 text-[12px] text-muted-foreground">
					Snapshot not captured for this approval
				</p>
			)}
		</details>
	);
}

function AuditRowCard({ row }: { row: AuditRow }) {
	const badge =
		row.action === "approved" ? (
			<ReuiBadge variant="success">Approved</ReuiBadge>
		) : (
			<Badge variant="secondary">Declined</Badge>
		);

	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{badge}
					<span className="text-[12px] text-muted-foreground">
						Version {row.documentVersion}
					</span>
				</div>
				<span className="text-[12px] text-muted-foreground">
					{formatTs(row.createdAt)}
				</span>
			</div>
			<div className="mt-3 grid gap-3 md:grid-cols-2">
				<dl className="space-y-1.5 text-[13px]">
					<div>
						<dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
							Email
						</dt>
						<dd>{row.contactEmail || "—"}</dd>
					</div>
					<div>
						<dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
							IP Address
						</dt>
						<dd className="font-mono">{row.ipAddress}</dd>
					</div>
					<div>
						<dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
							User Agent
						</dt>
						<dd className="break-all font-mono text-[12px]">
							{row.userAgent}
						</dd>
					</div>
				</dl>
				<div className="space-y-3">
					{row.signatureUrl && (
						<div>
							<p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
								Signature
							</p>
							<SignatureThumb url={row.signatureUrl} />
						</div>
					)}
					{row.action === "declined" && row.declineReason && (
						<div className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
							<p className="text-[11px] uppercase tracking-wider mb-0.5">
								Decline reason
							</p>
							{row.declineReason}
						</div>
					)}
					{row.auditPinnedPdfUrl && (
						<a
							href={row.auditPinnedPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"
						>
							<Download
								className="h-3.5 w-3.5"
								aria-hidden="true"
							/>
							Download approved-version PDF
						</a>
					)}
				</div>
			</div>
			<div className="mt-3">
				<LineItemsSnapshotBlock items={row.lineItemsSnapshot} />
			</div>
		</div>
	);
}

export function ApprovalAuditTab({
	quoteId,
	documentsWithSignatures,
}: ApprovalAuditTabProps) {
	const rows = useQuery(api.quotes.getApprovalAudit, { quoteId });

	if (rows === undefined) {
		return (
			<div className="space-y-3">
				<div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
			</div>
		);
	}

	if (rows.length === 0) {
		const completedBoldsign = hasCompletedBoldsign(documentsWithSignatures);
		return (
			<EmptyState
				size="md"
				illustration="quote-approval-none"
				title={
					completedBoldsign
						? "Approved via BoldSign"
						: "No portal approval recorded yet"
				}
				description={
					completedBoldsign
						? "This quote was approved via BoldSign — see the Signatures tab."
						: "The client has not approved or declined this quote in the portal."
				}
			/>
		);
	}

	const [latest, ...older] = rows;

	return (
		<div>
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Approval Audit
				</h3>
			</div>
			<Separator className="mb-4" />

			<AuditRowCard row={latest} />

			{older.length > 0 && (
				<details className="mt-4 rounded-md border border-border bg-card/30">
					<summary className="cursor-pointer px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground">
						Show {older.length} earlier audit event
						{older.length === 1 ? "" : "s"}
					</summary>
					<div className="space-y-3 px-4 py-3">
						{older.map((row) => (
							<AuditRowCard key={row.auditId} row={row} />
						))}
					</div>
				</details>
			)}
		</div>
	);
}
