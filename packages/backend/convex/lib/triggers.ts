import {
	mutation as rawMutation,
	internalMutation as rawInternalMutation,
} from "../_generated/server";
import type { DataModel } from "../_generated/dataModel";
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
	invoiceCountsAggregate,
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
triggers.register("invoices", invoiceCountsAggregate.idempotentTrigger());

/**
 * search.ts reads these tables through their `search_text` search index, so the
 * digest has to be maintained on every write path — same reasoning as the
 * aggregates above.
 *
 * Unlike the line-item totals sync this is cascade-safe: each handler is a
 * guarded no-op-skip patch (recompute, compare, return when unchanged) that
 * reads nothing but the row itself, and deletes are free, so cascade deletes
 * stay O(n). The `!==` guard is also the recursion terminator — the
 * maintainer's own patch re-fires the trigger, which finds stored === computed
 * and stops.
 */
triggers.register("clients", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = clientSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
});

triggers.register("clientContacts", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = contactSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
});

triggers.register("clientProperties", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = propertySearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
});

triggers.register("projects", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = projectSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
});

triggers.register("quotes", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = quoteSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
});

triggers.register("invoices", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = invoiceSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
});

triggers.register("tasks", async (ctx, change) => {
	if (!change.newDoc) return;
	const searchText = taskSearchText(change.newDoc);
	if (change.newDoc.searchText === searchText) return;
	await ctx.db.patch(change.id, { searchText });
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
