"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useParams, useSearchParams } from "next/navigation";
import {
	CalendarDays,
	ChevronLeft,
	Pause,
	Pencil,
	Play,
	Repeat,
	Square,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { describeRecurrence } from "../../components/recurrence/rule";
import { formatVisitDate, stateLabel } from "../../components/recurrence/labels";
import { RecurrenceScheduleForm } from "../../components/recurrence/schedule-form";
import { SeriesAgreementPanel } from "./series-agreement-panel";
import {
	SeriesLifecycleDialog,
	type LifecycleAction,
} from "./series-lifecycle-dialog";
import { SeriesOccurrences } from "./series-occurrences";

function SeriesPageContent() {
	const { seriesId: rawSeriesId } = useParams<{ seriesId: string }>();
	const seriesId = rawSeriesId as Id<"projectSeries">;
	const searchParams = useSearchParams();
	const fromProjectId = searchParams.get("fromProjectId") ?? undefined;
	const toast = useToast();
	const [action, setAction] = useState<LifecycleAction | null>(() =>
		searchParams.get("action") === "resume" ? "resume" : null
	);
	const [scheduleOpen, setScheduleOpen] = useState(false);
	const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
	const {
		can,
		hasAllRecords,
		isLoading: permissionsLoading,
	} = usePermissions();
	const canAccess = can("projects") && hasAllRecords("projects");
	const canViewAgreements =
		canAccess && can("quotes") && hasAllRecords("quotes");
	const canViewSchedules =
		canViewAgreements && can("invoices") && hasAllRecords("invoices");
	const canModifySchedules =
		canViewSchedules &&
		can("projects", "modify") &&
		can("quotes", "modify") &&
		can("invoices", "modify");
	const details = useQuery(
		api.projectSeries.get,
		canAccess ? { seriesId, fromProjectId } : "skip"
	);
	const updateSchedule = useMutation(api.projectSeries.updateSchedule);

	if (permissionsLoading || (canAccess && details === undefined)) {
		return (
			<div className="space-y-6 px-6 py-8">
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-40 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}
	if (!canAccess || !details) {
		return (
			<EmptyState
				size="md"
				illustration="no-filter-match"
				title={
					canAccess ? "Series not found" : "Organization-wide access required"
				}
				description={
					canAccess
						? "This recurring series is unavailable or you do not have access."
						: "Ask an administrator for access to all projects to view recurring series."
				}
				action={
					<Button
						nativeButton={false}
						variant="outline"
						render={<Link href="/projects" />}
					>
						Back to projects
					</Button>
				}
			/>
		);
	}

	const { series, canManage, clientName, propertyName, nextVisit, returnProject } =
		details;
	const stateAction: LifecycleAction | null =
		series.state === "active"
			? "pause"
			: series.state === "paused" || series.state === "ended"
				? "resume"
				: null;
	const actionIsAvailable =
		action === "resume"
			? series.state === "paused" || series.state === "ended"
			: action === "pause"
				? series.state === "active"
				: action === "end"
					? series.state !== "ended"
					: false;
	const scheduleLocked =
		series.state !== "active" || Boolean(series.agreementQuoteId);

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
						<StatusBadge status={series.state} appearance="outline">
							{stateLabel(series.state)}
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
								disabled={scheduleLocked}
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
						{series.state === "paused" && canManage && (
							<p className="text-sm text-muted-foreground">
								This series is paused. Resume it before editing the schedule.
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
										{formatVisitDate(nextVisit.startDate)}
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

			{canViewAgreements && (
				<SeriesAgreementPanel
					seriesId={seriesId}
					clientId={series.clientId}
					canManage={canManage}
					canViewSchedules={canViewSchedules}
					canModifySchedules={canModifySchedules}
				/>
			)}

			<SeriesOccurrences
				seriesId={seriesId}
				canManage={canManage}
				seriesIsActive={series.state === "active"}
			/>

			{canManage && (
				<SeriesLifecycleDialog
					seriesId={seriesId}
					timezone={series.timezone}
					action={actionIsAvailable ? action : null}
					onClose={() => setAction(null)}
				/>
			)}

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
							isSubmitting={isUpdatingSchedule}
							submitLabel="Update schedule"
							onSubmit={async (rule, expectedVersion) => {
								if (expectedVersion === undefined) return;
								setIsUpdatingSchedule(true);
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
									setIsUpdatingSchedule(false);
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
