import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { emitRecordCreatedEvent, emitRecordUpdatedEvent } from "../eventBus";
import { getMembership } from "./memberships";
import { addCalendarDays, calendarDayDifference, dateKeyFromTimestamp, storedDate, storedDateKey } from "./projectRecurrence";

export const MAX_TASK_TEMPLATES = 50;
export const MAX_SERIES_TARGETS = 200;
export const MAX_GENERATED_TASKS = 200;

type Counts = {
	createCount: number;
	updateCount: number;
	removeCount: number;
	preservedCount: number;
};

export async function projectHasInvoice(ctx: QueryCtx, projectId: Id<"projects">, quoteId?: Id<"quotes">) {
	if (await ctx.db.query("invoices").withIndex("by_project", (q) => q.eq("projectId", projectId)).first()) return true;
	if (await ctx.db.query("invoiceGroups").withIndex("by_source_project", (q) => q.eq("sourceProjectId", projectId)).first()) return true;
	if (!quoteId) return false;
	if (await ctx.db.query("invoices").withIndex("by_quote", (q) => q.eq("quoteId", quoteId)).first()) return true;
	return Boolean(await ctx.db.query("invoiceGroups").withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", quoteId)).first());
}

export async function hasBegunTask(ctx: QueryCtx, projectId: Id<"projects">) {
	return Boolean(
		(await ctx.db.query("tasks").withIndex("by_project_status", (q) =>
			q.eq("projectId", projectId).eq("status", "in-progress")).first()) ||
		(await ctx.db.query("tasks").withIndex("by_project_status", (q) =>
			q.eq("projectId", projectId).eq("status", "completed")).first())
	);
}

export async function upcomingSeriesProjects(ctx: QueryCtx, series: Doc<"projectSeries">, subject: "Task" | "Quote") {
	const today = dateKeyFromTimestamp(Date.now(), series.timezone);
	const rows = await ctx.db
		.query("projects")
		.withIndex("by_series_start", (q) =>
			q.eq("recurringSeriesId", series._id).gte("startDate", storedDate(today)))
		.take(MAX_SERIES_TARGETS + 1);
	if (rows.length > MAX_SERIES_TARGETS)
		throw new ConvexError(`${subject} setup can affect at most ${MAX_SERIES_TARGETS} projects at once`);
	return { today, rows };
}

export async function eligibleTaskTargets(
	ctx: QueryCtx,
	series: Doc<"projectSeries">,
	sourceProject: Doc<"projects">
): Promise<Doc<"projects">[]> {
	if (!sourceProject.recurringNominalDate) return [];
	const { today, rows } = await upcomingSeriesProjects(ctx, series, "Task");
	const eligible: Doc<"projects">[] = [];
	for (const project of rows) {
		if (
			!project.recurringNominalDate ||
			project.recurringNominalDate <= sourceProject.recurringNominalDate ||
			project.status !== "planned" ||
			project.completedAt !== undefined ||
			project.recurringState !== undefined ||
			project.startDate === undefined ||
			storedDateKey(project.startDate) < today ||
			(await projectHasInvoice(ctx, project._id)) ||
			(await hasBegunTask(ctx, project._id))
		) continue;
		eligible.push(project);
	}
	return eligible;
}

async function templateLedger(
	ctx: QueryCtx,
	templateId: Id<"projectTaskTemplates">,
	projectId: Id<"projects">
) {
	return await ctx.db
		.query("projectTaskCopies")
		.withIndex("by_template_project", (q) =>
			q.eq("templateId", templateId).eq("projectId", projectId)
		)
		.unique();
}

async function canApplyAssignee(
	ctx: QueryCtx,
	template: Doc<"projectTaskTemplates">
) {
	return template.assigneeUserId &&
		(await getMembership(ctx, template.assigneeUserId, template.orgId))
		? template.assigneeUserId
		: undefined;
}

function taskFields(
	template: Doc<"projectTaskTemplates">,
	project: Doc<"projects">,
	assigneeUserId: Id<"users"> | undefined
) {
	if (project.startDate === undefined) throw new ConvexError("Recurring project date is missing");
	return {
		orgId: template.orgId,
		projectId: project._id,
		clientId: project.clientId,
		propertyId: project.propertyId,
		type: template.type,
		source: template.source,
		title: template.title,
		description: template.description,
		date: storedDate(addCalendarDays(storedDateKey(project.startDate), template.dateOffsetDays)),
		startTime: template.startTime,
		endTime: template.endTime,
		assigneeUserId,
		status: "pending" as const,
		repeat: "none" as const,
		projectTaskTemplateId: template._id,
		recurringTaskAppliedRevision: template.revision,
	};
}

export async function previewTemplateApplication(
	ctx: QueryCtx,
	template: Doc<"projectTaskTemplates">,
	series: Doc<"projectSeries">,
	sourceProject: Doc<"projects">
): Promise<Counts> {
	const counts: Counts = { createCount: 0, updateCount: 0, removeCount: 0, preservedCount: 0 };
	for (const project of await eligibleTaskTargets(ctx, series, sourceProject)) {
		const ledger = await templateLedger(ctx, template._id, project._id);
		if (!ledger || ledger.state === "removed-from-setup") counts.createCount++;
		else if (ledger.state === "removed-by-user" || ledger.protected) counts.preservedCount++;
		else {
			const task = ledger.taskId ? await ctx.db.get(ledger.taskId) : null;
			if (!task || task.status !== "pending") counts.preservedCount++;
			else counts.updateCount++;
		}
	}
	return counts;
}

export async function applyTaskTemplate(
	ctx: MutationCtx,
	template: Doc<"projectTaskTemplates">,
	series: Doc<"projectSeries">,
	sourceProject: Doc<"projects">,
	createdByUserId: Id<"users">
): Promise<Counts> {
	const counts: Counts = { createCount: 0, updateCount: 0, removeCount: 0, preservedCount: 0 };
	const assigneeUserId = await canApplyAssignee(ctx, template);
	for (const project of await eligibleTaskTargets(ctx, series, sourceProject)) {
		const ledger = await templateLedger(ctx, template._id, project._id);
		if (ledger?.state === "removed-by-user" || ledger?.protected) {
			counts.preservedCount++;
			continue;
		}
		const existing = ledger?.taskId ? await ctx.db.get(ledger.taskId) : null;
		if (ledger?.state === "materialized" && existing) {
			if (existing.status !== "pending") {
				counts.preservedCount++;
				continue;
			}
			const fields = taskFields(template, project, assigneeUserId);
			const changedFields = (Object.keys(fields) as Array<keyof typeof fields>).filter(
				(field) => field !== "recurringTaskAppliedRevision" && fields[field] !== existing[field]
			);
			await ctx.db.patch(existing._id, fields);
			await ctx.db.patch(ledger._id, { appliedRevision: template.revision });
			if (changedFields.length)
				await emitRecordUpdatedEvent(ctx, template.orgId, "task", existing._id,
					changedFields, "projectSeriesTasks.copy");
			counts.updateCount++;
			continue;
		}
		const taskId = await ctx.db.insert("tasks", {
			...taskFields(template, project, assigneeUserId),
			createdByUserId,
		});
		if (ledger) await ctx.db.patch(ledger._id, {
			taskId, state: "materialized", protected: false, appliedRevision: template.revision,
		});
		else await ctx.db.insert("projectTaskCopies", {
			orgId: template.orgId, seriesId: template.seriesId, templateId: template._id,
			projectId: project._id, taskId, state: "materialized", protected: false,
			appliedRevision: template.revision,
		});
		await emitRecordCreatedEvent(ctx, template.orgId, "task", taskId, "projectSeriesTasks.copy");
		counts.createCount++;
	}
	return counts;
}

export async function planTaskRemoval(
	ctx: QueryCtx,
	template: Doc<"projectTaskTemplates">,
	series: Doc<"projectSeries">
): Promise<{ ledgers: Doc<"projectTaskCopies">[]; counts: Counts }> {
	const { today, rows } = await upcomingSeriesProjects(ctx, series, "Task");
	const counts: Counts = { createCount: 0, updateCount: 0, removeCount: 0, preservedCount: 0 };
	const ledgers: Doc<"projectTaskCopies">[] = [];
	for (const project of rows) {
		const ledger = await templateLedger(ctx, template._id, project._id);
		if (!ledger) continue;
		const task = ledger.state === "materialized" && !ledger.protected && ledger.taskId
			? await ctx.db.get(ledger.taskId) : null;
		// Removal still reaches paused/ended visits so the setup can be cleaned up before a resume.
		const setupManaged = project.status === "planned" ||
			project.recurringState === "paused" || project.recurringState === "ended";
		if (
			task?.status !== "pending" || !setupManaged ||
			project.completedAt !== undefined || project.recurringSkipReason === "manual" ||
			project.startDate === undefined || storedDateKey(project.startDate) < today ||
			(await projectHasInvoice(ctx, project._id)) || (await hasBegunTask(ctx, project._id))
		) {
			counts.preservedCount++;
			continue;
		}
		counts.removeCount++;
		ledgers.push(ledger);
	}
	return { ledgers, counts };
}

export async function applyActiveTaskTemplatesToProject(
	ctx: MutationCtx,
	series: Doc<"projectSeries">,
	project: Doc<"projects">,
	templates: Doc<"projectTaskTemplates">[]
): Promise<number> {
	let created = 0;
	for (const template of templates) {
		if (
			!template.active || !project.recurringNominalDate ||
			project.recurringNominalDate <= template.sourceNominalDate
		) continue;
		const ledger = await templateLedger(ctx, template._id, project._id);
		if (ledger?.state === "removed-by-user" || ledger?.state === "materialized") continue;
		const assigneeUserId = await canApplyAssignee(ctx, template);
		const taskId = await ctx.db.insert("tasks", {
			...taskFields(template, project, assigneeUserId), createdByUserId: series.createdByUserId,
		});
		if (ledger) await ctx.db.patch(ledger._id, { taskId, state: "materialized", protected: false, appliedRevision: template.revision });
		else await ctx.db.insert("projectTaskCopies", {
			orgId: series.orgId, seriesId: series._id, templateId: template._id,
			projectId: project._id, taskId, state: "materialized", protected: false,
			appliedRevision: template.revision,
		});
		await emitRecordCreatedEvent(ctx, series.orgId, "task", taskId, "projectSeries.generate");
		created++;
	}
	return created;
}

export async function loadSeriesTaskTemplates(
	ctx: QueryCtx,
	seriesId: Id<"projectSeries">
): Promise<Doc<"projectTaskTemplates">[]> {
	const templates = await ctx.db.query("projectTaskTemplates")
		.withIndex("by_series", (q) => q.eq("seriesId", seriesId)).take(MAX_TASK_TEMPLATES + 1);
	if (templates.length > MAX_TASK_TEMPLATES) throw new ConvexError("Recurring task template limit exceeded");
	return templates;
}

export function snapshotTemplateFields(source: Doc<"tasks">, sourceProject: Doc<"projects">) {
	if (sourceProject.startDate === undefined) throw new ConvexError("Source project start date is missing");
	return {
		title: source.title,
		description: source.description,
		type: source.type,
		source: source.source,
		dateOffsetDays: calendarDayDifference(storedDateKey(sourceProject.startDate), storedDateKey(source.date)),
		startTime: source.startTime,
		endTime: source.endTime,
		assigneeUserId: source.assigneeUserId,
	};
}
