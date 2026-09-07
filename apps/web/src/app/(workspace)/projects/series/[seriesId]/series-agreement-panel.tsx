"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Trash2, Undo2 } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import { formatCalendarDate } from "@/lib/dates";

type PendingAction = {
	kind: "discard" | "withdraw";
	expectedRevisionId: Id<"projectSeriesAgreementRevisions">;
};

const DELIVERY_STATE = {
	draft: { label: "Draft", status: "draft" },
	ready_to_send: { label: "Ready to send", status: "draft" },
	awaiting_approval: { label: "Awaiting approval", status: "sent" },
	approved: { label: "Approved", status: "approved" },
	withdrawn: { label: "Withdrawn", status: "revoked" },
	declined: { label: "Declined", status: "declined" },
	expired: { label: "Expired", status: "expired" },
	revoked: { label: "Revoked", status: "revoked" },
} as const;

type DeliveryState = keyof typeof DELIVERY_STATE;

function pendingDescription(state: DeliveryState, hasActive: boolean): string {
	const activeNote = hasActive
		? "The current approved agreement still applies."
		: "Approval is required before this agreement covers future visits.";
	switch (state) {
		case "draft":
			return `The agreement PDF has not been generated. ${activeNote}`;
		case "ready_to_send":
			return `The agreement PDF is ready but has not been sent. ${activeNote}`;
		case "declined":
			return "The client declined this proposal. Withdraw it when you are ready to close it.";
		case "expired":
			return "The approval request expired. Withdraw this proposal before preparing another.";
		case "revoked":
			return "The approval request was revoked. Withdraw this proposal to finish closing it.";
		default:
			return hasActive
				? "The client has been asked to approve this revision. The current approved agreement applies until they do."
				: "The client has been asked to approve this agreement. It will cover future visits after approval.";
	}
}

const NO_AGREEMENT =
	"No active or proposed recurring agreement. Open a draft quote on this series to set one up.";

