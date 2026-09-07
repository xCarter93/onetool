import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ProjectLinked = { projectId?: Id<"projects"> };

export function isSuppressedRecurringProject(
	project: Doc<"projects">
): boolean {
	return (
		project.recurringSeriesId !== undefined &&
		(project.recurringState === "paused" ||
			project.recurringState === "skipped" ||
			project.recurringState === "ended")
	);
}

export async function filterActiveScheduledItems<T extends ProjectLinked>(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	items: T[]
): Promise<T[]> {
	const projectIds = [
		...new Set(
			items.flatMap((item) => (item.projectId ? [item.projectId] : []))
		),
	];
	const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
	const suppressedIds = new Set(
		projects
			.filter(
				(project): project is Doc<"projects"> =>
					project !== null && isSuppressedRecurringProject(project)
			)
			.map((project) => project._id)
	);
	return items.filter(
		(item) => !item.projectId || !suppressedIds.has(item.projectId)
	);
}
