import { v } from "convex/values";
import { projectCountsAggregate } from "./aggregates";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { optionalUserQuery } from "./lib/factories";
import { roundCents, sumMoney } from "./lib/money";
import { requireOrgWideView } from "./lib/orgWideView";
import {
	collectedAmount,
	monthKey,
	settledPayments,
} from "./lib/paymentInsights";
import { DateUtils } from "./lib/shared";

/**
 * Admin dashboard money stats.
 *
 * Everything here is DOLLARS (lib/money.ts) and derives from PAYMENT rows, not
 * invoice totals — an invoice split into instalments is invoiced and collected
 * on the payment schedule, not all at once. Overdue is never read off the
 * status field.
 *
 * BILLABLE RULE: a payment counts only when its parent invoice is neither
 * "draft" (not yet billed) nor "cancelled" (voided), and the payment row
 * itself is not "cancelled". Both series apply it so invoiced and collected
 * stay comparable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_DAYS_WINDOW = 30;
const TOP_CLIENTS_DEFAULT_LIMIT = 5;
const TOP_CLIENTS_MAX_LIMIT = 50;

export type Bucket = { date: string; value: number };
export type SparseBucket = { date: string; value: number | null };

export interface CollectionPace {
	invoiced: Bucket[];
	collected: Bucket[];
	goal: number | null;
	totals: { invoiced: number; collected: number };
}

const granularityValidator = v.union(v.literal("day"), v.literal("month"));
type Granularity = "day" | "month";

// Caps keep the dense bucket-key loops bounded; the widest UI range is one
// year, so these leave headroom without allowing runaway allocation.
const MAX_DAY_SPAN_MS = 400 * DAY_MS;
const MAX_MONTH_SPAN_MS = 240 * 31 * DAY_MS;

function validateRange(
	startDate: number,
	endDate: number,
	granularity: "day" | "week" | "month"
): void {
	if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
		throw new Error("Invalid date range");
	}
	if (endDate < startDate) {
		throw new Error("Invalid date range");
	}
	const maxSpan = granularity === "month" ? MAX_MONTH_SPAN_MS : MAX_DAY_SPAN_MS;
	if (endDate - startDate > maxSpan) {
		throw new Error("Date range too large");
	}
}

function bucketKey(
	timestamp: number,
	granularity: Granularity,
	timezone?: string
): string {
	return granularity === "month"
		? monthKey(timestamp, timezone)
		: DateUtils.toLocalDateString(timestamp, timezone);
}

/** Dense oldest→newest bucket keys covering [start, end] in the org's timezone. */
function bucketKeysForRange(
	start: number,
	end: number,
	granularity: Granularity,
	timezone?: string
): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();
	const push = (key: string) => {
		if (seen.has(key)) return;
		seen.add(key);
		keys.push(key);
	};
	if (granularity === "month") {
		let year = Number(monthKey(start, timezone).slice(0, 4));
		let month = Number(monthKey(start, timezone).slice(5, 7));
		const endKey = monthKey(end, timezone);
		for (let i = 0; i < 240; i++) {
			const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
			push(key);
			if (key >= endKey) break;
			month += 1;
			if (month === 13) {
				month = 1;
				year += 1;
			}
		}
		return keys;
	}
	// Half-day steps so a DST shift can't skip a calendar day.
	for (let t = start; t <= end; t += DAY_MS / 2) {
		push(DateUtils.toLocalDateString(t, timezone));
	}
	push(DateUtils.toLocalDateString(end, timezone));
	return keys;
}

/** Apply the billable rule to an already-windowed set of payment rows. */
async function applyBillableRule(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	payments: Doc<"payments">[]
): Promise<{
	billable: Doc<"payments">[];
	invoiceById: Map<Id<"invoices">, Doc<"invoices">>;
}> {
	const candidates = payments.filter((p) => p.status !== "cancelled");
	const invoiceIds = [...new Set(candidates.map((p) => p.invoiceId))];
	const invoices = await Promise.all(invoiceIds.map((id) => ctx.db.get(id)));
	const invoiceById = new Map<Id<"invoices">, Doc<"invoices">>();
	for (const invoice of invoices) {
		if (!invoice || invoice.orgId !== orgId) continue;
		if (invoice.status === "draft" || invoice.status === "cancelled") continue;
		invoiceById.set(invoice._id, invoice);
	}
	return {
		billable: candidates.filter((p) => invoiceById.has(p.invoiceId)),
		invoiceById,
	};
}

