import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { internalMutation } from "./lib/triggers";
import { getMembership } from "./lib/memberships";
import { loadSeriesQuoteTemplates } from "./lib/projectSeriesQuotes";
import { visitBillingContext } from "./lib/recurringBilling";
import {
	emitRecordCreatedEvent,
	emitRecordUpdatedEvent,
	emitStatusChangeEvent,
} from "./eventBus";
import {
	addCalendarDays,
	dateKeyFromTimestamp,
	listRecurrenceDates,
	projectRecurrenceRuleValidator,
	storedDate,
	storedDateKey,
	validateRecurrenceRule,
} from "./lib/projectRecurrence";
import {
	assertProjectSupportsRecurrence,
	enrollProjectInSeries,
	generateProjectSeriesOccurrences,
	HOUR,
	WINDOW_DAYS,
} from "./lib/projectSeriesEnrollment";

const SWEEP_BATCH = 50;
const generationResult = v.object({
	created: v.number(),
	remaining: v.number(),
});

async function requireSeriesAccess(
	ctx: UserQueryCtx,
	level: "view" | "modify"
) {
	await ctx.requireLevel("projects", level);
	if (!(await ctx.hasAllRecords("projects"))) {
		throw new Error(
			"Organization-wide project access is required to manage recurrence"
		);
	}
}

export const preview = userQuery({
	args: {
		projectId: v.id("projects"),
		rule: projectRecurrenceRuleValidator,
		from: v.optional(v.string()),
		through: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "view");
		const project = await ctx.orgEntity("projects", args.projectId);
		assertProjectSupportsRecurrence(project);
		if (project.startDate === undefined)
			throw new Error("Set a project start date before configuring recurrence");
		const org = await ctx.db.get(ctx.orgId);
		if (!org) throw new Error("Organization not found");
		const series = project.recurringSeriesId
			? await ctx.orgEntity("projectSeries", project.recurringSeriesId)
			: null;
		const anchor = series?.anchorDateKey ?? storedDateKey(project.startDate);
		const from =
			args.from ??
			dateKeyFromTimestamp(
				Date.now(),
				series?.timezone ?? org.timezone ?? "UTC"
			);
		const limit = args.limit ?? 100;
		if (!Number.isInteger(limit) || limit < 1 || limit > 100)
			throw new Error("Preview limit must be between 1 and 100");
		return listRecurrenceDates({
			rule: args.rule,
			anchor,
			from,
			through: args.through ?? addCalendarDays(from, WINDOW_DAYS),
			limit,
			includeNext: true,
		});
	},
});

export const enroll = userMutation({
	args: { projectId: v.id("projects"), rule: projectRecurrenceRuleValidator },
	returns: v.id("projectSeries"),
	handler: async (ctx, args): Promise<Id<"projectSeries">> => {
		await requireSeriesAccess(ctx, "modify");
		const project = await ctx.orgEntity("projects", args.projectId);
		return enrollProjectInSeries(ctx, project, args.rule);
	},
});

export const generate = internalMutation({
	args: { orgId: v.id("organizations"), seriesId: v.id("projectSeries") },
	returns: generationResult,
	handler: async (
		ctx,
		args
	): Promise<{ created: number; remaining: number }> => {
		const series = await ctx.db.get(args.seriesId);
		if (!series) return { created: 0, remaining: 0 };
		if (series.orgId !== args.orgId)
			throw new Error("Series does not belong to this organization");
		return generateProjectSeriesOccurrences(ctx, series);
	},
});

export const sweep = internalMutation({
	args: {},
	returns: v.object({ dispatched: v.number() }),
	handler: async (ctx): Promise<{ dispatched: number }> => {
		const now = Date.now();
		const due = await ctx.db
			.query("projectSeries")
			.withIndex("by_state_next_generation", (q) =>
				q
					.eq("state", "active")
					.gt("nextGenerationAt", 0)
					.lte("nextGenerationAt", now)
			)
			.take(SWEEP_BATCH);
		for (const series of due) {
			await ctx.db.patch(series._id, { nextGenerationAt: now + HOUR });
			await ctx.scheduler.runAfter(0, internal.projectSeries.generate, {
				orgId: series.orgId,
				seriesId: series._id,
			});
		}
		if (due.length === SWEEP_BATCH)
			await ctx.scheduler.runAfter(0, internal.projectSeries.sweep, {});
		return { dispatched: due.length };
	},
});

