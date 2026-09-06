import {
	mutation as rawMutation,
	internalMutation as rawInternalMutation,
} from "../_generated/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import {
	customCtx,
	customMutation,
} from "convex-helpers/server/customFunctions";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
} from "../aggregates";
import {
	clientSearchText,
	contactSearchText,
	propertySearchText,
	projectSearchText,
	quoteSearchText,
	invoiceSearchText,
	taskSearchText,
} from "./searchText";

/**
 * Every mutation builder in the backend routes ctx.db through this registry
 * (lib/factories.ts builders and the wrapped mutation/internalMutation below),
 * so aggregate maintenance fires on every write path — no per-call-site
 * helper invocations to forget.
 *
 * idempotentTrigger (not trigger) mirrors the old DELETE_MISSING_KEY
 * fallbacks: rows that predate aggregate tracking must not crash writes.
 *
 * Deliberately NOT registered: quoteLineItems/invoiceLineItems totals sync.
 * Line-item mutations call syncQuoteTotals/syncInvoiceTotals once per bulk
 * boundary; a per-row trigger would re-collect all siblings per row and
 * patch parents during cascade deletes (line items drain before parents in
 * orgCascade), turning O(n) cascades into O(n²).
 */
export const triggers = new Triggers<DataModel>();

triggers.register("clients", clientCountsAggregate.idempotentTrigger());
triggers.register("projects", projectCountsAggregate.idempotentTrigger());
triggers.register("quotes", quoteCountsAggregate.idempotentTrigger());
triggers.register("invoices", invoiceRevenueAggregate.idempotentTrigger());

/**
 * search.ts reads these tables through their `search_text` search index, so the
 * digest has to be maintained on every write path — same reasoning as the
 * aggregates above.
 *
 * Unlike the line-item totals sync this is cascade-safe: each handler is a
 * guarded no-op-skip patch (recompute, compare, return when unchanged) that
 * reads nothing but the row itself, and deletes are free, so cascade deletes
 * stay O(n). ctx.innerDb (not ctx.db) writes the digest below the trigger
 * registry, so the maintainer's own patch never re-enters the trigger chain.
 */
