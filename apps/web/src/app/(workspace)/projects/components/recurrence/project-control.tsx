"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/domain/status-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import { RecurrenceScheduleForm } from "./schedule-form";
import { describeRecurrence, type RecurrenceRule } from "./rule";

type RecurrenceProject = Pick<Doc<"projects">, "_id" | "title" | "projectType"> & {
	startDate?: number | null;
	recurringSeriesId?: Doc<"projects">["recurringSeriesId"] | null;
	recurringState?: Doc<"projects">["recurringState"] | null;
};

export function RecurrenceProjectControl({
	project,
}: {
	project: RecurrenceProject;
}) {
	if (project.projectType !== "recurring") return null;
	return <RecurringProjectSchedule key={project._id} project={project} />;
}

function RecurringProjectSchedule({ project }: { project: RecurrenceProject }) {
	const [open, setOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const router = useRouter();
	const { can, hasAllRecords } = usePermissions();
	const toast = useToast();
	const enroll = useMutation(api.projectSeries.enroll);
	const canViewSeries = can("projects") && hasAllRecords("projects");
	const canManage = canViewSeries && can("projects", "modify");
	const seriesDetails = useQuery(
		api.projectSeries.get,
		project.recurringSeriesId && canViewSeries
			? { seriesId: project.recurringSeriesId }
			: "skip"
	);

	if (project.recurringSeriesId) {
		return (
			<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
				<Repeat className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<span className="w-28 shrink-0 text-sm text-muted-foreground">
					Schedule
				</span>
				<div className="min-w-0 flex-1 space-y-1.5">
					{seriesDetails === undefined && canViewSeries ? (
						<Skeleton className="h-9 w-full" />
					) : (
						<>
							<p className="text-sm text-foreground">
								{seriesDetails
									? describeRecurrence(seriesDetails.series.rule)
									: "Recurring schedule"}
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<StatusBadge role="neutral" appearance="outline">
									{seriesDetails?.series.state ??
										project.recurringState ??
										"recurring"}
								</StatusBadge>
								{canViewSeries && seriesDetails && (
									<Link
										href={
											`/projects/series/${project.recurringSeriesId}?fromProjectId=${project._id}` as Route
										}
										className="inline-flex min-h-11 items-center text-sm font-medium text-primary outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
									>
										View series
									</Link>
								)}
							</div>
						</>
					)}
				</div>
			</div>
		);
	}

	if (!canManage) return null;

	return (
		<>
			<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
				<Repeat className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<span className="w-28 shrink-0 text-sm text-muted-foreground">
					Schedule
				</span>
				<div className="min-w-0 flex-1">
					<Button
						variant="outline"
						size="sm"
						className="min-h-11"
						onClick={() => setOpen(true)}
						disabled={!project.startDate}
					>
						<Repeat className="size-4" /> Set up recurrence
					</Button>
					{!project.startDate && (
						<p className="mt-1 text-sm text-muted-foreground">
							Add a start date to set up recurrence.
						</p>
					)}
				</div>
			</div>
			{open && project.startDate && (
				<Dialog open onOpenChange={setOpen}>
					<DialogContent className="max-h-[90vh] w-[min(94vw,48rem)] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>Set up recurrence</DialogTitle>
							<DialogDescription>
								Create future visits from {project.title}. Existing project
								history stays with this visit.
							</DialogDescription>
						</DialogHeader>
						<RecurrenceScheduleForm
							projectId={project._id}
							startDate={project.startDate}
							isSubmitting={isSubmitting}
							onSubmit={async (rule: RecurrenceRule) => {
								setIsSubmitting(true);
								try {
									const seriesId = await enroll({
										projectId: project._id,
										rule,
									});
									toast.success(
										"Recurrence set up",
										"Future visits are now scheduled."
									);
									setOpen(false);
									router.push(
										`/projects/series/${seriesId}?fromProjectId=${project._id}` as Route
									);
								} catch (error) {
									toast.error(
										"Setup failed",
										convexErrorMessage(
											error,
											"Check the schedule and try again."
										)
									);
								} finally {
									setIsSubmitting(false);
								}
							}}
						/>
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}
