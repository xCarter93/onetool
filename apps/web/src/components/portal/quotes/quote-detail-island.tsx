"use client";

/**
 * QuoteDetailIsland — top-level client island that owns the reactive
 * useQuery(api.portal.quotes.get) subscription and renders the desktop rail
 * or mobile bottom sheet based on viewport. Wires REVIEWS-mandated
 * `initialReceipt={data.latestApproval ?? undefined}` so previously-approved
 * quotes render the receipt panel on first render.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { useMediaQuery } from "@/hooks/use-media-query";

import { QuotePaper } from "./quote-paper";
import { ApprovalRail } from "./approval-rail";
import { ApprovalBottomSheet } from "./approval-bottom-sheet";
import { StaleVersionBanner } from "./stale-version-banner";

export interface QuoteDetailIslandProps {
	quoteId: Id<"quotes">;
}

function formatDate(ts?: number): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function pillClassFor(status: string): string {
	switch (status) {
		case "approved":
			return "bg-emerald-50 text-emerald-700 border-emerald-200";
		case "declined":
			return "bg-muted text-muted-foreground border-border";
		case "expired":
			return "bg-muted/70 text-muted-foreground border-border opacity-90";
		case "sent":
		default:
			return "bg-sky-50 text-sky-700 border-sky-200";
	}
}

function pillLabelFor(status: string): string {
	switch (status) {
		case "approved":
			return "Accepted";
		case "declined":
			return "Declined";
		case "expired":
			return "Expired";
		case "sent":
		default:
			return "Awaiting decision";
	}
}

export function QuoteDetailIsland({ quoteId }: QuoteDetailIslandProps) {
	const params = useParams<{ clientPortalId: string }>();
	const clientPortalId = params?.clientPortalId ?? "";

	const data = useQuery(api.portal.quotes.get, { quoteId });
	// Plan 14-08 Gap 4: aligned to PortalShell's md (768px) boundary so the
	// rail/sheet split matches the desktop-sidebar/mobile-chrome split — no
	// 256px no-mans-land between PortalShell mobile chrome and the detail-page
	// mobile chrome. At ≥768px PortalShell shows the sidebar AND the rail; at
	// <768px PortalShell hides the tab bar (route-suppressed) and the docked
	// ApprovalBottomSheet owns the bottom edge.
	const isDesktop = useMediaQuery("(min-width: 768px)");

	// Reactive stale detection: pin the documentId we mounted on; if the
	// reactive query updates with a different latestDocument._id, surface
	// the stale banner immediately.
	const [pinnedDocumentId, setPinnedDocumentId] = useState<string | null>(
		null,
	);
	useEffect(() => {
		if (data?.latestDocument?._id && pinnedDocumentId === null) {
			setPinnedDocumentId(data.latestDocument._id);
		}
	}, [data?.latestDocument?._id, pinnedDocumentId]);

	// Loading
	if (data === undefined) {
		return (
			<div className="max-w-5xl">
				<div className="h-8 w-32 bg-muted rounded animate-pulse" />
				<div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_380px] gap-6">
					<div className="rounded-2xl border border-border bg-card p-9">
						<div className="h-8 w-1/2 bg-muted rounded animate-pulse" />
						<div className="mt-4 space-y-2">
							{Array.from({ length: 4 }).map((_, i) => (
								<div
									key={i}
									className="h-6 w-full bg-muted rounded animate-pulse"
								/>
							))}
						</div>
					</div>
					<div className="rounded-2xl border border-border bg-card p-6">
						<div className="h-12 w-32 bg-muted rounded animate-pulse" />
						<div className="mt-4 h-40 w-full bg-muted rounded animate-pulse" />
					</div>
				</div>
			</div>
		);
	}

	// Missing
	if (data === null) {
		return (
			<div className="max-w-2xl py-12 text-center">
				<h1 className="text-[24px] font-semibold">Quote not found</h1>
				<p className="mt-2 text-muted-foreground">
					This quote may have been removed or you no longer have access.
				</p>
				<Link
					href={`/portal/c/${clientPortalId}/quotes`}
					className="mt-4 inline-flex items-center gap-1.5 text-primary hover:underline"
				>
					<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
					Back to quotes
				</Link>
			</div>
		);
	}

	const {
		quote,
		lineItems,
		latestDocument,
		businessName,
		clientName,
		clientEmail,
		latestApproval,
	} = data;

	const documentDrifted =
		pinnedDocumentId !== null &&
		latestDocument?._id &&
		pinnedDocumentId !== latestDocument._id;

	// REVIEWS-mandated (CR-02): the latest audit row in `quoteApprovals` is
	// append-only — a re-sent quote (status returned to "sent" after a prior
	// decline / revoke) still has a stale audit row. Only treat it as the
	// current receipt when its documentVersion matches the live document AND
	// the quote's current status matches the action.
	const isReceiptCurrent =
		!!latestApproval &&
		!!latestDocument &&
		latestApproval.documentVersion === latestDocument.version &&
		((latestApproval.action === "approved" && quote.status === "approved") ||
			(latestApproval.action === "declined" && quote.status === "declined"));
	const effectiveInitialReceipt = isReceiptCurrent
		? latestApproval ?? undefined
		: undefined;

	return (
		<div className="max-w-5xl">
			{/* Sticky header */}
			<header className="flex items-center justify-between gap-4 pb-6 border-b border-border">
				<div className="flex items-center gap-3">
					<Link
						href={`/portal/c/${clientPortalId}/quotes`}
						className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
						Back
					</Link>
					<div className="h-5 w-px bg-border" />
					<div>
						<div className="flex items-center gap-2">
							<h2 className="text-[16px] font-semibold">
								Quote {quote.quoteNumber} · {quote.title}
							</h2>
							<span
								className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${pillClassFor(quote.status)}`}
							>
								<span className="h-1.5 w-1.5 rounded-full bg-current" />
								{pillLabelFor(quote.status)}
							</span>
						</div>
						<p className="text-[12px] text-muted-foreground mt-0.5">
							Sent {formatDate(quote.sentAt)}
							{quote.validUntil
								? ` · Expires ${formatDate(quote.validUntil)}`
								: ""}
						</p>
					</div>
				</div>
			</header>

			{documentDrifted && (
				<div className="mt-4">
					<StaleVersionBanner
						onReload={() => {
							// The Convex reactive subscription has already updated. Re-pin
							// to the new id so the banner clears.
							setPinnedDocumentId(latestDocument?._id ?? null);
						}}
					/>
				</div>
			)}

			<div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_380px] gap-6 pb-24 md:pb-6">
				<div>
					<QuotePaper
						quote={quote}
						lineItems={lineItems}
						businessName={businessName}
					/>
				</div>

				{isDesktop ? (
					<ApprovalRail
						// REVIEWS-mandated (CR-04): force-remount on documentId change
						// so all useState (signaturePayload, terms, intent) resets to
						// non-usable when the underlying document version drifts.
						key={latestDocument?._id ?? "no-doc"}
						quote={{
							_id: quote._id,
							quoteNumber: quote.quoteNumber,
							title: quote.title,
							status: quote.status,
							total: quote.total,
							validUntil: quote.validUntil,
						}}
						latestDocument={
							latestDocument
								? { _id: latestDocument._id, version: latestDocument.version }
								: null
						}
						businessName={businessName}
						clientName={clientName}
						clientEmail={clientEmail}
						initialReceipt={effectiveInitialReceipt}
						documentDrifted={!!documentDrifted}
					/>
				) : (
					<ApprovalBottomSheet
						// REVIEWS-mandated (CR-04): see ApprovalRail above.
						key={latestDocument?._id ?? "no-doc"}
						quote={{
							_id: quote._id,
							quoteNumber: quote.quoteNumber,
							title: quote.title,
							status: quote.status,
							total: quote.total,
							validUntil: quote.validUntil,
						}}
						latestDocument={
							latestDocument
								? { _id: latestDocument._id, version: latestDocument.version }
								: null
						}
						businessName={businessName}
						clientName={clientName}
						clientEmail={clientEmail}
						initialReceipt={effectiveInitialReceipt}
						documentDrifted={!!documentDrifted}
					/>
				)}
			</div>
		</div>
	);
}
