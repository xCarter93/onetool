import type { Doc, Id } from "./_generated/dataModel";
import { optionalUserQuery } from "./lib/factories";
import { sumMoney } from "./lib/money";
import { getOrgTimezoneById } from "./lib/organization";
import {
	collectedAmount,
	monthKey,
	remainingBalanceLookup,
	settledPayments,
} from "./lib/paymentInsights";

/**
 * Business health — the mobile Money hub's single read.
 *
 * Replaces invoices.getStats, which summed invoice.total for sent/overdue rows
 * and so ignored partial payments. Everything money here is DOLLARS
 * (lib/money.ts), and "settled" means a payment row with status "paid" only —
 * refunded rows are deliberately excluded from collected totals and restore the
 * invoice's remaining balance.
 */

const MONTH_BUCKETS = 6;
const NEEDS_ATTENTION_LIMIT = 5;
const RECENT_PAYMENTS_LIMIT = 5;

export interface BusinessHealthPayload {
	outstanding: { total: number; overdue: number; invoiceCount: number };
	awaiting: { count: number; total: number };
	collectedThisMonth: number;
	months: { label: string; value: number }[];
	needsAttention: Array<{
		kind: "invoice" | "quote";
		id: string;
		clientName: string;
		label: string;
		amount: number;
		dueDate?: number;
		sentAt?: number;
	}>;
	recentPayments: Array<{
		id: string;
		invoiceId: string;
		clientName: string;
		amount: number;
		paidAt: number;
		method?: string;
	}>;
}

function emptyPayload(): BusinessHealthPayload {
	return {
		outstanding: { total: 0, overdue: 0, invoiceCount: 0 },
		awaiting: { count: 0, total: 0 },
		collectedThisMonth: 0,
		months: [],
		needsAttention: [],
		recentPayments: [],
	};
}

/** Oldest→newest month keys ending at `endKey`. Integer math — setMonth() skips months on the 31st. */
function monthKeySeries(endKey: string, count: number): string[] {
	let year = Number(endKey.slice(0, 4));
	let month = Number(endKey.slice(5, 7));
	const keys: string[] = [];
	for (let i = 0; i < count; i++) {
		keys.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
		month -= 1;
		if (month === 0) {
			month = 12;
			year -= 1;
		}
	}
	return keys.reverse();
}

function monthLabel(key: string): string {
	const year = Number(key.slice(0, 4));
	const month = Number(key.slice(5, 7));
	// Mid-month UTC so the label can't spill into a neighbouring month.
	return new Date(Date.UTC(year, month - 1, 15))
		.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
		.toUpperCase();
}

function paymentMethod(payment: Doc<"payments">): string | undefined {
	if (payment.manualMethod) return payment.manualMethod;
	if (!payment.recordedOutsidePortal) return "card";
	return undefined;
}

