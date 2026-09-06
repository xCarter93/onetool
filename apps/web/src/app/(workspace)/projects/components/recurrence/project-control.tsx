"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import type { RecurrenceRule } from "./rule";

type RecurrenceProject = Pick<Doc<"projects">, "_id" | "title"> & {
	startDate?: number | null;
	recurringSeriesId?: Doc<"projects">["recurringSeriesId"] | null;
	recurringState?: Doc<"projects">["recurringState"] | null;
};

export function RecurrenceProjectControl({
	project,
}: {
	project: RecurrenceProject;
}) {
	const [open, setOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const router = useRouter();
	const { can, hasAllRecords } = usePermissions();
	const toast = useToast();
	const enroll = useMutation(api.projectSeries.enroll);
	const canViewSeries = can("projects") && hasAllRecords("projects");
	const canManage = canViewSeries && can("projects", "modify");

	if (project.recurringSeriesId) {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<StatusBadge role="neutral" appearance="outline">
					<Repeat className="size-3.5" /> Recurring
				</StatusBadge>
				{project.recurringState && (
					<StatusBadge role="neutral" appearance="outline">
						{project.recurringState}
					</StatusBadge>
				)}
				{canViewSeries && (
					<Button
						variant="outline"
						size="sm"
						render={
							<Link
								href={`/projects/series/${project.recurringSeriesId}` as Route}
							/>
						}
					>
						View series
					</Button>
				)}
			</div>
		);
	}

	if (!canManage) return null;

	return (
		<>
			<div>
				<Button
					variant="outline"
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
									router.push(`/projects/series/${seriesId}` as Route);
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
