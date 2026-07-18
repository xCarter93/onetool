"use client";

/**
 * QuoteDetailIsland — top-level client island that owns the reactive
 * useQuery(api.portal.quotes.get) subscription. Renders a ReUI "receipt-2"
 * style layout: a hero status card, a sticky left Quote Journey panel
 * (Timeline + the "Next Step" approval actions), and a details pane with
 * the printable quote paper. Wires REVIEWS-mandated
 * `initialReceipt={data.latestApproval ?? undefined}` so previously-approved
 * quotes render the receipt panel on first render.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/portal/format";

import { Badge } from "@/components/reui/badge";
import {
	Timeline,
	TimelineContent,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
} from "@/components/reui/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { QuotePaper } from "./quote-paper";
import { ApprovalRail } from "./approval-rail";
import { ApprovalBottomSheet } from "./approval-bottom-sheet";
import { StaleVersionBanner } from "./stale-version-banner";

export interface QuoteDetailIslandProps {
	quoteId: Id<"quotes">;
}

type JourneyStepStatus = "complete" | "current" | "upcoming";

interface JourneyStep {
	id: string;
	title: string;
	timestamp?: string;
	meta?: string;
	status: JourneyStepStatus;
}

function formatDate(ts?: number): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function badgeVariantFor(status: string): "success-light" | "outline" | "info-light" {
	switch (status) {
		case "approved":
			return "success-light";
		case "declined":
		case "expired":
			return "outline";
		case "sent":
		default:
			return "info-light";
	}
}

function statusLabelFor(status: string): string {
	switch (status) {
		case "approved":
			return "Approved";
		case "declined":
			return "Declined";
		case "expired":
			return "Expired";
		case "sent":
		default:
			return "Awaiting decision";
	}
}

// Per-status Timeline indicator + separator styling — mirrors the ReUI
// receipt-2 pattern so the vertical dot column stays aligned regardless of
// how many steps are completed vs. upcoming.
const TL_INDICATOR_BASE =
	"size-2.5 border-0 group-data-[orientation=vertical]/timeline:-left-3 group-data-[orientation=vertical]/timeline:-translate-x-1/2 group-data-[orientation=vertical]/timeline:top-1.25";

const TL_INDICATOR_BY_STATUS: Record<JourneyStepStatus, string> = {
	complete: cn(TL_INDICATOR_BASE, "bg-foreground"),
	current: cn(TL_INDICATOR_BASE, "bg-foreground ring-foreground/20 ring-2"),
	upcoming: cn(TL_INDICATOR_BASE, "bg-background border-input border-2"),
};

const TL_SEPARATOR_BASE =
	"group-data-[orientation=vertical]/timeline:-left-3 group-data-[orientation=vertical]/timeline:-translate-x-1/2 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem)] group-data-[orientation=vertical]/timeline:translate-y-5.5";

const TL_SEPARATOR_BY_STATUS: Record<JourneyStepStatus, string> = {
	complete: cn(TL_SEPARATOR_BASE, "bg-foreground"),
	current: cn(TL_SEPARATOR_BASE, "bg-input"),
	upcoming: cn(TL_SEPARATOR_BASE, "bg-input"),
};

const TL_ITEM_CLASS =
	"group-data-[orientation=vertical]/timeline:ms-5 group-data-[orientation=vertical]/timeline:not-last:pb-5";

/** Builds the Quote Journey steps from real quote data — no fabricated events. */
function buildJourneySteps(
	quote: {
		status: string;
		sentAt?: number;
		validUntil?: number;
		approvedAt?: number;
		declinedAt?: number;
	},
	latestApproval: { action: "approved" | "declined" } | null | undefined,
	clientName: string,
): JourneyStep[] {
	const steps: JourneyStep[] = [
		{
			id: "sent",
			title: "Quote sent",
			timestamp: quote.sentAt ? formatDate(quote.sentAt) : undefined,
			status: "complete",
		},
	];

	if (quote.status === "approved") {
		steps.push({
			id: "review",
			title: "Reviewed by client",
			status: "complete",
		});
		steps.push({
			id: "resolution",
			title: "Approved",
			timestamp: formatDate(quote.approvedAt),
			meta: latestApproval ? `Signed by ${clientName}` : undefined,
			status: "complete",
		});
	} else if (quote.status === "declined") {
		steps.push({
			id: "review",
			title: "Reviewed by client",
			status: "complete",
		});
		steps.push({
			id: "resolution",
			title: "Declined",
			timestamp: formatDate(quote.declinedAt),
			status: "complete",
		});
	} else if (quote.status === "expired") {
		steps.push({
			id: "review",
			title: "Awaiting review",
			status: "complete",
		});
		steps.push({
			id: "resolution",
			title: "Expired",
			timestamp: quote.validUntil ? formatDate(quote.validUntil) : undefined,
			status: "complete",
		});
	} else {
		steps.push({
			id: "review",
			title: "Awaiting your decision",
			status: "current",
		});
		steps.push({
			id: "resolution",
			title: "Approved or declined",
			status: "upcoming",
		});
	}

	return steps;
}