/** Payments due inside [start, end]. */
async function billableByDueDate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	start: number,
	end: number
) {
	const payments = await ctx.db
		.query("payments")
		.withIndex("by_due_date", (q) =>
			q.eq("orgId", orgId).gte("dueDate", start).lte("dueDate", end)
		)
		.collect();
	return applyBillableRule(ctx, orgId, payments);
}

/** Payments settled inside [start, end). undefined paidAt sorts below the
 * lower bound, so unpaid rows never enter the range. */
async function billableByPaidAt(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	start: number,
	end: number,
	endInclusive = false
) {
	const payments = await ctx.db
		.query("payments")
		.withIndex("by_org_paid", (q) => {
			const lower = q.eq("orgId", orgId).gte("paidAt", start);
			return endInclusive ? lower.lte("paidAt", end) : lower.lt("paidAt", end);
		})
		.collect();
	return applyBillableRule(ctx, orgId, payments);
}

export const getCollectionPace = optionalUserQuery({
	args: {
		startDate: v.number(),
		endDate: v.number(),
		granularity: granularityValidator,
	},
	handler: async (ctx, args): Promise<CollectionPace> => {
		if (!ctx.orgId) {
			return {
				invoiced: [],
				collected: [],
				goal: null,
				totals: { invoiced: 0, collected: 0 },
			};
		}
		const orgId = ctx.orgId;
		await requireOrgWideView(ctx, "invoices");
		validateRange(args.startDate, args.endDate, args.granularity);

		const organization = await ctx.db.get(orgId);
		const timezone = organization?.timezone;

		const { billable } = await billableByDueDate(
			ctx,
			orgId,
			args.startDate,
			args.endDate
		);

		const keys = bucketKeysForRange(
			args.startDate,
			args.endDate,
			args.granularity,
			timezone
		);
		const invoicedAmounts = new Map<string, number[]>(keys.map((k) => [k, []]));
		const collectedAmounts = new Map<string, number[]>(keys.map((k) => [k, []]));

		const inRange = (t: number) => t >= args.startDate && t <= args.endDate;

		// Same cohort for both series: only payments DUE in the window count, so
		// collected can never exceed invoiced. Cash landing against older
		// receivables still shows in the revenue KPI, not here.
		for (const payment of billable) {
			// payments.dueDate is required in the schema, so no invoice fallback.
			if (inRange(payment.dueDate)) {
				invoicedAmounts
					.get(bucketKey(payment.dueDate, args.granularity, timezone))
					?.push(payment.paymentAmount);
			}
		}
		for (const payment of settledPayments(billable)) {
			if (!inRange(payment.dueDate)) continue;
			// Early or late payments clamp into the window so cohort totals reconcile.
			const paidAt = Math.min(
				Math.max(payment.paidAt, args.startDate),
				args.endDate
			);
			collectedAmounts
				.get(bucketKey(paidAt, args.granularity, timezone))
				?.push(collectedAmount(payment));
		}

		const series = (amounts: Map<string, number[]>): Bucket[] =>
			keys.map((date) => ({ date, value: sumMoney(amounts.get(date) ?? []) }));

		const invoiced = series(invoicedAmounts);
		const collected = series(collectedAmounts);

		return {
			invoiced,
			collected,
			// `??` not `||`: an explicit target of 0 is a real goal; only an unset
			// target is null. getHomeStats' 50000 default is deliberately not used.
			goal: organization?.monthlyRevenueTarget ?? null,
			totals: {
				invoiced: sumMoney(invoiced.map((b) => b.value)),
				collected: sumMoney(collected.map((b) => b.value)),
			},
		};
	},
});

export const getActiveJobCount = optionalUserQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{ inProgress: number; planned: number }> => {
		if (!ctx.orgId) return { inProgress: 0, planned: 0 };
		const orgId = ctx.orgId;
		await requireOrgWideView(ctx, "projects");
		// Aggregate key is [status, completedAt || 0]; open projects have no
		// completedAt, so the whole status band is the count.
		const countFor = (status: "in-progress" | "planned") =>
			projectCountsAggregate.count(ctx, {
				namespace: orgId,
				bounds: {
					lower: { key: [status, 0], inclusive: true },
					upper: { key: [status, Number.MAX_SAFE_INTEGER], inclusive: true },
				},
			});
		const [inProgress, planned] = await Promise.all([
			countFor("in-progress"),
			countFor("planned"),
		]);
		return { inProgress, planned };
	},
});