const MAX_AFFECTED = 200;
const projectDoc = doc(schema, "projects");
const lifecycleAction = v.union(
	v.literal("pause"),
	v.literal("resume"),
	v.literal("end")
);
const affectedPreview = {
	count: v.number(),
	preserved: v.number(),
	revision: v.number(),
	visits: v.array(
		v.object({
			_id: v.id("projects"),
			title: v.string(),
			startDate: v.optional(v.number()),
		})
	),
};

function todayFor(series: Doc<"projectSeries">): number {
	return storedDate(dateKeyFromTimestamp(Date.now(), series.timezone));
}

function checkRevision(series: Doc<"projectSeries">, expected: number) {
	if ((series.revision ?? 0) !== expected)
		throw new Error(
			"The series changed. Review the updated preview and try again"
		);
}

function boundedVisits(rows: Doc<"projects">[]): Doc<"projects">[] {
	if (rows.length > MAX_AFFECTED)
		throw new Error(
			"This change affects more than 200 visits. Move or resolve older visits before changing the series"
		);
	return rows;
}

async function upcoming(ctx: QueryCtx, series: Doc<"projectSeries">) {
	return boundedVisits(
		await ctx.db
			.query("projects")
			.withIndex("by_series_start", (q) =>
				q.eq("recurringSeriesId", series._id).gte("startDate", todayFor(series))
			)
			.take(MAX_AFFECTED + 1)
	);
}

async function hasStartedOrBilled(
	ctx: QueryCtx,
	project: Doc<"projects">
): Promise<boolean> {
	if (
		project.completedAt ||
		project.status === "in-progress" ||
		project.status === "completed"
	)
		return true;
	for (const status of ["in-progress", "completed"] as const) {
		if (
			await ctx.db
				.query("tasks")
				.withIndex("by_project_status", (q) =>
					q.eq("projectId", project._id).eq("status", status)
				)
				.first()
		)
			return true;
	}
	return !!(await ctx.db
		.query("invoices")
		.withIndex("by_project", (q) => q.eq("projectId", project._id))
		.first()) || !!(await ctx.db
		.query("invoiceGroups")
		.withIndex("by_source_project", (q) => q.eq("sourceProjectId", project._id))
		.first());
}

function summary(
	visits: Doc<"projects">[],
	preserved: number,
	series: Doc<"projectSeries">
) {
	return {
		count: visits.length,
		preserved,
		revision: series.revision ?? 0,
		visits: visits.map(({ _id, title, startDate }) => ({
			_id,
			title,
			startDate,
		})),
	};
}

async function lifecycleVisits(
	ctx: QueryCtx,
	series: Doc<"projectSeries">,
	action: "pause" | "resume" | "end"
) {
	const resumeState = series.state === "ended" ? "ended" : "paused";
	const rows =
		action === "resume"
			? boundedVisits(
					await ctx.db
						.query("projects")
						.withIndex("by_series_state", (q) =>
							q
								.eq("recurringSeriesId", series._id)
								.eq("recurringState", resumeState)
						)
						.take(MAX_AFFECTED + 1)
				)
			: await upcoming(ctx, series);
	const visits: Doc<"projects">[] = [];
	let preserved = 0;
	for (const project of rows) {
		const eligible =
			action === "resume"
				? project.recurringState === resumeState
				: (project.status === "planned" && !project.recurringState) ||
					(action === "end" && project.recurringState === "paused");
		if (!eligible || (await hasStartedOrBilled(ctx, project))) {
			preserved++;
			continue;
		}
		visits.push(project);
	}
	return { visits, preserved };
}