export function SeriesAgreementPanel({
	seriesId,
	clientId,
	canManage,
	canViewSchedules,
	canModifySchedules,
}: {
	seriesId: Id<"projectSeries">;
	clientId: Id<"clients">;
	canManage: boolean;
	canViewSchedules: boolean;
	canModifySchedules: boolean;
}) {
	const toast = useToast();
	const router = useRouter();
	const agreement = useQuery(api.projectSeriesAgreements.getSeriesAgreement, {
		seriesId,
	});
	const monthlyProposal = useQuery(
		api.recurringPaymentSchedules.getPending,
		canViewSchedules ? { clientId } : "skip"
	);
	const createRevisionDraft = useMutation(
		api.projectSeriesAgreements.createRevisionDraft
	);
	const discardPending = useMutation(api.projectSeriesAgreements.discardPending);
	const withdrawPending = useAction(
		api.boldsignActions.withdrawRecurringAgreement
	);
	const cancelMonthlyProposal = useMutation(
		api.recurringPaymentSchedules.cancelPending
	);
	const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
	const [busy, setBusy] = useState<
		"pending" | "revision" | "proposal" | null
	>(null);

	const pending = agreement?.pending;
	const active = agreement?.active;
	const pendingTargetMatches = Boolean(
		pendingAction && pending?._id === pendingAction.expectedRevisionId
	);
	const history =
		agreement?.history.filter(
			(revision) =>
				revision._id !== active?._id && revision._id !== pending?._id
		) ?? [];

	const runPendingAction = async () => {
		if (!pendingAction || !pendingTargetMatches) return;
		setBusy("pending");
		try {
			const args = {
				seriesId,
				expectedRevisionId: pendingAction.expectedRevisionId,
			};
			if (pendingAction.kind === "withdraw") await withdrawPending(args);
			else await discardPending(args);
			toast.success(
				pendingAction.kind === "withdraw"
					? "Agreement withdrawn"
					: "Draft discarded",
				active
					? "The approved agreement remains active for future visits."
					: "The quote and scheduled projects remain. No recurring agreement is active."
			);
			setPendingAction(null);
		} catch (error) {
			toast.error(
				"Update failed",
				convexErrorMessage(error, "Review the agreement and try again.")
			);
		} finally {
			setBusy(null);
		}
	};

	const createRevision = async () => {
		setBusy("revision");
		try {
			const result = await createRevisionDraft({ seriesId });
			router.push(`/quotes/${result.quoteId}`);
		} catch (error) {
			toast.error(
				"Error",
				convexErrorMessage(error, "Failed to create agreement revision")
			);
		} finally {
			setBusy(null);
		}
	};

	const cancelProposal = async () => {
		if (!monthlyProposal?.canCancel) return;
		setBusy("proposal");
		try {
			await cancelMonthlyProposal({
				clientId,
				expectedVersionId: monthlyProposal.versionId,
			});
			toast.success(
				"Proposal cancelled",
				"Current recurring payment terms remain in place."
			);
		} catch (error) {
			toast.error(
				"Error",
				convexErrorMessage(error, "Failed to cancel payment proposal")
			);
		} finally {
			setBusy(null);
		}
	};

	const afterClose = active
		? "The current approved agreement remains active for future visits."
		: "The quote and scheduled projects remain. The schedule can be edited again, and no recurring agreement will be active.";

	return (
		<Frame>
			<FrameHeader className="flex-row items-start justify-between gap-4">
				<div>
					<FrameTitle>Recurring agreement</FrameTitle>
					<FrameDescription>
						Track the standing approval and any proposed replacement for this
						series.
					</FrameDescription>
				</div>
				<div className="flex flex-wrap gap-2">
					{agreement?.agreementQuoteId && (
						<Button
							nativeButton={false}
							size="sm"
							variant="outline"
							render={<Link href={`/quotes/${agreement.agreementQuoteId}`} />}
						>
							<FileText className="size-4" /> View agreement
						</Button>
					)}
					{active && canManage && !pending && (
						<Button
							size="sm"
							onClick={() => void createRevision()}
							disabled={busy !== null}
						>
							<Pencil className="size-4" />
							{busy === "revision" ? "Creating..." : "Revise agreement"}
						</Button>
					)}
				</div>
			</FrameHeader>
			<FramePanel>
				{agreement === undefined ? (
					<div className="space-y-2" aria-label="Loading recurring agreement">
						<Skeleton className="h-5 w-52" />
						<Skeleton className="h-5 w-64" />
					</div>
				) : !active && !pending && history.length === 0 ? (
					<p className="text-sm text-muted-foreground">{NO_AGREEMENT}</p>
				) : (
					<div className="space-y-5">
						{!active && !pending && (
							<p className="text-sm text-muted-foreground">{NO_AGREEMENT}</p>
						)}
						<div className="grid gap-5 sm:grid-cols-2">
							{active && (
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<p className="text-sm font-medium">Current agreement</p>
										<StatusBadge status="approved" appearance="outline">
											Approved
										</StatusBadge>
									</div>
									<p className="text-sm text-muted-foreground">
										{active.agreementReference ?? "Recurring agreement"},
										revision {active.revisionNumber}
									</p>
									{active.approvedAt && (
										<p className="text-sm text-muted-foreground">
											Approved {formatCalendarDate(active.approvedAt)}
										</p>
									)}
								</div>
							)}
							{pending && (
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<p className="text-sm font-medium">Proposed revision</p>
										<StatusBadge
											status={DELIVERY_STATE[pending.deliveryState].status}
											appearance="outline"
										>
											{DELIVERY_STATE[pending.deliveryState].label}
										</StatusBadge>
									</div>
									<p className="text-sm text-muted-foreground">
										{pending.agreementReference ?? "Recurring agreement"},
										revision {pending.revisionNumber}
									</p>
									<p className="text-sm text-muted-foreground">
										{pendingDescription(pending.deliveryState, Boolean(active))}
									</p>
									<div className="flex flex-wrap gap-2">
										<Button
											nativeButton={false}
											size="sm"
											render={<Link href={`/quotes/${pending.quoteId}`} />}
										>
											<FileText className="size-4" /> Review
										</Button>
										{pending.canDiscard && canManage && (
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													setPendingAction({
														kind: "discard",
														expectedRevisionId: pending._id,
													})
												}
											>
												<Trash2 className="size-4" /> Discard draft
											</Button>
										)}
										{pending.canWithdraw && canManage && (
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													setPendingAction({
														kind: "withdraw",
														expectedRevisionId: pending._id,
													})
												}
											>
												<Undo2 className="size-4" /> Withdraw proposal
											</Button>
										)}
									</div>
								</div>
							)}
						</div>
						{history.length > 0 && (
							<div className="border-t border-border pt-4">
								<p className="mb-3 text-sm font-medium">Agreement history</p>
								<div className="space-y-3">
									{history.map((revision) => (
										<div
											key={revision._id}
											className="flex flex-wrap items-center justify-between gap-3"
										>
											<div>
												<p className="text-sm">
													{revision.agreementReference ?? "Recurring agreement"},
													revision {revision.revisionNumber}
												</p>
												{(revision.approvedAt || revision.withdrawnAt) && (
													<p className="text-xs text-muted-foreground">
														{revision.withdrawnAt ? "Withdrawn" : "Approved"}{" "}
														{formatCalendarDate(
															revision.withdrawnAt ?? revision.approvedAt
														)}
													</p>
												)}
											</div>
											<div className="flex items-center gap-2">
												<StatusBadge
													status={DELIVERY_STATE[revision.deliveryState].status}
													appearance="outline"
												>
													{DELIVERY_STATE[revision.deliveryState].label}
												</StatusBadge>
												<Button
													nativeButton={false}
													size="sm"
													variant="ghost"
													render={<Link href={`/quotes/${revision.quoteId}`} />}
												>
													View
												</Button>
											</div>
										</div>
									))}
								</div>
								{agreement.historyHasMore && (
									<p className="mt-3 text-xs text-muted-foreground">
										Showing the 50 most recent agreement revisions.
									</p>
								)}
							</div>
						)}
						{monthlyProposal && (
							<div className="rounded-md border border-border bg-muted/40 p-4">
								<p className="text-sm font-medium text-foreground">
									Shared monthly payment change
								</p>
								{monthlyProposal.status === "scheduled" &&
								monthlyProposal.effectiveMonth ? (
									<p className="mt-1 text-sm text-muted-foreground">
										All affected agreements are approved. The new payment
										arrangement starts in{" "}
										{new Date(
											`${monthlyProposal.effectiveMonth}-01T00:00:00Z`
										).toLocaleDateString("en-US", {
											month: "long",
											year: "numeric",
											timeZone: "UTC",
										})}
										. Existing terms apply until then.
									</p>
								) : (
									<p className="mt-1 text-sm text-muted-foreground">
										Awaiting approval from other recurring agreements.{" "}
										{monthlyProposal.approvedCount} of{" "}
										{monthlyProposal.requiredCount} approved. Existing terms
										remain active.
									</p>
								)}
								{monthlyProposal.canCancel && canModifySchedules ? (
									<Button
										className="mt-3"
										size="sm"
										variant="outline"
										onClick={() => void cancelProposal()}
										disabled={busy !== null}
									>
										{busy === "proposal"
											? "Cancelling..."
											: "Cancel payment proposal"}
									</Button>
								) : monthlyProposal.cancellationReason ? (
									<p className="mt-2 text-xs text-muted-foreground">
										{monthlyProposal.cancellationReason}
									</p>
								) : null}
							</div>
						)}
					</div>
				)}
			</FramePanel>

			<Dialog
				open={pendingAction !== null && pendingTargetMatches}
				onOpenChange={(open) =>
					!open && busy !== "pending" && setPendingAction(null)
				}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{pendingAction?.kind === "withdraw"
								? "Withdraw proposal?"
								: "Discard agreement draft?"}
						</DialogTitle>
						<DialogDescription>
							{pendingAction?.kind === "withdraw"
								? `${pending?.deliveryState === "awaiting_approval" ? "The client’s approval link will stop working. " : ""}This proposed revision will move to agreement history. ${afterClose}`
								: `This private proposed revision will move to agreement history. It has not been sent to the client. ${afterClose}`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter showCloseButton>
						<Button
							variant="destructive"
							disabled={busy !== null || !pendingTargetMatches}
							onClick={() => void runPendingAction()}
						>
							{busy === "pending"
								? "Updating..."
								: pendingAction?.kind === "withdraw"
									? "Withdraw proposal"
									: "Discard draft"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Frame>
	);
}