export const getAvgDaysToPay = optionalUserQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{ days: number | null; prevDays: number | null }> => {
		if (!ctx.orgId) return { days: null, prevDays: null };
		const orgId = ctx.orgId;
		await requireOrgWideView(ctx, "invoices");

		const now = Date.now();
		const windowStart = now - AVG_DAYS_WINDOW * DAY_MS;
		const prevStart = now - 2 * AVG_DAYS_WINDOW * DAY_MS;
		const { billable, invoiceById } = await billableByPaidAt(
			ctx,
			orgId,
			prevStart,
			now
		);

		let weight = 0;
		let weighted = 0;
		let prevWeight = 0;
		let prevWeighted = 0;

		for (const payment of settledPayments(billable)) {
			const invoice = invoiceById.get(payment.invoiceId);
			const amount = collectedAmount(payment);
			if (!invoice || amount <= 0) continue;
			const anchor = invoice.firstSentAt ?? invoice.issuedDate;
			// Field payments get recorded before the invoice is ever sent.
			const days = Math.max(0, (payment.paidAt - anchor) / DAY_MS);
			if (payment.paidAt >= windowStart && payment.paidAt < now) {
				weight += amount;
				weighted += amount * days;
			} else if (payment.paidAt >= prevStart && payment.paidAt < windowStart) {
				prevWeight += amount;
				prevWeighted += amount * days;
			}
		}

		const mean = (total: number, w: number) =>
			w > 0 ? Math.round((total / w) * 10) / 10 : null;

		return {
			days: mean(weighted, weight),
			prevDays: mean(prevWeighted, prevWeight),
		};
	},
});

export const getAvgJobValue = optionalUserQuery({
	args: {
		startDate: v.number(),
		endDate: v.number(),
		granularity: v.optional(granularityValidator),
	},
	handler: async (
		ctx,
		args
	): Promise<{ value: number | null; series: SparseBucket[] }> => {
		if (!ctx.orgId) return { value: null, series: [] };
		const orgId = ctx.orgId;
		await requireOrgWideView(ctx, "invoices");
		const granularity = args.granularity ?? "day";
		validateRange(args.startDate, args.endDate, granularity);

		const organization = await ctx.db.get(orgId);
		const timezone = organization?.timezone;

		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_status", (q) => q.eq("orgId", orgId).eq("status", "paid"))
			.collect();

		const keys = bucketKeysForRange(
			args.startDate,
			args.endDate,
			granularity,
			timezone
		);
		const totalsByKey = new Map<string, number[]>(keys.map((k) => [k, []]));
		const allTotals: number[] = [];

		for (const invoice of invoices) {
			const paidAt = invoice.paidAt;
			if (invoice.status !== "paid" || paidAt == null) continue;
			if (paidAt < args.startDate || paidAt > args.endDate) continue;
			allTotals.push(invoice.total);
			totalsByKey.get(bucketKey(paidAt, granularity, timezone))?.push(
				invoice.total
			);
		}

		// Running average through each bucket: a sparse per-bucket average draws
		// isolated dashes for low-volume orgs. Null until the first paid invoice.
		let runningSum = 0;
		let runningCount = 0;
		const series: SparseBucket[] = keys.map((date) => {
			for (const total of totalsByKey.get(date) ?? []) {
				runningSum += total;
				runningCount += 1;
			}
			return {
				date,
				value: runningCount ? roundCents(runningSum / runningCount) : null,
			};
		});

		return {
			value: allTotals.length
				? roundCents(sumMoney(allTotals) / allTotals.length)
				: null,
			series,
		};
	},
});

export interface TopClientRevenue {
	clientId: Id<"clients">;
	name: string;
	total: number;
	share: number;
}

/** Local Monday ("YYYY-MM-DD") of the timestamp's week, for stacked buckets. */
function weekStartKey(timestamp: number, timezone?: string): string {
	const local = DateUtils.toLocalDateString(timestamp, timezone);
	const day = new Date(`${local}T00:00:00Z`);
	day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
	return day.toISOString().slice(0, 10);
}

