import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { internalMutation } from "./lib/triggers";
import { getMembership } from "./lib/memberships";
import { emitRecordCreatedEvent } from "./eventBus";
import {
	addCalendarDays,
	calendarDayDifference,
	dateKeyFromTimestamp,
	listRecurrenceDates,
	projectRecurrenceRuleValidator,
	validateRecurrenceRule,
} from "./lib/projectRecurrence";

const WINDOW_DAYS = 90;
const GENERATION_BATCH = 25;
const SWEEP_BATCH = 50;
const HOUR = 60 * 60 * 1000;
const generationResult = v.object({
	created: v.number(),
	remaining: v.number(),
});

function storedDateKey(timestamp: number): string {
	if (!Number.isFinite(timestamp)) throw new Error("Invalid project date");
	return new Date(timestamp).toISOString().slice(0, 10);
}

function storedDate(date: string): number {
	return Date.parse(`${date}T00:00:00.000Z`);
}

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

function ruleFingerprint(value: unknown): string {
	return JSON.stringify(value, (_key, entry) => {
		if (entry && typeof entry === "object" && !Array.isArray(entry)) {
			return Object.fromEntries(
				Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))
			);
		}
		return entry;
	});
}

async function generateOccurrences(
	ctx: MutationCtx,
	series: Doc<"projectSeries">
): Promise<{ created: number; remaining: number }> {
	const empty = { created: 0, remaining: 0 };
	if (series.state !== "active") return empty;
	const org = await ctx.db.get(series.orgId);
	if (!org) return empty;
	const client = await ctx.db.get(series.clientId);
	const property = series.propertyId
		? await ctx.db.get(series.propertyId)
		: null;
	if (
		!client ||
		client.orgId !== series.orgId ||
		(series.propertyId &&
			(!property ||
				property.orgId !== series.orgId ||
				property.clientId !== client._id))
	) {
		await ctx.db.patch(series._id, {
			state: "ended",
			nextGenerationAt: undefined,
		});
		return empty;
	}
	if (client.status === "archived") {
		await ctx.db.patch(series._id, { nextGenerationAt: Date.now() + 6 * HOUR });
		return empty;
	}

	const today = dateKeyFromTimestamp(Date.now(), series.timezone);
	const afterOrigin = addCalendarDays(series.anchorDateKey, 1);
	const from = today > afterOrigin ? today : afterOrigin;
	const horizon = addCalendarDays(today, WINDOW_DAYS);
	const dates = listRecurrenceDates({
		rule: series.rule,
		anchor: series.anchorDateKey,
		from,
		through: from > horizon ? from : horizon,
		limit: 100,
		includeNext: true,
	});
	const missing: string[] = [];
	for (const nominalDate of dates) {
		const existing = await ctx.db
			.query("projectOccurrences")
			.withIndex("by_series_date", (q) =>
				q.eq("seriesId", series._id).eq("nominalDate", nominalDate)
			)
			.unique();
		if (!existing) missing.push(nominalDate);
	}
	const assignedUserIds: Id<"users">[] = [];
	for (const userId of series.assignedUserIds ?? []) {
		if (await getMembership(ctx, userId, series.orgId))
			assignedUserIds.push(userId);
	}
	for (const nominalDate of missing.slice(0, GENERATION_BATCH)) {
		const projectId = await ctx.db.insert("projects", {
			orgId: series.orgId,
			clientId: series.clientId,
			propertyId: series.propertyId,
			title: series.title,
			description: series.description,
			assignedUserIds: series.assignedUserIds ? assignedUserIds : undefined,
			createdByUserId: series.createdByUserId,
			projectType: "recurring",
			status: "planned",
			startDate: storedDate(nominalDate),
			endDate:
				series.durationDays === undefined
					? undefined
					: storedDate(addCalendarDays(nominalDate, series.durationDays)),
			recurringSeriesId: series._id,
			recurringNominalDate: nominalDate,
		});
		await ctx.db.insert("projectOccurrences", {
			orgId: series.orgId,
			seriesId: series._id,
			nominalDate,
			projectId,
			state: "materialized",
		});
		await emitRecordCreatedEvent(
			ctx,
			series.orgId,
			"project",
			projectId,
			"projectSeries.generate"
		);
	}
	const created = Math.min(missing.length, GENERATION_BATCH);
	const remaining = missing.length - created;
	await ctx.db.patch(series._id, {
		nextGenerationAt: dates.length
			? Date.now() + (remaining ? 0 : 6 * HOUR)
			: undefined,
	});
	if (remaining) {
		await ctx.scheduler.runAfter(0, internal.projectSeries.generate, {
			orgId: series.orgId,
			seriesId: series._id,
		});
	}
	return { created, remaining };
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
		if (project.recurringSeriesId) {
			const series = await ctx.orgEntity(
				"projectSeries",
				project.recurringSeriesId
			);
			if (
				series.originatingProjectId !== project._id ||
				ruleFingerprint(series.rule) !== ruleFingerprint(args.rule)
			) {
				throw new Error("Project already belongs to a recurring series");
			}
			return series._id;
		}
		if (project.startDate === undefined)
			throw new Error("Set a project start date before configuring recurrence");
		const anchorDateKey = storedDateKey(project.startDate);
		const ruleError = validateRecurrenceRule(args.rule, anchorDateKey);
		if (ruleError) throw new Error(ruleError);
		const durationDays =
			project.endDate === undefined
				? undefined
				: calendarDayDifference(anchorDateKey, storedDateKey(project.endDate));
		if (durationDays !== undefined && durationDays < 0)
			throw new Error("Start date cannot be after end date");
		const org = await ctx.db.get(ctx.orgId);
		if (!org) throw new Error("Organization not found");
		const timezone = org.timezone ?? "UTC";
		dateKeyFromTimestamp(Date.now(), timezone);
		const client = await ctx.orgEntity("clients", project.clientId);
		if (client.status === "archived")
			throw new Error("Cannot configure recurrence for an archived client");
		if (project.propertyId) {
			const property = await ctx.orgEntity(
				"clientProperties",
				project.propertyId
			);
			if (property.clientId !== client._id)
				throw new Error("Property does not belong to the project client");
		}
		if ((project.assignedUserIds?.length ?? 0) > 100)
			throw new Error(
				"A recurring project can have at most 100 assigned users"
			);
		for (const userId of project.assignedUserIds ?? []) {
			if (!(await getMembership(ctx, userId, ctx.orgId)))
				throw new Error("Assigned user no longer belongs to this organization");
		}
		const seriesId = await ctx.db.insert("projectSeries", {
			orgId: ctx.orgId,
			originatingProjectId: project._id,
			clientId: project.clientId,
			propertyId: project.propertyId,
			title: project.title,
			description: project.description,
			assignedUserIds: project.assignedUserIds,
			createdByUserId: ctx.user._id,
			anchorDateKey,
			durationDays,
			timezone,
			rule: args.rule,
			state: "active",
			nextGenerationAt: Date.now(),
		});
		await ctx.db.patch(project._id, {
			projectType: "recurring",
			recurringSeriesId: seriesId,
			recurringNominalDate: anchorDateKey,
		});
		await ctx.db.insert("projectOccurrences", {
			orgId: ctx.orgId,
			seriesId,
			nominalDate: anchorDateKey,
			projectId: project._id,
			state: "materialized",
		});
		const series = await ctx.db.get(seriesId);
		if (!series) throw new Error("Series not found");
		await generateOccurrences(ctx, series);
		return seriesId;
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
		return generateOccurrences(ctx, series);
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