export const get = userQuery({
	args: {
		seriesId: v.id("projectSeries"),
		fromProjectId: v.optional(v.string()),
	},
	returns: v.union(
		v.null(),
		v.object({
			series: doc(schema, "projectSeries"),
			canManage: v.boolean(),
			clientName: v.string(),
			propertyName: v.union(v.string(), v.null()),
			nextVisit: v.union(projectDoc, v.null()),
			returnProject: v.union(
				v.null(),
				v.object({ _id: v.id("projects"), title: v.string() })
			),
		})
	),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "view");
		const series = await ctx.db.get(args.seriesId);
		if (!series || series.orgId !== ctx.orgId) return null;
		const showClient = await ctx.can("clients", "view");
		const client = showClient ? await ctx.db.get(series.clientId) : null;
		const property =
			showClient && series.propertyId
				? await ctx.db.get(series.propertyId)
				: null;
		let nextVisit: Doc<"projects"> | null = null;
		for await (const project of ctx.db
			.query("projects")
			.withIndex("by_series_start", (q) =>
				q.eq("recurringSeriesId", series._id).gte("startDate", todayFor(series))
			)) {
			if (
				!project.recurringState &&
				(project.status === "planned" || project.status === "in-progress")
			) {
				nextVisit = project;
				break;
			}
		}
		const candidateId = args.fromProjectId
			? ctx.db.normalizeId("projects", args.fromProjectId)
			: null;
		const candidate = candidateId ? await ctx.db.get(candidateId) : null;
		const origin = await ctx.db.get(series.originatingProjectId);
		const returnProject =
			candidate?.orgId === ctx.orgId &&
			candidate.recurringSeriesId === series._id
				? candidate
				: origin?.orgId === ctx.orgId && origin.recurringSeriesId === series._id
					? origin
					: null;
		return {
			series,
			canManage: await ctx.can("projects", "modify"),
			clientName:
				client?.companyName ?? (showClient ? "Deleted client" : "Client"),
			propertyName: property?.streetAddress ?? null,
			nextVisit,
			returnProject: returnProject
				? { _id: returnProject._id, title: returnProject.title }
				: null,
		};
	},
});

const SETUP_QUOTE_SCAN = 50;

async function findSeriesQuote(ctx: QueryCtx, series: Doc<"projectSeries">) {
	const inOrg = (quote: Doc<"quotes"> | null) =>
		quote && quote.orgId === series.orgId ? quote : null;
	if (series.agreementQuoteId) {
		const quote = inOrg(await ctx.db.get(series.agreementQuoteId));
		if (quote) return quote;
	}
	for (const template of await loadSeriesQuoteTemplates(ctx, series._id)) {
		const quote = inOrg(await ctx.db.get(template.sourceQuoteId));
		if (quote) return quote;
	}
	const visits = await ctx.db
		.query("projects")
		.withIndex("by_series_start", (q) => q.eq("recurringSeriesId", series._id))
		.take(SETUP_QUOTE_SCAN);
	for (const visit of visits) {
		const quote = await ctx.db
			.query("quotes")
			.withIndex("by_project", (q) => q.eq("projectId", visit._id))
			.first();
		if (quote) return quote;
	}
	return null;
}

export const getSetupChecklist = userQuery({
	args: { seriesId: v.id("projectSeries") },
	returns: v.object({
		quote: v.union(
			v.null(),
			v.object({
				_id: v.id("quotes"),
				quoteNumber: v.optional(v.string()),
				total: v.optional(v.number()),
			})
		),
		billing: v.union(
			v.null(),
			v.object({
				mode: v.union(v.literal("per_visit"), v.literal("monthly")),
			})
		),
	}),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "view");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const canViewQuotes =
			(await ctx.can("quotes", "view")) &&
			(await ctx.hasAllRecords("quotes"));
		const canViewBilling = canViewQuotes && (await canViewVisitBilling(ctx));
		const quote = canViewQuotes ? await findSeriesQuote(ctx, series) : null;
		const activeRevision = series.activeAgreementRevisionId
			? await ctx.db.get(series.activeAgreementRevisionId)
			: null;
		const mode = activeRevision?.terms?.billingMode;
		return {
			quote: quote
				? {
						_id: quote._id,
						quoteNumber: quote.quoteNumber,
						total: canViewBilling ? quote.total : undefined,
					}
				: null,
			billing: canViewBilling && mode ? { mode } : null,
		};
	},
});

export const listForOrg = userQuery({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("projectSeries"),
			title: v.string(),
			state: schema.tables.projectSeries.validator.fields.state,
		})
	),
	handler: async (ctx) => {
		await requireSeriesAccess(ctx, "view");
		return (
			await ctx.db
				.query("projectSeries")
				.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
				.take(200)
		).map(({ _id, title, state }) => ({ _id, title, state }));
	},
});