function stackKeysForRange(
	start: number,
	end: number,
	granularity: "day" | "week" | "month",
	timezone?: string
): string[] {
	if (granularity !== "week") {
		return bucketKeysForRange(start, end, granularity, timezone);
	}
	const keys: string[] = [];
	const endKey = weekStartKey(end, timezone);
	let cursor = new Date(`${weekStartKey(start, timezone)}T00:00:00Z`);
	for (let i = 0; i < 120; i++) {
		const key = cursor.toISOString().slice(0, 10);
		keys.push(key);
		if (key >= endKey) break;
		cursor = new Date(cursor.getTime() + 7 * DAY_MS);
	}
	return keys;
}

export const getTopClientsByRevenue = optionalUserQuery({
	args: {
		startDate: v.number(),
		endDate: v.number(),
		limit: v.optional(v.number()),
		// When set, also return per-bucket totals for a stacked chart.
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		clients: TopClientRevenue[];
		otherTotal: number;
		grandTotal: number;
		series: Array<{ date: string; totals: number[] }>;
	}> => {
		if (!ctx.orgId)
			return { clients: [], otherTotal: 0, grandTotal: 0, series: [] };
		const orgId = ctx.orgId;
		await requireOrgWideView(ctx, "invoices", "clients");
		validateRange(args.startDate, args.endDate, args.granularity ?? "day");

		const limit = Math.min(
			TOP_CLIENTS_MAX_LIMIT,
			Math.max(1, Math.trunc(args.limit ?? TOP_CLIENTS_DEFAULT_LIMIT))
		);

		const { billable, invoiceById } = await billableByPaidAt(
			ctx,
			orgId,
			args.startDate,
			args.endDate,
			true
		);

		const amountsByClient = new Map<Id<"clients">, number[]>();
		for (const payment of settledPayments(billable)) {
			if (payment.paidAt < args.startDate || payment.paidAt > args.endDate)
				continue;
			const invoice = invoiceById.get(payment.invoiceId);
			if (!invoice) continue;
			const list = amountsByClient.get(invoice.clientId) ?? [];
			list.push(collectedAmount(payment));
			amountsByClient.set(invoice.clientId, list);
		}

		const ranked = [...amountsByClient.entries()]
			.map(([clientId, amounts]) => ({
				clientId,
				total: sumMoney(amounts),
			}))
			.sort((a, b) => b.total - a.total);

		const grandTotal = sumMoney(ranked.map((r) => r.total));
		// Only the top slice is ever rendered.
		const topRanked = ranked.slice(0, limit);
		const topClients = await Promise.all(
			topRanked.map((row) => ctx.db.get(row.clientId))
		);
		const top = topRanked.map((row, i) => ({
			clientId: row.clientId,
			name: topClients[i]?.companyName ?? "Client",
			total: row.total,
		}));
		const otherTotal = roundCents(
			grandTotal - sumMoney(top.map((r) => r.total))
		);

		// Stacked series: one totals slot per top client, plus a trailing "other"
		// slot when anything fell outside the top list.
		let series: Array<{ date: string; totals: number[] }> = [];
		if (args.granularity && top.length > 0) {
			const organization = await ctx.db.get(orgId);
			const timezone = organization?.timezone;
			const slotByClient = new Map(top.map((row, i) => [row.clientId, i]));
			const slots = top.length + (otherTotal > 0 ? 1 : 0);
			const keys = stackKeysForRange(
				args.startDate,
				args.endDate,
				args.granularity,
				timezone
			);
			const amounts = new Map(
				keys.map((k) => [k, Array.from({ length: slots }, () => [] as number[])])
			);
			for (const payment of settledPayments(billable)) {
				if (payment.paidAt < args.startDate || payment.paidAt > args.endDate)
					continue;
				const invoice = invoiceById.get(payment.invoiceId);
				if (!invoice) continue;
				// No "other" slot exists when otherTotal is 0; skipping avoids piling
				// a zero-total outsider onto the last top client's stack.
				const topSlot = slotByClient.get(invoice.clientId);
				if (topSlot === undefined && otherTotal <= 0) continue;
				const slot = topSlot ?? slots - 1;
				const key =
					args.granularity === "week"
						? weekStartKey(payment.paidAt, timezone)
						: bucketKey(payment.paidAt, args.granularity, timezone);
				amounts.get(key)?.[slot]?.push(collectedAmount(payment));
			}
			series = keys.map((date) => ({
				date,
				totals: (amounts.get(date) ?? []).map((list) => sumMoney(list)),
			}));
		}

		return {
			clients: top.map((row) => ({
				...row,
				share: grandTotal > 0 ? row.total / grandTotal : 0,
			})),
			otherTotal,
			grandTotal,
			series,
		};
	},
});
