import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import {
	applyTaskTemplate,
	eligibleTaskTargets,
	loadSeriesTaskTemplates,
	MAX_TASK_TEMPLATES,
	planTaskRemoval,
	previewTemplateApplication,
	snapshotTemplateFields,
} from "./lib/projectSeriesTasks";

const countsValidator = v.object({
	revision: v.number(),
	createCount: v.number(),
	updateCount: v.number(),
	removeCount: v.number(),
	preservedCount: v.number(),
});

async function requireAccess(
	ctx: UserQueryCtx,
	level: "view" | "modify",
	deleteTasks = false
) {
	await ctx.requireLevel("projects", level);
	await ctx.requireLevel("tasks", deleteTasks ? "delete" : level);
	if (!(await ctx.hasAllRecords("projects")) || !(await ctx.hasAllRecords("tasks")))
		throw new ConvexError("Organization-wide project and task access is required");
}

async function sourceContext(ctx: UserQueryCtx, taskId: Id<"tasks">) {
	const task = await ctx.orgEntity("tasks", taskId);
	if (!task.projectId) throw new ConvexError("Only project tasks can be copied");
	const project = await ctx.orgEntity("projects", task.projectId);
	if (!project.recurringSeriesId)
		throw new ConvexError("Task does not belong to a recurring project");
	const series = await ctx.orgEntity("projectSeries", project.recurringSeriesId);
	if (series.state !== "active") throw new ConvexError("Only active series can copy task setup");
	const provenanceTemplate = task.projectTaskTemplateId
		? await ctx.orgEntity("projectTaskTemplates", task.projectTaskTemplateId)
		: null;
	if (provenanceTemplate && provenanceTemplate.seriesId !== series._id)
		throw new ConvexError("Copied task provenance does not match this series");
	const template = provenanceTemplate ?? await ctx.db.query("projectTaskTemplates")
		.withIndex("by_series_source", (q) => q.eq("seriesId", series._id).eq("sourceTaskId", task._id)).unique();
	return { task, project, series, template };
}

export const getSetup = userQuery({
	args: { projectId: v.id("projects") },
	returns: v.union(
		v.null(),
		v.object({
			seriesId: v.id("projectSeries"),
			state: v.union(v.literal("active"), v.literal("paused"), v.literal("ended")),
			canCopy: v.boolean(),
			canRemove: v.boolean(),
			templates: v.array(v.object({
				_id: v.id("projectTaskTemplates"),
				sourceTaskId: v.id("tasks"),
				title: v.string(),
				active: v.boolean(),
				sourceAvailable: v.boolean(),
			})),
		})
	),
	handler: async (ctx, args) => {
		await requireAccess(ctx, "view");
		const project = await ctx.orgEntity("projects", args.projectId);
		if (!project.recurringSeriesId) return null;
		const series = await ctx.orgEntity("projectSeries", project.recurringSeriesId);
		const templates = [];
		for (const row of await loadSeriesTaskTemplates(ctx, series._id)) {
			const source = await ctx.db.get(row.sourceTaskId);
			templates.push({
				_id: row._id, sourceTaskId: row.sourceTaskId, title: row.title,
				active: row.active,
				sourceAvailable: Boolean(source && source.orgId === ctx.orgId),
			});
		}
		const [projectsModify, tasksModify, tasksDelete, allProjects, allTasks] = await Promise.all([
			ctx.can("projects", "modify"), ctx.can("tasks", "modify"), ctx.can("tasks", "delete"),
			ctx.hasAllRecords("projects"), ctx.hasAllRecords("tasks"),
		]);
		return {
			seriesId: series._id, state: series.state,
			canCopy: series.state === "active" && projectsModify && tasksModify && allProjects && allTasks,
			canRemove: projectsModify && tasksDelete && allProjects && allTasks,
			templates,
		};
	},
});

export const previewCopy = userQuery({
	args: { taskId: v.id("tasks") },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify");
		const { project, series, template } = await sourceContext(ctx, args.taskId);
		const counts = template
			? await previewTemplateApplication(ctx, template, series, project)
			: { createCount: (await eligibleTaskTargets(ctx, series, project)).length,
				updateCount: 0, removeCount: 0, preservedCount: 0 };
		return { revision: series.revision ?? 0, ...counts };
	},
});

export const copy = userMutation({
	args: { taskId: v.id("tasks"), expectedRevision: v.number() },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify");
		const { task, project, series, template: existing } = await sourceContext(ctx, args.taskId);
		if ((series.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Preview is stale; review the changes again");
		const snapshot = snapshotTemplateFields(task, project);
		let templateId: Id<"projectTaskTemplates">;
		if (existing) {
			templateId = existing._id;
			await ctx.db.patch(templateId, {
				...snapshot, sourceNominalDate: project.recurringNominalDate!,
				active: true, revision: existing.revision + 1,
			});
		} else {
			if ((await loadSeriesTaskTemplates(ctx, series._id)).length >= MAX_TASK_TEMPLATES)
				throw new ConvexError(`A series can save at most ${MAX_TASK_TEMPLATES} task templates`);
			templateId = await ctx.db.insert("projectTaskTemplates", {
				orgId: ctx.orgId, seriesId: series._id, sourceTaskId: task._id,
				sourceNominalDate: project.recurringNominalDate!,
				...snapshot, active: true, revision: 1,
			});
		}
		const template = (await ctx.db.get(templateId))!;
		const counts = await applyTaskTemplate(ctx, template, series, project, ctx.user._id);
		const revision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, { revision });
		return { revision, ...counts };
	},
});

async function removalContext(ctx: UserQueryCtx, templateId: Id<"projectTaskTemplates">) {
	const template = await ctx.orgEntity("projectTaskTemplates", templateId);
	const series = await ctx.orgEntity("projectSeries", template.seriesId);
	return { template, series, ...(await planTaskRemoval(ctx, template, series)) };
}

export const previewRemoval = userQuery({
	args: { templateId: v.id("projectTaskTemplates") },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify", true);
		const { series, counts } = await removalContext(ctx, args.templateId);
		return { revision: series.revision ?? 0, ...counts };
	},
});

export const remove = userMutation({
	args: { templateId: v.id("projectTaskTemplates"), expectedRevision: v.number() },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify", true);
		const { template, series, ledgers, counts } = await removalContext(ctx, args.templateId);
		if ((series.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Preview is stale; review the changes again");
		await ctx.db.patch(template._id, { active: false });
		for (const ledger of ledgers) {
			// Detach the ledger before deleting so the tasks trigger doesn't re-mark it removed-by-user.
			await ctx.db.patch(ledger._id, { state: "removed-from-setup", taskId: undefined });
			if (ledger.taskId) await ctx.db.delete(ledger.taskId);
		}
		const revision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, { revision });
		return { revision, ...counts };
	},
});