export const get = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<BusinessHealthPayload> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyPayload();
		await ctx.requireLevel("invoices", "view");

		const timezone = await getOrgTimezoneById(ctx, orgId);
		const now = Date.now();

		// One org-wide read per table; no per-row queries below.
		const allInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const allPayments = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const clients = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const clientNames = new Map<Id<"clients">, string>(
			clients.map((c) => [c._id, c.companyName])
		);
		const nameFor = (clientId: Id<"clients">) =>
			clientNames.get(clientId) ?? "Client";

		const invoices = await ctx.applyReadScope(
			"invoices",
			allInvoices,
			(invoice, scope) =>
				invoice.projectId
					? scope.projectIds.has(invoice.projectId)
					: scope.clientIds.has(invoice.clientId)
		);
		const invoiceById = new Map(invoices.map((i) => [i._id, i]));

		// A payment is visible iff its parent invoice survived read scoping.
		const payments = allPayments.filter((p) => invoiceById.has(p.invoiceId));

		const remainingFor = remainingBalanceLookup(payments);

		// ── Outstanding ──────────────────────────────────────────────────
		const outstandingTotals: number[] = [];
		const overdueTotals: number[] = [];
		let invoiceCount = 0;
		const overdueInvoices: Doc<"invoices">[] = [];

		for (const invoice of invoices) {
			const remaining = remainingFor(invoice);
			// Legacy shape: a paid invoice still carrying a balance. Refunds now
			// demote the invoice to sent, but rows refunded before that leave this
			// behind, and per the header contract the balance is outstanding.
			const isRefundRestored = invoice.status === "paid" && remaining > 0;
			const isEffectiveOverdue =
				invoice.status === "overdue" ||
				((invoice.status === "sent" || isRefundRestored) &&
					invoice.dueDate < now);
			if (
				invoice.status !== "sent" &&
				!isRefundRestored &&
				!isEffectiveOverdue
			)
				continue;
			if (remaining <= 0) continue;

			outstandingTotals.push(remaining);
			invoiceCount++;
			if (isEffectiveOverdue) {
				overdueTotals.push(remaining);
				overdueInvoices.push(invoice);
			}
		}

		// ── Quotes (soft-gated: no quotes:view → no quote data, no throw) ──
		const canViewQuotes = await ctx.can("quotes", "view");
		let sentQuotes: Doc<"quotes">[] = [];
		if (canViewQuotes) {
			const allQuotes = await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
			const scopedQuotes = await ctx.applyReadScope(
				"quotes",
				allQuotes,
				(quote, scope) =>
					quote.projectId
						? scope.projectIds.has(quote.projectId)
						: scope.clientIds.has(quote.clientId)
			);
			sentQuotes = scopedQuotes.filter((q) => q.status === "sent");
		}

		// ── Settled money over time ──────────────────────────────────────
		const settled = settledPayments(payments);
		const currentMonthKey = monthKey(now, timezone);
		const monthKeys = monthKeySeries(currentMonthKey, MONTH_BUCKETS);
		const monthAmounts = new Map<string, number[]>(
			monthKeys.map((key) => [key, [] as number[]])
		);
		const collectedThisMonth: number[] = [];

		for (const payment of settled) {
			const key = monthKey(payment.paidAt, timezone);
			const amount = collectedAmount(payment);
			if (key === currentMonthKey) collectedThisMonth.push(amount);
			const bucket = monthAmounts.get(key);
			if (bucket) bucket.push(amount);
		}

		const months = monthKeys.map((key) => ({
			label: monthLabel(key),
			value: sumMoney(monthAmounts.get(key) ?? []),
		}));

		// ── Needs attention: overdue invoices first, then aging sent quotes ──
		const needsAttention: BusinessHealthPayload["needsAttention"] = [];
		for (const invoice of [...overdueInvoices].sort(
			(a, b) => a.dueDate - b.dueDate
		)) {
			needsAttention.push({
				kind: "invoice",
				id: invoice._id,
				clientName: nameFor(invoice.clientId),
				label: `Invoice #${invoice.invoiceNumber}`,
				amount: remainingFor(invoice),
				dueDate: invoice.dueDate,
			});
		}
		const quotesByAge = [...sentQuotes].sort(
			(a, b) => (a.sentAt ?? a._creationTime) - (b.sentAt ?? b._creationTime)
		);
		for (const quote of quotesByAge) {
			if (needsAttention.length >= NEEDS_ATTENTION_LIMIT) break;
			const number = quote.quoteNumber ?? "—";
			needsAttention.push({
				kind: "quote",
				id: quote._id,
				clientName: nameFor(quote.clientId),
				label: quote.title
					? `Quote #${number} — ${quote.title}`
					: `Quote #${number}`,
				amount: quote.total,
				sentAt: quote.sentAt ?? quote._creationTime,
			});
		}

		// ── Recent payments ──────────────────────────────────────────────
		const recentPayments = [...settled]
			.sort((a, b) => b.paidAt - a.paidAt)
			.slice(0, RECENT_PAYMENTS_LIMIT)
			.map((payment) => {
				const invoice = invoiceById.get(payment.invoiceId);
				return {
					id: payment._id as string,
					invoiceId: payment.invoiceId as string,
					clientName: invoice ? nameFor(invoice.clientId) : "Client",
					amount: payment.paymentAmount,
					paidAt: payment.paidAt,
					method: paymentMethod(payment),
				};
			});

		return {
			outstanding: {
				total: sumMoney(outstandingTotals),
				overdue: sumMoney(overdueTotals),
				invoiceCount,
			},
			awaiting: {
				count: sentQuotes.length,
				total: sumMoney(sentQuotes.map((q) => q.total)),
			},
			collectedThisMonth: sumMoney(collectedThisMonth),
			months,
			needsAttention: needsAttention.slice(0, NEEDS_ATTENTION_LIMIT),
			recentPayments,
		};
	},
});