export function QuoteDetailIsland({ quoteId }: QuoteDetailIslandProps) {
	const params = useParams<{ clientPortalId: string }>();
	const clientPortalId = params?.clientPortalId ?? "";

	// Stable mount timestamp for the resolved-fallback panel — avoids an
	// impure Date.now() during render while keeping the same fallback value.
	const [mountedAt] = useState(() => Date.now());

	const data = useQuery(api.portal.quotes.get, { quoteId });
	// Plan 14-08 Gap 4: aligned to PortalShell's md (768px) boundary so the
	// rail/sheet split matches the desktop-sidebar/mobile-chrome split — no
	// 256px no-mans-land between PortalShell mobile chrome and the detail-page
	// mobile chrome. At ≥768px PortalShell shows the sidebar AND the rail; at
	// <768px PortalShell hides the tab bar (route-suppressed) and the docked
	// ApprovalBottomSheet owns the bottom edge.
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const toast = useToast();

	// Reactive stale detection: pin the documentId we mounted on; if the
	// reactive query updates with a different latestDocument._id, surface
	// the stale banner immediately. Pinned during render the first time a
	// documentId is seen (or reset via the banner's onReload).
	const [pinnedDocumentId, setPinnedDocumentId] = useState<string | null>(
		null,
	);
	if (pinnedDocumentId === null && data?.latestDocument?._id) {
		setPinnedDocumentId(data.latestDocument._id);
	}

	// Loading
	if (data === undefined) {
		return (
			<div className="-mx-6 md:-mx-9 -my-6 flex flex-col">
				<div className="sticky top-0 z-20 flex h-[68px] items-center border-b border-border bg-background px-6">
					<div className="h-5 w-32 animate-pulse rounded bg-muted" />
				</div>
				<div className="px-6 py-8 md:px-9">
					<div className="mx-auto max-w-5xl">
						<div className="mb-6 h-28 animate-pulse rounded-2xl border border-border bg-card md:mb-8" />
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8">
							<div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
							<div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Missing
	if (data === null) {
		return (
			<div className="mx-auto max-w-2xl py-12 text-center">
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

	async function handleDownloadPdf() {
		try {
			const res = await fetch(`/api/portal/quotes/${quoteId}/pdf`);
			if (!res.ok) {
				toast.error("Couldn't open PDF. Please try again.");
				return;
			}
			const body = (await res.json().catch(() => null)) as
				| { url?: unknown }
				| null;
			if (
				!body ||
				typeof body.url !== "string" ||
				body.url.length === 0
			) {
				toast.error("Couldn't open PDF. Please try again.");
				return;
			}
			// Plan 14.1-03 user decision D-1: open in new tab to preserve
			// portal context and match Phase 13's "no full-page kicks" posture.
			window.open(body.url, "_blank", "noopener,noreferrer");
		} catch {
			toast.error("Couldn't open PDF. Please try again.");
		}
	}

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

	// Plan 14-10 Gap 6 fallback: when the quote is already resolved
	// (status approved or declined) AND no current portal audit row exists
	// (effectiveInitialReceipt is null — either latestApproval was null OR
	// CR-02 marked it stale via documentVersion mismatch), surface a non-form
	// panel. This catches quotes resolved via paths that don't write to
	// quoteApprovals (workspace `quotes.update` to status='approved', BoldSign
	// webhook) AND quotes whose audit row is stale relative to the latest
	// document version. The CR-02 receipt path above still wins when a current
	// matching audit row exists.
	const resolvedFallback =
		!effectiveInitialReceipt &&
		(quote.status === "approved" || quote.status === "declined")
			? {
					action: quote.status as "approved" | "declined",
					resolvedAt:
						(quote.status === "approved"
							? quote.approvedAt
							: quote.declinedAt) ?? mountedAt,
					total: quote.total,
				}
			: undefined;

	const journeySteps = buildJourneySteps(quote, latestApproval, clientName);
	const currentStepIndex = journeySteps.findIndex(
		(step) => step.status === "current",
	);
	const timelineDefaultStep =
		currentStepIndex >= 0 ? currentStepIndex + 1 : journeySteps.length;

	// REVIEWS-mandated (CR-04): force-remount on documentId change so all
	// useState (signaturePayload, terms, intent) resets to non-usable when
	// the underlying document version drifts.
	const approvalKey = latestDocument?._id ?? "no-doc";
	const approvalRailProps = {
		quote: {
			_id: quote._id,
			quoteNumber: quote.quoteNumber,
			title: quote.title,
			status: quote.status,
			total: quote.total,
			validUntil: quote.validUntil,
		},
		latestDocument: latestDocument
			? { _id: latestDocument._id, version: latestDocument.version }
			: null,
		businessName,
		clientName,
		clientEmail,
		initialReceipt: effectiveInitialReceipt,
		resolvedFallback,
		documentDrifted: !!documentDrifted,
	};

	return (
		// Negative margins to escape the PortalShell <main> px/py padding so the
		// sticky header bar can run edge-to-edge of the main area on desktop.
		<div className="-mx-6 md:-mx-9 -my-6 flex flex-col">
			{/* Sticky top header bar */}
			<header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-4 border-b border-border bg-background px-6 md:px-9">
				<Link
					href={`/portal/c/${clientPortalId}/quotes`}
					className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
					Back
				</Link>
				{latestDocument && (
					<button
						type="button"
						onClick={handleDownloadPdf}
						className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-accent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
					>
						<Download className="h-3.5 w-3.5" aria-hidden="true" />
						Download PDF
					</button>
				)}
			</header>

			{documentDrifted && (
				<div className="border-b border-border bg-background px-6 py-4 md:px-9">
					<StaleVersionBanner
						onReload={() => {
							setPinnedDocumentId(latestDocument?._id ?? null);
						}}
					/>
				</div>
			)}

			<div className="px-6 py-8 pb-24 md:px-9 md:pb-10">
				<div className="mx-auto max-w-5xl">
					{/* Hero: status + quote id/title + business + total */}
					<Card className="mb-6 md:mb-8">
						<CardContent>
							<div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-8">
								<div className="flex min-w-0 flex-col gap-2">
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant={badgeVariantFor(quote.status)}
											radius="full"
											className="w-fit"
										>
											{statusLabelFor(quote.status)}
										</Badge>
										<span className="text-muted-foreground text-xs">
											Sent {formatDate(quote.sentAt)}
										</span>
									</div>
									<CardTitle className="text-xl tracking-tight md:text-2xl">
										Quote {quote.quoteNumber} · {quote.title}
									</CardTitle>
									<p className="text-muted-foreground text-sm leading-snug">
										{businessName}
									</p>
								</div>

								<Separator
									orientation="vertical"
									className="hidden h-14 data-vertical:self-center md:block"
								/>

								<div className="flex flex-col gap-1 md:items-end">
									<span className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
										Total
									</span>
									<span className="text-foreground text-2xl leading-none font-semibold tracking-tight tabular-nums md:text-3xl">
										{formatMoney(quote.total)}
									</span>
									{quote.validUntil && (
										<span className="text-muted-foreground text-xs tabular-nums">
											Valid until {formatDate(quote.validUntil)}
										</span>
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Two-pane: Quote Journey (sticky) + Quote Details */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8">
						<Card className="lg:sticky lg:top-6">
							<CardHeader>
								<CardTitle className="text-base">Quote Journey</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-5">
								<Timeline defaultValue={timelineDefaultStep} className="gap-0">
									{journeySteps.map((step, index) => {
										const isLast = index === journeySteps.length - 1;
										return (
											<TimelineItem
												key={step.id}
												step={index + 1}
												className={TL_ITEM_CLASS}
											>
												{!isLast ? (
													<TimelineSeparator
														className={TL_SEPARATOR_BY_STATUS[step.status]}
													/>
												) : null}
												<TimelineIndicator
													className={TL_INDICATOR_BY_STATUS[step.status]}
												/>
												<TimelineContent className="text-foreground ps-3">
													<div className="flex flex-col gap-0.5">
														<span
															className={cn(
																"text-sm leading-snug font-medium",
																step.status === "upcoming" &&
																	"text-muted-foreground",
															)}
														>
															{step.title}
														</span>
														{step.timestamp && (
															<time
																className={cn(
																	"text-xs tabular-nums",
																	step.status === "upcoming"
																		? "text-muted-foreground/70"
																		: "text-muted-foreground",
																)}
															>
																{step.timestamp}
															</time>
														)}
														{step.meta && (
															<p className="text-muted-foreground text-xs">
																{step.meta}
															</p>
														)}
													</div>
												</TimelineContent>
											</TimelineItem>
										);
									})}
								</Timeline>

								{/* Next Step — hosts the approval actions (desktop only; mobile
								    uses the docked ApprovalBottomSheet instead). ApprovalRail
								    already branches internally between the signing form, the
								    receipt, the resolved-status panel, and error banners. */}
								{isDesktop && (
									<div className="flex flex-col gap-4 border-t border-border pt-4">
										<span className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
											{quote.status === "sent" ? "Next Step" : "Outcome"}
										</span>
										<ApprovalRail key={approvalKey} {...approvalRailProps} />
									</div>
								)}
							</CardContent>
						</Card>

						{/* Quote Details */}
						<div className="flex flex-col gap-6">
							<QuotePaper
								quote={quote}
								lineItems={lineItems}
								businessName={businessName}
							/>
						</div>
					</div>
				</div>
			</div>

			{!isDesktop && (
				<ApprovalBottomSheet key={approvalKey} {...approvalRailProps} />
			)}
		</div>
	);
}