triggers.register("clients", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = clientSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("clientContacts", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = contactSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("clientProperties", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = propertySearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("projects", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = projectSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("projects", async (ctx, change) => {
	const previous = change.oldDoc;
	if (!previous?.recurringSeriesId || !previous.recurringNominalDate) return;
	if (change.newDoc && change.newDoc.recurringAppliedRevision !== previous.recurringAppliedRevision) return;
	const series = await ctx.innerDb.get(previous.recurringSeriesId);
	if (series) await ctx.innerDb.patch(series._id, { revision: (series.revision ?? 0) + 1 });
	if (!change.newDoc) {
		const occurrence = await ctx.innerDb
			.query("projectOccurrences")
			.withIndex("by_series_date", (q) =>
				q
					.eq("seriesId", previous.recurringSeriesId!)
					.eq("nominalDate", previous.recurringNominalDate!)
			)
			.unique();
		if (occurrence) {
			await ctx.innerDb.patch(occurrence._id, {
				state: "deleted",
				projectId: undefined,
			});
		}
		return;
	}
	const reusableFields = [
		"title",
		"description",
		"clientId",
		"propertyId",
		"assignedUserIds",
		"startDate",
		"endDate",
	] as const;
	const changed = reusableFields.filter(
		(field) =>
			JSON.stringify(previous[field]) !== JSON.stringify(change.newDoc![field])
	);
	if (!changed.length) return;
	await ctx.innerDb.patch(change.id, {
		recurringFieldOverrides: [
			...new Set([
				...(change.newDoc.recurringFieldOverrides ?? []),
				...changed,
			]),
		],
	});
});

triggers.register("quotes", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = quoteSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("quotes", async (ctx, change) => {
	const previous = change.oldDoc;
	const current = change.newDoc;
	const provenanceId = previous?.projectSeriesQuoteTemplateId ?? current?.projectSeriesQuoteTemplateId;
	if (previous && provenanceId) {
		const ledger = await ctx.innerDb.query("projectSeriesQuoteCopies")
			.withIndex("by_quote", (q) => q.eq("quoteId", previous._id)).unique();
		if (ledger?.state === "materialized") {
			if (!current) {
				await ctx.innerDb.patch(ledger._id, { state: "removed-by-user", quoteId: undefined, protected: true });
			} else if (
				current.status !== "draft" || current.projectId !== previous.projectId || current.clientId !== previous.clientId ||
				current.projectSeriesQuoteTemplateId !== previous.projectSeriesQuoteTemplateId ||
				current.recurringQuoteOverride === true
			) {
				await ctx.innerDb.patch(ledger._id, { protected: true });
			}
		}
	}

	const quoteId = previous?._id ?? current?._id;
	if (!quoteId) return;
	const appliedByCopy = Boolean(
		current?.recurringQuoteAppliedVersion !== undefined &&
		(!previous || current.recurringQuoteAppliedVersion !== previous.recurringQuoteAppliedVersion)
	);
	if (appliedByCopy) return;
	const templates = await ctx.innerDb.query("projectSeriesQuoteTemplates")
		.withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", quoteId)).take(21);
	if (templates.length > 20) throw new Error("Recurring quote template limit exceeded");
	const seriesIds = new Set(templates.map((template) => template.seriesId));
	if (provenanceId) {
		const template = await ctx.innerDb.get(provenanceId);
		if (template) seriesIds.add(template.seriesId);
	}
	for (const projectId of new Set([previous?.projectId, current?.projectId])) {
		if (!projectId) continue;
		const project = await ctx.innerDb.get(projectId);
		if (project?.recurringSeriesId) seriesIds.add(project.recurringSeriesId);
	}
	for (const seriesId of seriesIds) {
		const series = await ctx.innerDb.get(seriesId);
		if (series) await ctx.innerDb.patch(seriesId, { revision: (series.revision ?? 0) + 1 });
	}
});

triggers.register("invoices", async (ctx, change) => {
	const seriesIds = new Set<Id<"projectSeries">>();
	for (const quoteId of new Set([change.oldDoc?.quoteId, change.newDoc?.quoteId])) {
		if (!quoteId) continue;
		const ledger = await ctx.innerDb.query("projectSeriesQuoteCopies")
			.withIndex("by_quote", (q) => q.eq("quoteId", quoteId)).unique();
		if (ledger) {
			seriesIds.add(ledger.seriesId);
			if (!ledger.protected) await ctx.innerDb.patch(ledger._id, { protected: true });
		}
	}
	for (const projectId of new Set([change.oldDoc?.projectId, change.newDoc?.projectId])) {
		if (!projectId) continue;
		const project = await ctx.innerDb.get(projectId);
		if (project?.recurringSeriesId) seriesIds.add(project.recurringSeriesId);
	}
	for (const seriesId of seriesIds) {
		const series = await ctx.innerDb.get(seriesId);
		if (series) await ctx.innerDb.patch(seriesId, { revision: (series.revision ?? 0) + 1 });
	}
});

triggers.register("invoices", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = invoiceSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("tasks", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = taskSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.innerDb.patch(change.id, { searchText });
});

triggers.register("tasks", async (ctx, change) => {
	const previous = change.oldDoc;
	const current = change.newDoc;
	const provenanceId = previous?.projectTaskTemplateId ?? current?.projectTaskTemplateId;
	if (provenanceId && previous) {
		const ledger = await ctx.innerDb.query("projectTaskCopies")
			.withIndex("by_task", (q) => q.eq("taskId", previous._id)).unique();
		if (ledger?.state === "materialized") {
			if (!current) {
				await ctx.innerDb.patch(ledger._id, {
					state: "removed-by-user",
					taskId: undefined,
					protected: true,
				});
			} else if (
				current.recurringTaskAppliedRevision === previous.recurringTaskAppliedRevision
			) {
				await ctx.innerDb.patch(ledger._id, { protected: true });
			}
		}
	}

	const sourceId = previous?._id ?? current?._id;
	if (!sourceId) return;
	const templates = await ctx.innerDb.query("projectTaskTemplates")
		.withIndex("by_source_task", (q) => q.eq("sourceTaskId", sourceId)).take(51);
	if (templates.length > 50) throw new Error("Recurring task template limit exceeded");
	const seriesIds = new Set(templates.map((template) => template.seriesId));
	if (!previous || !current || current.recurringTaskAppliedRevision === previous.recurringTaskAppliedRevision) {
		for (const projectId of new Set([previous?.projectId, current?.projectId])) {
			if (!projectId) continue;
			const project = await ctx.innerDb.get(projectId);
			if (project?.recurringSeriesId) seriesIds.add(project.recurringSeriesId);
		}
	}
	for (const seriesId of seriesIds) {
		const series = await ctx.innerDb.get(seriesId);
		if (series) await ctx.innerDb.patch(seriesId, { revision: (series.revision ?? 0) + 1 });
	}
});

/**
 * Drop-in replacements for the _generated/server builders. All mutations —
 * including public portal ones and internal webhook/automation ones — must
 * use these (or a lib/factories.ts builder); importing mutation or
 * internalMutation from _generated/server is blocked by
 * builderEnforcement.test.ts.
 */
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
	rawInternalMutation,
	customCtx(triggers.wrapDB)
);
