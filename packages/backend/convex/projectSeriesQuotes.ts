import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import {
	applyQuoteTemplate,
	assertGeneratedQuoteCapacity,
	loadSeriesQuoteTemplates,
	MAX_QUOTE_TEMPLATES,
	planQuoteCopy,
	snapshotQuoteVersion,
} from "./lib/projectSeriesQuotes";

const countsValidator = v.object({
	revision: v.number(),
	createCount: v.number(),
	updateCount: v.number(),
	preservedCount: v.number(),
});

async function requireAccess(ctx: UserQueryCtx, level: "view" | "modify") {
	await ctx.requireLevel("projects", level);
	await ctx.requireLevel("quotes", level);
	if (
		!(await ctx.hasAllRecords("projects")) ||
		!(await ctx.hasAllRecords("quotes"))
	)
		throw new ConvexError(
			"Organization-wide project and quote access is required",
		);
}

async function sourceContext(ctx: UserQueryCtx, quoteId: Id<"quotes">) {
	const quote = await ctx.orgEntity("quotes", quoteId);
	if (!quote.projectId)
		throw new ConvexError("Only project quotes can be copied");
	const project = await ctx.orgEntity("projects", quote.projectId);
	if (project.clientId !== quote.clientId)
		throw new ConvexError("Quote client does not match its project");
	if (!project.recurringSeriesId || !project.recurringNominalDate)
		throw new ConvexError("Quote does not belong to a recurring project");
	const series = await ctx.orgEntity(
		"projectSeries",
		project.recurringSeriesId,
	);
	if (
		project.clientId !== series.clientId ||
		project.propertyId !== series.propertyId
	)
		throw new ConvexError(
			"Quote source must use the recurring series client and property",
		);
	if (series.agreementQuoteId)
		throw new ConvexError(
			"Recurring agreement quotes require the agreement revision flow",
		);
	if (series.state !== "active")
		throw new ConvexError("Only active series can copy quote setup");
	const provenance = quote.projectSeriesQuoteTemplateId
		? await ctx.orgEntity(
				"projectSeriesQuoteTemplates",
				quote.projectSeriesQuoteTemplateId,
			)
		: null;
	if (provenance && provenance.seriesId !== series._id)
		throw new ConvexError("Copied quote provenance does not match this series");
	const template =
		provenance ??
		(await ctx.db
			.query("projectSeriesQuoteTemplates")
			.withIndex("by_series_source", (q) =>
				q.eq("seriesId", series._id).eq("sourceQuoteId", quote._id),
			)
			.unique());
	const templates = await loadSeriesQuoteTemplates(ctx, series._id);
	if (!template && templates.length >= MAX_QUOTE_TEMPLATES)
		throw new ConvexError(
			`A series can save at most ${MAX_QUOTE_TEMPLATES} quote templates`,
		);
	const snapshot = await snapshotQuoteVersion(ctx, quote);
	await assertGeneratedQuoteCapacity(
		ctx,
		templates,
		template?._id,
		snapshot.lineItems.length,
	);
	return { quote, project, series, template, snapshot };
}

