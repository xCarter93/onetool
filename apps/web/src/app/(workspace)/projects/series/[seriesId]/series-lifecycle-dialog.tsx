"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { dateKeyFromTimestamp } from "@onetool/backend/convex/lib/projectRecurrence";
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
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import { formatVisitDate } from "../../components/recurrence/labels";

export type LifecycleAction = "pause" | "resume" | "end";

const COPY: Record<
	LifecycleAction,
	{ title: string; description: string; confirm: string; done: string }
> = {
	pause: {
		title: "Pause recurring series?",
		description:
			"Upcoming unstarted visits will be suspended. Resume follows the original schedule without backfilling.",
		confirm: "Pause series",
		done: "Series paused",
	},
	resume: {
		title: "Resume recurring series?",
		description:
			"Eligible upcoming visits will return to the planned state. The original schedule and end condition stay in place. Past cancelled visits stay cancelled.",
		confirm: "Resume series",
		done: "Series resumed",
	},
	end: {
		title: "End recurring series?",
		description:
			"Upcoming unstarted visits will be cancelled. You can resume the series later from its original schedule.",
		confirm: "End series",
		done: "Series ended",
	},
};

export function SeriesLifecycleDialog({
	seriesId,
	timezone,
	action,
	onClose,
}: {
	seriesId: Id<"projectSeries">;
	timezone: string;
	action: LifecycleAction | null;
	onClose: () => void;
}) {
	const toast = useToast();
	const [isSaving, setIsSaving] = useState(false);
	const [renderedAt] = useState(Date.now);
	const preview = useQuery(
		api.projectSeries.previewLifecycle,
		action ? { seriesId, action } : "skip"
	);
	const lifecycle = useMutation(api.projectSeries.lifecycle);

	const seriesToday = Date.parse(
		`${dateKeyFromTimestamp(renderedAt, timezone)}T00:00:00Z`
	);
	const upcoming =
		preview?.visits.filter((visit) => (visit.startDate ?? 0) >= seriesToday)
			.length ?? 0;
	const past = (preview?.visits.length ?? 0) - upcoming;
	const copy = action ? COPY[action] : null;

	const confirm = async () => {
		if (!action || !preview) return;
		setIsSaving(true);
		try {
			await lifecycle({ seriesId, action, expectedVersion: preview.revision });
			toast.success(COPY[action].done, "The recurring schedule has been updated.");
			onClose();
		} catch (error) {
			toast.error(
				"Update failed",
				convexErrorMessage(error, "Refresh the page and try again.")
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{copy?.title}</DialogTitle>
					<DialogDescription>{copy?.description}</DialogDescription>
				</DialogHeader>
				<div className="rounded-md bg-muted p-4">
					{preview === undefined ? (
						<Skeleton className="h-12" />
					) : (
						<>
							{action === "resume" ? (
								<>
									<p className="text-sm font-medium tabular-nums">
										Upcoming visits restored: {upcoming}
									</p>
									{upcoming === 0 && (
										<p className="mt-1 text-sm text-muted-foreground">
											No existing upcoming visits will be restored. If the
											saved count or end date is exhausted, resuming adds no
											occurrences. After resuming, restore a visit individually
											or edit the schedule deliberately.
										</p>
									)}
									<p className="text-sm text-muted-foreground tabular-nums">
										Past cancellations retained: {past}
									</p>
									<p className="text-sm text-muted-foreground tabular-nums">
										Protected visits unchanged: {preview.preserved}
									</p>
								</>
							) : (
								<>
									<p className="text-sm font-medium tabular-nums">
										Affected visits: {preview.count}
									</p>
									<p className="text-sm text-muted-foreground tabular-nums">
										Preserved visits: {preview.preserved}
									</p>
								</>
							)}
							{preview.visits.slice(0, 4).map((visit) => (
								<p
									key={visit._id}
									className="mt-1 truncate text-sm text-muted-foreground"
								>
									{visit.title}, {formatVisitDate(visit.startDate)}
								</p>
							))}
						</>
					)}
				</div>
				<DialogFooter showCloseButton>
					<Button
						variant={action === "end" ? "destructive" : "default"}
						disabled={isSaving || preview === undefined}
						onClick={() => void confirm()}
					>
						{isSaving ? "Updating..." : copy?.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