export const listOccurrences = userQuery({
	args: { seriesId: v.id("projectSeries"), cursor: v.optional(v.string()) },
	returns: v.object({
		page: v.array(projectDoc),
		continueCursor: v.string(),
		isDone: v.boolean(),
		skippableIds: v.array(v.id("projects")),
		restorableIds: v.array(v.id("projects")),
		billing: v.optional(
			v.record(
				v.id("projects"),
				v.object({ state: v.string(), reason: v.optional(v.string()) })
			)
		),
	}),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "view");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const page = await ctx.db
			.query("projects")
			.withIndex("by_series_start", (q) =>
				q.eq("recurringSeriesId", args.seriesId)
			)
			.paginate({ cursor: args.cursor ?? null, numItems: 50 });
		const billing = (await canViewVisitBilling(ctx))
			? await visitBillingStates(ctx, page.page)
			: undefined;
		const skippableIds: Id<"projects">[] = [];
		const restorableIds: Id<"projects">[] = [];
		if (await ctx.can("projects", "modify")) {
			for (const project of page.page) {
				const canSkip = project.status === "planned" && !project.recurringState;
				const canRestore =
					series.state === "active" &&
					(project.recurringState === "paused" ||
						project.recurringState === "skipped" ||
						project.recurringState === "ended");
				if (
					(canSkip || canRestore) &&
					!(await hasStartedOrBilled(ctx, project))
				) {
					if (canSkip) skippableIds.push(project._id);
					if (canRestore) restorableIds.push(project._id);
				}
			}
		}
		return {
			skippableIds,
			restorableIds,
			billing,
			page: page.page,
			continueCursor: page.continueCursor,
			isDone: page.isDone,
		};
	},
});

// Mirrors recurringBilling.requireBillingAccess as a boolean; project-only viewers still get the list.
async function canViewVisitBilling(ctx: UserQueryCtx) {
	return (
		(await ctx.can("invoices", "view")) &&
		(await ctx.can("quotes", "view")) &&
		(await ctx.hasAllRecords("invoices")) &&
		(await ctx.hasAllRecords("quotes"))
	);
}

async function visitBillingStates(ctx: QueryCtx, visits: Doc<"projects">[]) {
	const states: Record<Id<"projects">, { state: string; reason?: string }> =
		{};
	for (const visit of visits) {
		let context: Awaited<ReturnType<typeof visitBillingContext>>;
		try {
			context = await visitBillingContext(ctx, visit);
		} catch (error) {
			// One visit with unreviewable billing history must not blank the whole page.
			if (error instanceof ConvexError) continue;
			throw error;
		}
		if (context.state === "ineligible") continue;
		states[visit._id] = {
			state: context.state,
			reason: "reason" in context ? context.reason : undefined,
		};
	}
	return states;
}

export const previewLifecycle = userQuery({
	args: { seriesId: v.id("projectSeries"), action: lifecycleAction },
	returns: v.object(affectedPreview),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const { visits, preserved } = await lifecycleVisits(
			ctx,
			series,
			args.action
		);
		return summary(visits, preserved, series);
	},
});

export const lifecycle = userMutation({
	args: {
		seriesId: v.id("projectSeries"),
		action: lifecycleAction,
		expectedVersion: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		checkRevision(series, args.expectedVersion);
		if (
			args.action === "resume" &&
			series.state !== "paused" &&
			series.state !== "ended"
		)
			throw new Error("This series is already active");
		if (series.state === "ended" && args.action !== "resume")
			throw new Error("Resume this ended series before changing its lifecycle");
		if (args.action === "pause" && series.state !== "active")
			throw new Error("This series is already paused");
		const { visits } = await lifecycleVisits(ctx, series, args.action);
		const revision = (series.revision ?? 0) + 1;
		for (const project of visits) {
			const resume =
				args.action === "resume" &&
				(project.startDate ?? 0) >= todayFor(series);
			const recurringState = resume
				? undefined
				: args.action === "pause"
					? "paused"
					: args.action === "end"
						? "ended"
						: "skipped";
			await ctx.db.patch(project._id, {
				status: resume ? "planned" : "cancelled",
				recurringState,
				recurringAppliedRevision: revision,
			});
			if (resume && series.state === "ended")
				await emitStatusChangeEvent(
					ctx,
					ctx.orgId,
					"project",
					project._id,
					project.status,
					"planned",
					"projectSeries.resume"
				);
			if (args.action === "end" && project.status !== "cancelled")
				await emitStatusChangeEvent(
					ctx,
					ctx.orgId,
					"project",
					project._id,
					project.status,
					"cancelled",
					"projectSeries.end"
				);
		}
		await ctx.db.patch(series._id, {
			state:
				args.action === "resume"
					? "active"
					: args.action === "pause"
						? "paused"
						: "ended",
			revision,
			nextGenerationAt: args.action === "resume" ? Date.now() : undefined,
		});
		if (args.action === "resume")
			await ctx.scheduler.runAfter(0, internal.projectSeries.generate, {
				orgId: ctx.orgId,
				seriesId: series._id,
			});
		return null;
	},
});

