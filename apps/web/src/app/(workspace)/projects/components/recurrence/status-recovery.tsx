"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";

export function RecurrenceStatusRecovery({
	project,
}: {
	project: Pick<Doc<"projects">, "_id" | "recurringSeriesId" | "recurringState">;
}) {
	const { can, hasAllRecords } = usePermissions();
	const canView = can("projects") && hasAllRecords("projects");
	const canManage = canView && can("projects", "modify");
	const details = useQuery(
		api.projectSeries.get,
		project.recurringSeriesId && canView
			? { seriesId: project.recurringSeriesId }
			: "skip"
	);
	const restore = useMutation(api.projectSeries.restoreVisit);
	const toast = useToast();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	if (!project.recurringState || !project.recurringSeriesId) return null;
	if (!canManage) {
		return <p className="mt-2 text-sm text-muted-foreground">Ask someone who manages this series to resume it or restore this visit.</p>;
	}
	if (details === undefined) return <Skeleton className="mt-2 h-8 w-full" />;
	if (!details) {
		return <p className="mt-2 text-sm text-muted-foreground">The recurring series is unavailable. Refresh the page to try again.</p>;
	}
	if (details.series.state !== "active") {
		return (
			<div className="mt-2 space-y-1">
				<p className="text-sm text-muted-foreground">
					This series is {details.series.state}. Review its remaining visits before resuming.
				</p>
				<Link
					href={`/projects/series/${project.recurringSeriesId}?fromProjectId=${project._id}&action=resume` as Route}
					className="inline-flex min-h-11 items-center text-sm font-medium text-primary outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
				>
					Resume series
				</Link>
			</div>
		);
	}
	return (
		<div className="mt-2 space-y-2">
			<p className="text-sm text-muted-foreground">Restore this visit to Planned to work on it again. Other visits keep their current status.</p>
			<Button
				variant="outline"
				size="sm"
				className="min-h-11"
				disabled={saving}
				onClick={async () => {
					setSaving(true);
					setError(null);
					try {
						await restore({ projectId: project._id });
						toast.success("Visit restored", "This visit is now Planned.");
					} catch (cause) {
						setError(convexErrorMessage(cause, "This visit could not be restored. Refresh the page and try again."));
					} finally {
						setSaving(false);
					}
				}}
			>
				{saving ? "Restoring..." : "Restore visit"}
			</Button>
			{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
