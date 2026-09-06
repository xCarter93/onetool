import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { dateKeyFromTimestamp } from "./lib/projectRecurrence";
import {
	applyTaskTemplate,
	eligibleTaskTargets,
	MAX_TASK_TARGETS,
	MAX_TASK_TEMPLATES,
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
	const provenanceTemplate = task.projectTaskTemplateId
		? await ctx.orgEntity("projectTaskTemplates", task.projectTaskTemplateId)
		: null;
	if (provenanceTemplate && provenanceTemplate.seriesId !== series._id)
		throw new ConvexError("Copied task provenance does not match this series");
	return { task, project, series, provenanceTemplate };
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
		const rows = await ctx.db.query("projectTaskTemplates")
			.withIndex("by_series", (q) => q.eq("seriesId", series._id)).take(MAX_TASK_TEMPLATES + 1);
		if (rows.length > MAX_TASK_TEMPLATES) throw new ConvexError("Recurring task template limit exceeded");
		const templates = [];
		for (const row of rows) {
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
		const { task, project, series, provenanceTemplate } = await sourceContext(ctx, args.taskId);
		if (series.state !== "active") throw new ConvexError("Only active series can copy task setup");
		let template = provenanceTemplate ?? await ctx.db.query("projectTaskTemplates")
			.withIndex("by_series_source", (q) => q.eq("seriesId", series._id).eq("sourceTaskId", task._id)).unique();
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
		const { task, project, series, provenanceTemplate } = await sourceContext(ctx, args.taskId);
		if (series.state !== "active") throw new ConvexError("Only active series can copy task setup");
		if ((series.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Preview is stale; review the changes again");
		let template = provenanceTemplate ?? await ctx.db.query("projectTaskTemplates")
			.withIndex("by_series_source", (q) => q.eq("seriesId", series._id).eq("sourceTaskId", task._id)).unique();
		const snapshot = snapshotTemplateFields(task, project);
		if (template) {
			await ctx.db.patch(template._id, {
				...snapshot, sourceNominalDate: project.recurringNominalDate!,
				active: true, revision: template.revision + 1,
			});
			template = (await ctx.db.get(template._id))!;
		} else {
			const existing = await ctx.db.query("projectTaskTemplates")
				.withIndex("by_series", (q) => q.eq("seriesId", series._id)).take(MAX_TASK_TEMPLATES);
			if (existing.length >= MAX_TASK_TEMPLATES) throw new ConvexError(`A series can save at most ${MAX_TASK_TEMPLATES} task templates`);
			const id = await ctx.db.insert("projectTaskTemplates", {
				orgId: ctx.orgId, seriesId: series._id, sourceTaskId: task._id,
				sourceNominalDate: project.recurringNominalDate!,
				...snapshot, active: true, revision: 1,
			});
			template = (await ctx.db.get(id))!;
		}
		const counts = await applyTaskTemplate(ctx, template, series, project, ctx.user._id);
		const revision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, { revision });
		return { revision, ...counts };
	},
});

async function removalCounts(ctx: UserQueryCtx, templateId: Id<"projectTaskTemplates">) {
	const template = await ctx.orgEntity("projectTaskTemplates", templateId);
	const series = await ctx.orgEntity("projectSeries", template.seriesId);
	const today = new Date(`${dateKeyFromTimestamp(Date.now(), series.timezone)}T00:00:00.000Z`).getTime();
	const projects = await ctx.db.query("projects")
		.withIndex("by_series_start", (q) => q
			.eq("recurringSeriesId", series._id)
			.gte("startDate", today))
		.take(MAX_TASK_TARGETS + 1);
	if (projects.length > MAX_TASK_TARGETS) throw new ConvexError(`Task setup can affect at most ${MAX_TASK_TARGETS} projects at once`);
	let removeCount = 0;
	let preservedCount = 0;
	const removable: Doc<"projectTaskCopies">[] = [];
	const todayKey = dateKeyFromTimestamp(Date.now(), series.timezone);
	for (const project of projects) {
		const ledger = await ctx.db.query("projectTaskCopies")
			.withIndex("by_template_project", (q) => q.eq("templateId", template._id).eq("projectId", project._id)).unique();
		if (!ledger) continue;
		if (ledger.state !== "materialized" || ledger.protected || !ledger.taskId) { preservedCount++; continue; }
		const [task, invoice] = await Promise.all([
			ctx.db.get(ledger.taskId),
			ctx.db.query("invoices").withIndex("by_project", (q) => q.eq("projectId", ledger.projectId)).first(),
		]);
		const begunSibling = await Promise.all([
			ctx.db.query("tasks").withIndex("by_project_status", (q) =>
				q.eq("projectId", project._id).eq("status", "in-progress")).first(),
			ctx.db.query("tasks").withIndex("by_project_status", (q) =>
				q.eq("projectId", project._id).eq("status", "completed")).first(),
		]);
		const setupManagedProject = project && (
			project.status === "planned" ||
			project.recurringState === "paused" ||
			project.recurringState === "ended"
		);
		if (
			!task || task.status !== "pending" || !setupManagedProject || invoice ||
			project.completedAt !== undefined || begunSibling.some(Boolean) ||
			project.recurringSkipReason === "manual" || project.startDate === undefined ||
			new Date(project.startDate).toISOString().slice(0, 10) < todayKey
		) {
			preservedCount++;
			continue;
		}
		removeCount++;
		removable.push(ledger);
	}
	return { template, series, ledgers: removable, counts: { createCount: 0, updateCount: 0, removeCount, preservedCount } };
}

export const previewRemoval = userQuery({
	args: { templateId: v.id("projectTaskTemplates") },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify", true);
		const result = await removalCounts(ctx, args.templateId);
		return { revision: result.series.revision ?? 0, ...result.counts };
	},
});

export const remove = userMutation({
	args: { templateId: v.id("projectTaskTemplates"), expectedRevision: v.number() },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify", true);
		const result = await removalCounts(ctx, args.templateId);
		if ((result.series.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Preview is stale; review the changes again");
		await ctx.db.patch(result.template._id, { active: false });
		for (const ledger of result.ledgers) {
			await ctx.db.patch(ledger._id, { state: "removed-from-setup", taskId: undefined });
			if (ledger.taskId) await ctx.db.delete(ledger.taskId);
		}
		const revision = (result.series.revision ?? 0) + 1;
		await ctx.db.patch(result.series._id, { revision });
		return { revision, ...result.counts };
	},
});
