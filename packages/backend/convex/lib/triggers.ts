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