export const getSetup = userQuery({
	args: { projectId: v.id("projects") },
	returns: v.union(
		v.null(),
		v.object({
			seriesId: v.id("projectSeries"),
			state: v.union(
				v.literal("active"),
				v.literal("paused"),
				v.literal("ended"),
			),
			revision: v.number(),
			canCopy: v.boolean(),
			canStop: v.boolean(),
			templates: v.array(
				v.object({
					_id: v.id("projectSeriesQuoteTemplates"),
					sourceQuoteId: v.id("quotes"),
					title: v.optional(v.string()),
					active: v.boolean(),
					sourceAvailable: v.boolean(),
					version: v.number(),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		await requireAccess(ctx, "view");
		const project = await ctx.orgEntity("projects", args.projectId);
		if (!project.recurringSeriesId) return null;
		const series = await ctx.orgEntity(
			"projectSeries",
			project.recurringSeriesId,
		);
		const templates = [];
		for (const row of await loadSeriesQuoteTemplates(ctx, series._id)) {
			const source = await ctx.db.get(row.sourceQuoteId);
			templates.push({
				_id: row._id,
				sourceQuoteId: row.sourceQuoteId,
				title: row.title,
				active: row.active,
				sourceAvailable: Boolean(source && source.orgId === ctx.orgId),
				version: row.version,
			});
		}
		const [projectModify, quoteModify, allProjects, allQuotes] =
			await Promise.all([
				ctx.can("projects", "modify"),
				ctx.can("quotes", "modify"),
				ctx.hasAllRecords("projects"),
				ctx.hasAllRecords("quotes"),
			]);
		const canManage = projectModify && quoteModify && allProjects && allQuotes;
		return {
			seriesId: series._id,
			state: series.state,
			revision: series.revision ?? 0,
			canCopy:
				series.state === "active" && !series.agreementQuoteId && canManage,
			canStop: canManage,
			templates,
		};
	},
});

export const previewCopy = userQuery({
	args: { quoteId: v.id("quotes") },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify");
		const { project, series, template, snapshot } = await sourceContext(
			ctx,
			args.quoteId,
		);
		const { counts } = await planQuoteCopy(
			ctx,
			template,
			series,
			project,
			snapshot,
		);
		return { revision: series.revision ?? 0, ...counts };
	},
});

export const copy = userMutation({
	args: { quoteId: v.id("quotes"), expectedRevision: v.number() },
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify");
		const {
			quote,
			project,
			series,
			template: existing,
			snapshot,
		} = await sourceContext(ctx, args.quoteId);
		if ((series.revision ?? 0) !== args.expectedRevision)
			throw new ConvexError("Preview is stale; review the changes again");
		const plan = await planQuoteCopy(ctx, existing, series, project, snapshot);
		const versionNumber = existing ? existing.version + 1 : 1;
		const versionId = await ctx.db.insert("projectSeriesQuoteVersions", {
			orgId: ctx.orgId,
			seriesId: series._id,
			sourceQuoteId: existing?.sourceQuoteId ?? quote._id,
			capturedFromQuoteId: quote._id,
			clientId: project.clientId,
			propertyId: project.propertyId,
			createdByUserId: ctx.user._id,
			version: versionNumber,
			...snapshot,
		});
		const templateFields = {
			sourceNominalDate: project.recurringNominalDate!,
			versionId,
			version: versionNumber,
			title: quote.title,
			active: true,
		};
		let templateId: Id<"projectSeriesQuoteTemplates">;
		if (existing) {
			templateId = existing._id;
			await ctx.db.patch(templateId, templateFields);
		} else {
			templateId = await ctx.db.insert("projectSeriesQuoteTemplates", {
				orgId: ctx.orgId,
				seriesId: series._id,
				sourceQuoteId: quote._id,
				...templateFields,
			});
		}
		const [template, version] = await Promise.all([
			ctx.db.get(templateId),
			ctx.db.get(versionId),
		]);
		if (!template || !version)
			throw new ConvexError("Recurring quote version is missing");
		const counts = await applyQuoteTemplate(
			ctx,
			template,
			version,
			series,
			plan,
			ctx.user._id,
		);
		const revision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, { revision });
		return { revision, ...counts };
	},
});

export const stop = userMutation({
	args: {
		templateId: v.id("projectSeriesQuoteTemplates"),
		expectedRevision: v.number(),
	},
	returns: countsValidator,
	handler: async (ctx, args) => {
		await requireAccess(ctx, "modify");
		const template = await ctx.orgEntity(
			"projectSeriesQuoteTemplates",
			args.templateId,
		);
		const series = await ctx.orgEntity("projectSeries", template.seriesId);
		if ((series.revision ?? 0) !== args.expectedRevision)
			throw new ConvexError("Preview is stale; review the changes again");
		if (template.active) await ctx.db.patch(template._id, { active: false });
		const revision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, { revision });
		return { revision, createCount: 0, updateCount: 0, preservedCount: 0 };
	},
});