export const skip = userMutation({
	args: { projectId: v.id("projects") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const project = await ctx.orgEntity("projects", args.projectId);
		if (!project.recurringSeriesId)
			throw new Error("This project is not recurring");
		if (project.recurringState === "skipped") return null;
		if (
			project.status !== "planned" ||
			project.recurringState ||
			(await hasStartedOrBilled(ctx, project))
		)
			throw new Error("Only an unstarted, uninvoiced visit can be skipped");
		await ctx.db.patch(project._id, {
			status: "cancelled",
			recurringState: "skipped",
			recurringSkipReason: "manual",
		});
		return null;
	},
});

export const restoreVisit = userMutation({
	args: { projectId: v.id("projects") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const project = await ctx.orgEntity("projects", args.projectId);
		if (
			!project.recurringSeriesId ||
			(project.recurringState !== "paused" &&
				project.recurringState !== "skipped" &&
				project.recurringState !== "ended")
		)
			throw new Error("This visit is not suspended");
		const series = await ctx.orgEntity(
			"projectSeries",
			project.recurringSeriesId
		);
		if (series.state !== "active" || (await hasStartedOrBilled(ctx, project)))
			throw new Error(
				"Only an unstarted, uninvoiced visit in an active series can be restored"
			);
		await ctx.db.patch(project._id, {
			status: "planned",
			recurringState: undefined,
			recurringSkipReason: undefined,
		});
		return null;
	},
});

const reusableUpdates = v.object({
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	clientId: v.optional(v.id("clients")),
	propertyId: v.optional(v.id("clientProperties")),
	assignedUserIds: v.optional(v.array(v.id("users"))),
});

export const updateFuture = userMutation({
	args: { projectId: v.id("projects"), updates: reusableUpdates },
	returns: v.object({ updated: v.number(), preserved: v.number() }),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const current = await ctx.orgEntity("projects", args.projectId);
		if (!current.recurringSeriesId)
			throw new Error("This project is not recurring");
		const series = await ctx.orgEntity(
			"projectSeries",
			current.recurringSeriesId
		);
		if (series.state === "ended")
			throw new Error("An ended series cannot be edited");
		const keys = Object.keys(args.updates) as (keyof typeof args.updates)[];
		if (!keys.length) throw new Error("No changes to save");
		if (args.updates.title !== undefined && !args.updates.title.trim())
			throw new Error("Project title cannot be empty");
		if (series.agreementQuoteId && keys.some((k) => k !== "assignedUserIds"))
			throw new Error(
				"Approve a revised recurring agreement before changing the shared service scope"
			);
		const clientId = args.updates.clientId ?? series.clientId;
		const propertyId = args.updates.propertyId ?? series.propertyId;
		if (
			(clientId !== series.clientId || propertyId !== series.propertyId) &&
			(await loadSeriesQuoteTemplates(ctx, series._id)).some((template) => template.active)
		) {
			throw new ConvexError("Stop saved quote copying before changing the series client or property, then save quote setup for the new scope.");
		}
		const client = await ctx.orgEntity("clients", clientId);
		if (client.status === "archived")
			throw new Error("Cannot move recurring work to an archived client");
		if (args.updates.clientId || args.updates.propertyId) {
			for (const [property, owner] of [
				[propertyId, clientId],
				[
					args.updates.propertyId ?? current.propertyId,
					args.updates.clientId ?? current.clientId,
				],
			] as const) {
				if (
					property &&
					(await ctx.orgEntity("clientProperties", property)).clientId !== owner
				)
					throw new Error("Property does not belong to the selected client");
			}
		}
		if ((args.updates.assignedUserIds?.length ?? 0) > 100)
			throw new Error(
				"A recurring project can have at most 100 assigned users"
			);
		for (const userId of args.updates.assignedUserIds ?? [])
			if (!(await getMembership(ctx, userId, ctx.orgId)))
				throw new Error("Assigned user does not belong to this organization");
		const visits = await upcoming(ctx, series);
		const revision = (series.revision ?? 0) + 1;
		let updated = 0,
			preserved = 0;
		for (const visit of [
			current,
			...visits.filter((p) => p._id !== current._id),
		]) {
			if (
				visit._id !== current._id &&
				((visit.recurringNominalDate ?? "") <
					(current.recurringNominalDate ?? "") ||
					(visit.status !== "planned" && visit.recurringState !== "paused") ||
					(visit.recurringState && visit.recurringState !== "paused") ||
					(await hasStartedOrBilled(ctx, visit)))
			) {
				preserved++;
				continue;
			}
			const updates: Partial<Doc<"projects">> = {};
			const overrides = visit.recurringFieldOverrides ?? [];
			let preservedVisit = false;
			for (const key of keys) {
				const siteOverride =
					(key === "clientId" || key === "propertyId") &&
					(overrides.includes("clientId") || overrides.includes("propertyId"));
				if (
					visit._id !== current._id &&
					(overrides.includes(key) || siteOverride)
				) {
					preservedVisit = true;
					continue;
				}
				Object.assign(updates, { [key]: args.updates[key] });
			}
			if (preservedVisit) preserved++;
			if (!Object.keys(updates).length) continue;
			await ctx.db.patch(visit._id, {
				...updates,
				recurringAppliedRevision: revision,
				recurringFieldOverrides:
					visit._id === current._id
						? overrides.filter(
								(k) => !keys.includes(k as keyof typeof args.updates)
							)
						: overrides,
			});
			await emitRecordUpdatedEvent(
				ctx,
				ctx.orgId,
				"project",
				visit._id,
				Object.keys(updates),
				"projectSeries.updateFuture"
			);
			updated++;
		}
		await ctx.db.patch(series._id, { ...args.updates, revision });
		return { updated, preserved };
	},
});

