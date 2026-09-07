"use client";

import Link from "next/link";
import type { Route } from "next";
import { Repeat } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

type SeriesProject = Pick<Doc<"projects">, "_id"> & {
	recurringSeriesId?: Doc<"projects">["recurringSeriesId"] | null;
};

type ProjectSeriesLinkProps = (
	| { project: SeriesProject | null | undefined; projectId?: never }
	| { projectId: Id<"projects">; project?: never }
) & { className?: string; showIcon?: boolean };

export function ProjectSeriesLink({ project, projectId, className, showIcon = true }: ProjectSeriesLinkProps) {
	const { can, hasAllRecords } = usePermissions();
	const canViewSeries = can("projects") && hasAllRecords("projects");
	const fetched = useQuery(
		api.projects.get,
		projectId && !project && canViewSeries ? { id: projectId } : "skip",
	);
	const resolved = project ?? fetched;
	if (!canViewSeries || !resolved?.recurringSeriesId) return null;

	return (
		<Link
			href={`/projects/series/${resolved.recurringSeriesId}?fromProjectId=${resolved._id}` as Route}
			className={cn(
				"inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
		>
			{showIcon && <Repeat className="size-3.5" aria-hidden="true" />}
			View series
		</Link>
	);
}
