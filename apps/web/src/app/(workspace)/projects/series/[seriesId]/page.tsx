"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
	CalendarDays,
	ChevronLeft,
	Pause,
	Pencil,
	Play,
	Repeat,
	RotateCcw,
	Square,
	FileText,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { dateKeyFromTimestamp } from "@onetool/backend/convex/lib/projectRecurrence";
import type { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
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
import { EmptyState } from "@/components/domain/empty-state";
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
import { usePermissions } from "@/hooks/use-permissions";
import {
	DataGrid,
	DataGridContainer,
	dataGridFeatures,
	type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { describeRecurrence } from "../../components/recurrence/rule";
import { RecurrenceScheduleForm } from "../../components/recurrence/schedule-form";

type LifecycleAction = "pause" | "resume" | "end";

function formatDate(timestamp?: number): string {
	if (!timestamp) return "Not scheduled";
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function SeriesPageContent() {
	const { seriesId: rawSeriesId } = useParams<{ seriesId: string }>();
	const seriesId = rawSeriesId as Id<"projectSeries">;
	const searchParams = useSearchParams();
	const fromProjectId = searchParams.get("fromProjectId") ?? undefined;
	const toast = useToast();
	const router = useRouter();
	const [cursor, setCursor] = useState<string | undefined>();
	const [previousCursors, setPreviousCursors] = useState<
		Array<string | undefined>
	>([]);
	const [action, setAction] = useState<LifecycleAction | null>(() =>
		searchParams.get("action") === "resume" ? "resume" : null
	);
	const [isSaving, setIsSaving] = useState(false);
	const [scheduleOpen, setScheduleOpen] = useState(false);
	const [renderedAt] = useState(Date.now);
	const {
		can,
		hasAllRecords,
		isLoading: permissionsLoading,
	} = usePermissions();
	const canAccess = can("projects") && hasAllRecords("projects");
	const canViewAgreements = canAccess && can("quotes") && hasAllRecords("quotes");
	const canViewSchedules = canViewAgreements && can("invoices") && hasAllRecords("invoices");
	const canModifySchedules = canViewSchedules && can("projects", "modify") && can("quotes", "modify") && can("invoices", "modify");
	const details = useQuery(
		api.projectSeries.get,
		canAccess ? { seriesId, fromProjectId } : "skip"
	);
	const actionIsAvailable =
		action === "resume"
			? details?.series.state === "paused" || details?.series.state === "ended"
			: action === "pause"
				? details?.series.state === "active"
				: action === "end"
					? details?.series.state !== "ended"
					: false;
	const occurrences = useQuery(
		api.projectSeries.listOccurrences,
		canAccess && details ? { seriesId, cursor } : "skip"
	);
	const agreement = useQuery(
		api.projectSeriesAgreements.getSeriesAgreement,
		canViewAgreements && details ? { seriesId } : "skip"
	);
	const monthlyProposal = useQuery(
		api.recurringPaymentSchedules.getPending,
		canViewSchedules && details ? { clientId: details.series.clientId } : "skip"
	);
	const lifecyclePreview = useQuery(
		api.projectSeries.previewLifecycle,
		action && actionIsAvailable && canAccess && details?.canManage
			? { seriesId, action }
			: "skip"
	);
	const lifecycle = useMutation(api.projectSeries.lifecycle);
	const skip = useMutation(api.projectSeries.skip);
	const restoreVisit = useMutation(api.projectSeries.restoreVisit);
	const updateSchedule = useMutation(api.projectSeries.updateSchedule);
	const createRevisionDraft = useMutation(api.projectSeriesAgreements.createRevisionDraft);
	const cancelMonthlyProposal = useMutation(api.recurringPaymentSchedules.cancelPending);
	const [isCreatingRevision, setIsCreatingRevision] = useState(false);
	const [isCancellingProposal, setIsCancellingProposal] = useState(false);
	const handleCreateRevision = async () => {
		setIsCreatingRevision(true);
		try {
			const result = await createRevisionDraft({ seriesId });
			router.push(`/quotes/${result.quoteId}`);
		} catch (error) {
			toast.error("Error", convexErrorMessage(error, "Failed to create agreement revision"));
		} finally {
			setIsCreatingRevision(false);
		}
	};
	const handleCancelMonthlyProposal = async () => {
		if (!details || !monthlyProposal?.canCancel) return;
		setIsCancellingProposal(true);
		try {
			await cancelMonthlyProposal({ clientId: details.series.clientId, expectedVersionId: monthlyProposal.versionId });
			toast.success("Proposal cancelled", "Current recurring payment terms remain in place.");
		} catch (error) {
			toast.error("Error", convexErrorMessage(error, "Failed to cancel payment proposal"));
		} finally {
			setIsCancellingProposal(false);
		}
	};

	const occurrenceRows = occurrences?.page ?? [];
	const canManage = details?.canManage ?? false;
	const seriesIsActive = details?.series.state === "active";
	const columns: ColumnDef<DataGridFeatures, Doc<"projects">>[] = [
		{
			accessorKey: "title",
			header: "Project",
			cell: ({ row }) => (
				<Link
					href={`/projects/${row.original._id}`}
					className="font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{row.original.title}
				</Link>
			),
		},
		{
			accessorKey: "startDate",
			header: "Date",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{formatDate(row.original.startDate)}
				</span>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<StatusBadge status={row.original.status} appearance="outline" />
			),
		},
		{
			id: "seriesState",
			header: "Recurrence",
			cell: ({ row }) =>
				row.original.recurringState ? (
					<StatusBadge role="neutral" appearance="outline">
						{row.original.recurringState}
					</StatusBadge>
				) : (
					<StatusBadge role="neutral" appearance="outline">
						Recurring
					</StatusBadge>
				),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex justify-end gap-2">
					{canManage &&
						occurrences?.skippableIds.includes(row.original._id) && (
							<Button
								size="sm"
								variant="outline"
								onClick={async () => {
									try {
										await skip({ projectId: row.original._id });
										toast.success(
											"Visit skipped",
											"Removed from the active schedule. Future dates are unchanged."
										);
									} catch (error) {
										toast.error(
											"Skip failed",
											convexErrorMessage(error, "Try again.")
										);
									}
								}}
							>
								Skip visit
							</Button>
						)}
					{canManage &&
						seriesIsActive &&
						occurrences?.restorableIds.includes(row.original._id) && (
							<Button
								size="sm"
								variant="outline"
								onClick={async () => {
									try {
										await restoreVisit({ projectId: row.original._id });
										toast.success(
											"Visit restored",
											"This visit is active again."
										);
									} catch (error) {
										toast.error(
											"Restore failed",
											convexErrorMessage(error, "Try again.")
										);
									}
								}}
							>
								<RotateCcw className="size-4" /> Restore
							</Button>
						)}
				</div>
			),
		},
	];
	const occurrenceTable = useTable({
		features: dataGridFeatures,
		data: occurrenceRows,
		columns,
	});

	if (permissionsLoading || (canAccess && details === undefined)) {
		return (
			<div className="space-y-6 px-6 py-8">
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-40 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}
	if (!canAccess)
		return (
			<EmptyState
				size="md"
				illustration="no-filter-match"
				title="Organization-wide access required"
				description="Ask an administrator for access to all projects to view recurring series."
				action={
					<Button nativeButton={false} variant="outline" render={<Link href="/projects" />}>
						Back to projects
					</Button>
				}
			/>
		);
	if (details === undefined) return null;
	if (details === null) {
		return (
			<EmptyState
				size="md"
				illustration="no-filter-match"
				title="Series not found"
				description="This recurring series is unavailable or you do not have access."
				action={
					<Button nativeButton={false} variant="outline" render={<Link href="/projects" />}>
						Back to projects
					</Button>
				}
			/>
		);
	}

	const { series, clientName, propertyName, nextVisit, returnProject } = details;
	const stateAction: LifecycleAction | null =
		series.state === "active"
			? "pause"
			: series.state === "paused" || series.state === "ended"
				? "resume"
				: null;
	const seriesTodayKey = dateKeyFromTimestamp(renderedAt, series.timezone);
	const seriesToday = Date.parse(`${seriesTodayKey}T00:00:00Z`);
	const resumableFutureVisits =
		action === "resume" && lifecyclePreview
			? lifecyclePreview.visits.filter(
					(visit) => (visit.startDate ?? 0) >= seriesToday
				).length
			: 0;
	const pastCancelledVisits =
		action === "resume" && lifecyclePreview
			? lifecyclePreview.visits.filter(
					(visit) => (visit.startDate ?? 0) < seriesToday
				).length
			: 0;

	return (
		<main className="space-y-6 px-6 py-8">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<Button
						nativeButton={false}
						variant="ghost"
						size="sm"
						className="mb-2 min-h-11 max-w-full"
						render={
							<Link
								href={
									(returnProject
										? `/projects/${returnProject._id}`
										: "/projects") as Route
								}
							/>
						}
					>
						<ChevronLeft className="size-4" />
						<span className="truncate">
							{returnProject ? `Back to ${returnProject.title}` : "Projects"}
						</span>
					</Button>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-2xl font-bold text-foreground text-balance">
							{series.title}
						</h1>
						<StatusBadge
							role={series.state === "active" ? "success" : "neutral"}
							appearance="outline"
						>
							{series.state}
						</StatusBadge>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{clientName}
						{propertyName ? `, ${propertyName}` : ""}
					</p>
				</div>
				{canManage && (
					<div className="flex flex-wrap gap-2">
						{stateAction && (
							<Button variant="outline" onClick={() => setAction(stateAction)}>
								{stateAction === "pause" ? (
									<Pause className="size-4" />
								) : (
									<Play className="size-4" />
								)}
								{stateAction === "pause" ? "Pause series" : "Resume series"}
							</Button>
						)}
						{series.state !== "ended" && (
							<Button variant="destructive" onClick={() => setAction("end")}>
								<Square className="size-4" /> End series
							</Button>
						)}
					</div>
				)}
			</header>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.6fr)]">
				<Frame>
					<FrameHeader className="flex-row items-start justify-between gap-4">
						<div>
							<FrameTitle>Schedule</FrameTitle>
							<FrameDescription>
								{describeRecurrence(series.rule)}
							</FrameDescription>
						</div>
						{canManage && (
							<Button
								size="sm"
								variant="outline"
								disabled={
									series.state !== "active" || !!series.agreementQuoteId
								}
								onClick={() => setScheduleOpen(true)}
							>
								<Pencil className="size-4" /> Edit
							</Button>
						)}
					</FrameHeader>
					<FramePanel className="space-y-3">
						{series.state === "ended" && (
							<p className="text-sm text-muted-foreground">
								This series has ended. Resume it to restore eligible upcoming
								visits on the original schedule. Past cancellations stay
								cancelled.
							</p>
						)}
						<div className="flex items-center gap-3">
							<Repeat className="size-5 text-muted-foreground" />
							<div>
								<p className="text-sm font-medium">
									Starts from {series.anchorDateKey}
								</p>
								<p className="text-sm text-muted-foreground">
									Timezone: {series.timezone}
								</p>
							</div>
						</div>
						{series.agreementQuoteId && (
							<p className="text-sm text-muted-foreground">
								Approve a revised recurring agreement before changing this
								schedule.
							</p>
						)}
					</FramePanel>
				</Frame>
				<Frame>
					<FrameHeader>
						<FrameTitle>Next visit</FrameTitle>
						<FrameDescription>The next scheduled occurrence</FrameDescription>
					</FrameHeader>
					<FramePanel>
						{nextVisit ? (
							<Link
								href={`/projects/${nextVisit._id}`}
								className="flex min-h-11 items-center gap-3 rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
							>
								<CalendarDays className="size-5 text-muted-foreground" />
								<div>
									<p className="font-medium">{nextVisit.title}</p>
									<p className="text-sm text-muted-foreground">
										{formatDate(nextVisit.startDate)}
									</p>
								</div>
							</Link>
						) : (
							<p className="text-sm text-muted-foreground">
								No upcoming visit is scheduled.
							</p>
						)}
					</FramePanel>
				</Frame>
			</div>

			<Frame>
				<FrameHeader className="flex-row items-start justify-between gap-4">
					<div>
						<FrameTitle>Recurring agreement</FrameTitle>
						<FrameDescription>
							The approved service, schedule, billing rhythm, and payment terms for this series.
						</FrameDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						{agreement?.agreementQuoteId && (
							<Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/quotes/${agreement.agreementQuoteId}`} />}>
								<FileText className="size-4" /> View agreement
							</Button>
						)}
						{agreement?.active && canManage && !agreement.pending && (
							<Button size="sm" onClick={handleCreateRevision} disabled={isCreatingRevision}>
								<Pencil className="size-4" /> {isCreatingRevision ? "Creating..." : "Revise agreement"}
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
					) : agreement.active || agreement.pending ? (
						<div className="space-y-5">
						<div className="grid gap-5 sm:grid-cols-2">
							{agreement.active && (
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<p className="text-sm font-medium">Current agreement</p>
										<StatusBadge status="approved" appearance="outline" />
									</div>
									<p className="text-sm text-muted-foreground">
										{agreement.active.agreementReference ?? "Recurring agreement"}, revision {agreement.active.revisionNumber}
									</p>
									{agreement.active.approvedAt && <p className="text-sm text-muted-foreground">Approved {formatDate(agreement.active.approvedAt)}</p>}
								</div>
							)}
							{agreement.pending && (
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<p className="text-sm font-medium">Pending revision</p>
										<StatusBadge status={agreement.pending.status} appearance="outline" />
									</div>
									<p className="text-sm text-muted-foreground">
										{agreement.pending.agreementReference ?? "Recurring agreement"}, revision {agreement.pending.revisionNumber}
									</p>
									<p className="text-sm text-muted-foreground">Approval is required before this revision applies to future visits.</p>
									<Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/quotes/${agreement.pending.quoteId}`} />}>Review pending revision</Button>
								</div>
							)}
						</div>
						{monthlyProposal && (
							<div className="rounded-md border border-border bg-muted/40 p-4">
								<p className="text-sm font-medium text-foreground">Shared monthly payment change</p>
								{monthlyProposal.status === "scheduled" && monthlyProposal.effectiveMonth ? (
									<p className="mt-1 text-sm text-muted-foreground">All affected agreements are approved. The new payment arrangement starts in {new Date(`${monthlyProposal.effectiveMonth}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}. Existing terms apply until then.</p>
								) : (
									<p className="mt-1 text-sm text-muted-foreground">Awaiting approval from other recurring agreements. {monthlyProposal.approvedCount} of {monthlyProposal.requiredCount} approved. Existing terms remain active.</p>
								)}
								{monthlyProposal.canCancel && canModifySchedules ? (
									<Button className="mt-3" size="sm" variant="outline" onClick={handleCancelMonthlyProposal} disabled={isCancellingProposal}>{isCancellingProposal ? "Cancelling..." : "Cancel payment proposal"}</Button>
								) : monthlyProposal.cancellationReason ? (
									<p className="mt-2 text-xs text-muted-foreground">{monthlyProposal.cancellationReason}</p>
								) : null}
							</div>
						)}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No recurring agreement has been prepared. Open a draft quote on this series to set one up.
						</p>
					)}
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Occurrences</FrameTitle>
					<FrameDescription>
						Each visit is a separate project with its own work history.
					</FrameDescription>
				</FrameHeader>
				<FramePanel className="p-0">
					{occurrences === undefined ? (
						<div className="space-y-3 p-4">
							{Array.from({ length: 5 }, (_, index) => (
								<Skeleton key={index} className="h-12" />
							))}
						</div>
					) : occurrenceRows.length === 0 ? (
						<EmptyState
							icon={<CalendarDays />}
							title="No visits on this page"
							description="Future visits appear here as they are scheduled."
						/>
					) : (
						<DataGrid
							table={occurrenceTable}
							recordCount={occurrenceRows.length}
							tableLayout={{ width: "auto", headerBackground: true }}
						>
							<DataGridContainer>
								<DataGridTable />
							</DataGridContainer>
						</DataGrid>
					)}
					{occurrences &&
						(previousCursors.length > 0 || !occurrences.isDone) && (
							<div className="flex justify-between border-t p-4">
								<Button
									variant="outline"
									disabled={previousCursors.length === 0}
									onClick={() => {
										setCursor(previousCursors.at(-1));
										setPreviousCursors(previousCursors.slice(0, -1));
									}}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									disabled={occurrences.isDone}
									onClick={() => {
										setPreviousCursors((history) => [...history, cursor]);
										setCursor(occurrences.continueCursor);
									}}
								>
									Next
								</Button>
							</div>
						)}
				</FramePanel>
			</Frame>

			<Dialog
				open={action !== null && actionIsAvailable && canManage}
				onOpenChange={(open) => !open && setAction(null)}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{action === "end"
								? "End recurring series?"
								: action === "pause"
									? "Pause recurring series?"
									: "Resume recurring series?"}
						</DialogTitle>
						<DialogDescription>
							{action === "end"
								? "Upcoming unstarted visits will be cancelled. You can resume the series later from its original schedule."
								: action === "pause"
									? "Upcoming unstarted visits will be suspended. Resume follows the original schedule without backfilling."
									: "Eligible upcoming visits will return to the planned state. The original schedule and end condition stay in place. Past cancelled visits stay cancelled."}
						</DialogDescription>
					</DialogHeader>
					<div className="rounded-md bg-muted p-4">
						{lifecyclePreview === undefined ? (
							<Skeleton className="h-12" />
						) : (
							<>
								{action === "resume" ? (
									<>
										<p className="text-sm font-medium tabular-nums">
											Upcoming visits restored: {resumableFutureVisits}
										</p>
										{resumableFutureVisits === 0 && (
											<p className="mt-1 text-sm text-muted-foreground">
												No existing upcoming visits will be restored. If the saved
												count or end date is exhausted, resuming adds no occurrences.
												After resuming, restore a visit individually or edit the
												schedule deliberately.
											</p>
										)}
										<p className="text-sm text-muted-foreground tabular-nums">
											Past cancellations retained: {pastCancelledVisits}
										</p>
										<p className="text-sm text-muted-foreground tabular-nums">
											Protected visits unchanged: {lifecyclePreview.preserved}
										</p>
									</>
								) : (
									<>
										<p className="text-sm font-medium tabular-nums">
											Affected visits: {lifecyclePreview.count}
										</p>
										<p className="text-sm text-muted-foreground tabular-nums">
											Preserved visits: {lifecyclePreview.preserved}
										</p>
									</>
								)}
								{lifecyclePreview.visits.slice(0, 4).map((visit) => (
									<p
										key={visit._id}
										className="mt-1 truncate text-sm text-muted-foreground"
									>
										{visit.title}, {formatDate(visit.startDate)}
									</p>
								))}
							</>
						)}
					</div>
					<DialogFooter showCloseButton>
						<Button
							variant={action === "end" ? "destructive" : "default"}
							disabled={isSaving || lifecyclePreview === undefined}
							onClick={async () => {
								if (!action || !lifecyclePreview) return;
								setIsSaving(true);
								try {
									await lifecycle({
										seriesId,
										action,
										expectedVersion: lifecyclePreview.revision,
									});
									toast.success(
										action === "end"
											? "Series ended"
											: action === "pause"
												? "Series paused"
												: "Series resumed",
										"The recurring schedule has been updated."
									);
									setAction(null);
								} catch (error) {
									toast.error(
										"Update failed",
										convexErrorMessage(error, "Refresh the page and try again.")
									);
								} finally {
									setIsSaving(false);
								}
							}}
						>
							{isSaving
								? "Updating..."
								: action === "end"
									? "End series"
									: action === "pause"
										? "Pause series"
										: "Resume series"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{scheduleOpen && (
				<Dialog open onOpenChange={setScheduleOpen}>
					<DialogContent className="max-h-[90vh] w-[min(94vw,48rem)] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>Edit schedule</DialogTitle>
							<DialogDescription>
								Review the affected planned visits before applying this change.
							</DialogDescription>
						</DialogHeader>
						<RecurrenceScheduleForm
							seriesId={seriesId}
							startDate={Date.parse(`${series.anchorDateKey}T00:00:00Z`)}
							initialRule={series.rule}
							isSubmitting={isSaving}
							submitLabel="Update schedule"
							onSubmit={async (rule, expectedVersion) => {
								if (expectedVersion === undefined) return;
								setIsSaving(true);
								try {
									await updateSchedule({ seriesId, rule, expectedVersion });
									toast.success(
										"Schedule updated",
										"Future planned visits now follow the new schedule."
									);
									setScheduleOpen(false);
								} catch (error) {
									toast.error(
										"Update failed",
										convexErrorMessage(
											error,
											"Review the schedule and try again."
										)
									);
								} finally {
									setIsSaving(false);
								}
							}}
						/>
					</DialogContent>
				</Dialog>
			)}
		</main>
	);
}

export default function SeriesPage() {
	const { seriesId } = useParams<{ seriesId: string }>();
	return <SeriesPageContent key={seriesId} />;
}