async function scheduleChanges(
	ctx: QueryCtx,
	series: Doc<"projectSeries">,
	rule: Doc<"projectSeries">["rule"]
) {
	const error = validateRecurrenceRule(rule, series.anchorDateKey);
	if (error) throw new Error(error);
	const today = dateKeyFromTimestamp(Date.now(), series.timezone);
	const dates = listRecurrenceDates({
		rule,
		anchor: series.anchorDateKey,
		from: today,
		through: addCalendarDays(today, WINDOW_DAYS),
		limit: 100,
		includeNext: true,
	});
	const selected = new Set(dates);
	const visits: Doc<"projects">[] = [];
	let preserved = 0;
	for (const visit of await upcoming(ctx, series)) {
		const restoring =
			visit.recurringSkipReason === "schedule-change" &&
			selected.has(visit.recurringNominalDate ?? "");
		const removing =
			visit.status === "planned" &&
			!visit.recurringState &&
			!selected.has(visit.recurringNominalDate ?? "");
		if (!restoring && !removing) continue;
		const quote = await ctx.db
			.query("quotes")
			.withIndex("by_project", (q) => q.eq("projectId", visit._id))
			.first();
		if (
			visit._id === series.originatingProjectId ||
			visit.recurringFieldOverrides?.length ||
			quote ||
			(await hasStartedOrBilled(ctx, visit))
		) {
			preserved++;
			continue;
		}
		visits.push(visit);
	}
	return { visits, preserved, dates };
}

export const previewScheduleChange = userQuery({
	args: {
		seriesId: v.id("projectSeries"),
		rule: projectRecurrenceRuleValidator,
	},
	returns: v.object({ ...affectedPreview, dates: v.array(v.string()) }),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const result = await scheduleChanges(ctx, series, args.rule);
		return {
			...summary(result.visits, result.preserved, series),
			dates: result.dates,
		};
	},
});

export const updateSchedule = userMutation({
	args: {
		seriesId: v.id("projectSeries"),
		rule: projectRecurrenceRuleValidator,
		expectedVersion: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireSeriesAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		checkRevision(series, args.expectedVersion);
		if (series.state !== "active")
			throw new Error("Resume this series before changing its schedule");
		if (series.agreementQuoteId)
			throw new Error(
				"Approve a revised recurring agreement before changing the schedule"
			);
		const result = await scheduleChanges(ctx, series, args.rule);
		const selected = new Set(result.dates);
		const revision = (series.revision ?? 0) + 1;
		for (const visit of result.visits) {
			const restore = selected.has(visit.recurringNominalDate ?? "");
			await ctx.db.patch(visit._id, {
				status: restore ? "planned" : "cancelled",
				recurringState: restore ? undefined : "skipped",
				recurringSkipReason: restore ? undefined : "schedule-change",
				recurringAppliedRevision: revision,
			});
		}
		await ctx.db.patch(series._id, {
			rule: args.rule,
			revision,
			nextGenerationAt: Date.now(),
		});
		await ctx.scheduler.runAfter(0, internal.projectSeries.generate, {
			orgId: ctx.orgId,
			seriesId: series._id,
		});
		return null;
	},
});
