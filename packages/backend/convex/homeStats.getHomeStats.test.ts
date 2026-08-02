import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { getWeekRange } from "./lib/queries";

/**
 * Pin-down tests for api.homeStats.getHomeStats (homeStats.ts:120-341), taken
 * BEFORE the aggregate-backed rewrite. These capture exact current behavior,
 * including quirks — not what the function "should" do. If the rewrite is
 * behavior-preserving, every test here stays green unmodified.
 *
 * All records are created through the real public mutations (never raw
 * db.insert for tracked entities) so aggregates stay seeded and these tests
 * remain valid once getHomeStats reads from the aggregate btrees instead of
 * .collect() scans. `organizations` has no aggregate trigger, so patching it
 * via the real organizations.update mutation (not a raw patch) is still used
 * throughout for consistency, even though a raw patch would be safe there.
 *
 * Time travel: vi.setSystemTime moves the clock, a real mutation performs the
 * status transition (which stamps completedAt/approvedAt/paidAt from
 * Date.now()), then the clock is restored. Never back-date by patching fields.
 */

const DAY = 24 * 60 * 60 * 1000;

// Fixed, generously-spaced anchors so getMonthComparisonPeriods() (which
// operates on local calendar months) can't flake near a real month boundary.
const NOW = Date.UTC(2026, 2, 18, 15, 0, 0); // March 18, 2026
const LAST_MONTH = Date.UTC(2026, 1, 10, 15, 0, 0); // February 10, 2026
const TWO_MONTHS_AGO = Date.UTC(2026, 0, 10, 15, 0, 0); // January 10, 2026

describe("homeStats.getHomeStats", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ------------------------------------------------------------- seed utils

	async function seedOrg(suffix: string) {
		const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_hs_${suffix}`,
				clerkOrgId: `org_hs_${suffix}`,
			})
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { orgId, asUser };
	}

	async function createClient(
		asUser: ReturnType<typeof t.withIdentity>,
		companyName: string
	): Promise<Id<"clients">> {
		return await asUser.mutation(api.clients.create, {
			companyName,
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});
	}

	/** Project completed at `completedAt` via the real create(planned)+update(completed) transition. */
	async function createCompletedProject(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		completedAt: number,
		title: string
	): Promise<Id<"projects">> {
		const restoreTo = Date.now();
		vi.setSystemTime(completedAt);
		const projectId = await asUser.mutation(api.projects.create, {
			clientId,
			title,
			status: "planned",
			projectType: "one-off",
		});
		await asUser.mutation(api.projects.update, {
			id: projectId,
			status: "completed",
		});
		vi.setSystemTime(restoreTo);
		return projectId;
	}

	/** Quote approved at `approvedAt` via the real create(sent)+update(approved) transition. */
	async function createApprovedQuote(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		approvedAt: number,
		opts: { total: number; quoteNumber: string; projectId?: Id<"projects"> }
	): Promise<Id<"quotes">> {
		const restoreTo = Date.now();
		vi.setSystemTime(approvedAt);
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			projectId: opts.projectId,
			title: "Quote",
			quoteNumber: opts.quoteNumber,
			status: "sent",
			subtotal: opts.total,
			taxAmount: 0,
			total: opts.total,
		});
		await asUser.mutation(api.quotes.update, { id: quoteId, status: "approved" });
		vi.setSystemTime(restoreTo);
		return quoteId;
	}

	/** Invoice paid at `paidAt` via the real create(sent)+markPaid transition. */
	async function createPaidInvoice(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		paidAt: number,
		opts: { total: number; invoiceNumber: string }
	): Promise<Id<"invoices">> {
		const restoreTo = Date.now();
		vi.setSystemTime(paidAt);
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: opts.invoiceNumber,
			status: "sent",
			subtotal: opts.total,
			taxAmount: 0,
			total: opts.total,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});
		await asUser.mutation(api.invoices.markPaid, { id: invoiceId });
		vi.setSystemTime(restoreTo);
		return invoiceId;
	}

	// =====================================================================
	// Behaviors 1 & 2: all-time "current" vs "total - thisMonth" previous
	// =====================================================================

	it("completedProjects/approvedQuotes/invoicesPaid.current is an ALL-TIME count, not this month's", async () => {
		const { asUser } = await seedOrg("alltime");
		const clientId = await createClient(asUser, "Alltime Co");

		// One record each two months ago, last month, and this month.
		await createCompletedProject(asUser, clientId, TWO_MONTHS_AGO, "P0");
		await createCompletedProject(asUser, clientId, LAST_MONTH, "P1");
		await createCompletedProject(asUser, clientId, NOW, "P2");

		await createApprovedQuote(asUser, clientId, TWO_MONTHS_AGO, {
			total: 100,
			quoteNumber: "Q-ALL-0",
		});
		await createApprovedQuote(asUser, clientId, LAST_MONTH, {
			total: 200,
			quoteNumber: "Q-ALL-1",
		});
		await createApprovedQuote(asUser, clientId, NOW, {
			total: 300,
			quoteNumber: "Q-ALL-2",
		});

		await createPaidInvoice(asUser, clientId, TWO_MONTHS_AGO, {
			total: 10,
			invoiceNumber: "INV-ALL-0",
		});
		await createPaidInvoice(asUser, clientId, LAST_MONTH, {
			total: 20,
			invoiceNumber: "INV-ALL-1",
		});
		await createPaidInvoice(asUser, clientId, NOW, {
			total: 30,
			invoiceNumber: "INV-ALL-2",
		});

		const stats = await asUser.query(api.homeStats.getHomeStats, {});

		// An implementation that only counted this month's records would
		// return 1 for each of these — the correct pinned value is 3.
		expect(stats.completedProjects.current).toBe(3);
		expect(stats.approvedQuotes.current).toBe(3);
		expect(stats.invoicesPaid.current).toBe(3);

		// previous = total - thisMonthCount (homeStats.ts:307/314/321): the
		// two-months-ago record stays folded into "previous" even though it
		// isn't in last month's window either.
		expect(stats.completedProjects.previous).toBe(2);
		expect(stats.approvedQuotes.previous).toBe(2);
		expect(stats.invoicesPaid.previous).toBe(2);

		// thisMonth(1) vs lastMonth(1) -> neutral, despite the all-time total being 3.
		expect(stats.completedProjects.change).toBe(0);
		expect(stats.completedProjects.changeType).toBe("neutral");
		expect(stats.approvedQuotes.change).toBe(0);
		expect(stats.invoicesPaid.change).toBe(0);
	});

	it("totalClients.previous is total - thisMonth, matching the other groups", async () => {
		// convex-test's internal _creationTime clock is monotonic per `t`
		// instance (clamps forward if "now" doesn't advance) — unlike
		// completedAt/approvedAt/paidAt, which are plain Date.now() calls in
		// the mutation handlers. So org setup must happen at the earliest
		// timestamp and every step after it must move the clock forward only.
		vi.setSystemTime(TWO_MONTHS_AGO);
		const { asUser } = await seedOrg("clientsprev");
		await createClient(asUser, "Client X");

		vi.setSystemTime(LAST_MONTH);
		await createClient(asUser, "Client Y");

		vi.setSystemTime(NOW);
		await createClient(asUser, "Client Z1");
		await createClient(asUser, "Client Z2");

		const stats = await asUser.query(api.homeStats.getHomeStats, {});

		expect(stats.totalClients.current).toBe(4);
		// 4 - 2(thisMonth) = 2; the two-months-ago client stays folded into
		// "previous" the same way it does for the other groups.
		expect(stats.totalClients.previous).toBe(2);
		expect(stats.totalClients.change).toBe(1); // |thisMonth(2) - lastMonth(1)|
		expect(stats.totalClients.changeType).toBe("increase");
	});

	// =====================================================================
	// Behavior 6: completedProjects.totalValue
	// =====================================================================

	it("completedProjects.totalValue sums approved-quote totals only for projects completed THIS month", async () => {
		const { asUser } = await seedOrg("totalvalue");
		const clientId = await createClient(asUser, "Value Co");

		const projectThisMonth = await createCompletedProject(
			asUser,
			clientId,
			NOW,
			"This Month Project"
		);
		const projectLastMonth = await createCompletedProject(
			asUser,
			clientId,
			LAST_MONTH,
			"Last Month Project"
		);

		// Counted: two approved quotes tied to the this-month-completed project.
		await createApprovedQuote(asUser, clientId, NOW, {
			total: 500,
			quoteNumber: "Q-TV-1",
			projectId: projectThisMonth,
		});
		await createApprovedQuote(asUser, clientId, NOW, {
			total: 250,
			quoteNumber: "Q-TV-2",
			projectId: projectThisMonth,
		});

		// Excluded: approved, but its project completed last month, not this one.
		await createApprovedQuote(asUser, clientId, LAST_MONTH, {
			total: 700,
			quoteNumber: "Q-TV-3",
			projectId: projectLastMonth,
		});

		// Excluded: tied to the this-month project, but never approved (status stays "sent").
		vi.setSystemTime(NOW);
		await asUser.mutation(api.quotes.create, {
			clientId,
			projectId: projectThisMonth,
			title: "Unapproved",
			quoteNumber: "Q-TV-4",
			status: "sent",
			subtotal: 1000,
			taxAmount: 0,
			total: 1000,
		});

		const stats = await asUser.query(api.homeStats.getHomeStats, {});
		expect(stats.completedProjects.totalValue).toBe(750);
	});

	// =====================================================================
	// Behavior 3: revenueGoal.changePercentage is wrapped in Math.abs
	// =====================================================================

	it("revenueGoal.changePercentage is non-negative even when this month trails last month", async () => {
		const { asUser } = await seedOrg("revenuedrop");
		await asUser.mutation(api.organizations.update, { monthlyRevenueTarget: 10000 });
		const clientId = await createClient(asUser, "Revenue Co");

		await createPaidInvoice(asUser, clientId, LAST_MONTH, {
			total: 8000,
			invoiceNumber: "INV-REV-LAST",
		});
		await createPaidInvoice(asUser, clientId, NOW, {
			total: 2000,
			invoiceNumber: "INV-REV-NOW",
		});

		const stats = await asUser.query(api.homeStats.getHomeStats, {});

		expect(stats.revenueGoal.current).toBe(2000);
		expect(stats.revenueGoal.percentage).toBe(20);
		expect(stats.revenueGoal.previousPercentage).toBe(80);
		// Raw change is 20 - 80 = -60; homeStats.ts:332 wraps it in Math.abs.
		expect(stats.revenueGoal.changePercentage).toBe(60);
		expect(stats.revenueGoal.changePercentage).toBeGreaterThanOrEqual(0);
		expect(stats.revenueGoal.changeType).toBe("decrease");
	});

	// =====================================================================
	// Behavior 4: revenueGoal.target `|| 50000` falsy-zero quirk
	// =====================================================================

	it("revenueGoal.target falls back to 50000 when monthlyRevenueTarget is explicitly 0 (known `||` quirk, preserved deliberately)", async () => {
		const { asUser } = await seedOrg("targetzero");
		await asUser.mutation(api.organizations.update, { monthlyRevenueTarget: 0 });

		const stats = await asUser.query(api.homeStats.getHomeStats, {});

		// homeStats.ts:261 — `organization?.monthlyRevenueTarget || 50000` treats
		// an explicit 0 as falsy, so an org that truly wants a $0 goal still
		// gets $50,000. This is a known oddity in the current implementation;
		// it is pinned here on purpose, not something to "fix" in the test.
		expect(stats.revenueGoal.target).toBe(50000);
	});

	// =====================================================================
	// Behavior 5: invoicesPaid.outstanding — no time filter
	// =====================================================================

	it("invoicesPaid.outstanding sums sent+overdue invoices with no time bound", async () => {
		const { asUser } = await seedOrg("outstanding");
		const clientId = await createClient(asUser, "Outstanding Co");

		vi.setSystemTime(TWO_MONTHS_AGO);
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-OUT-SENT",
			status: "sent",
			subtotal: 300,
			taxAmount: 0,
			total: 300,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-OUT-OVERDUE",
			status: "overdue",
			subtotal: 450,
			taxAmount: 0,
			total: 450,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});

		vi.setSystemTime(NOW);
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-OUT-PAID",
			status: "paid",
			subtotal: 999,
			taxAmount: 0,
			total: 999,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-OUT-DRAFT",
			status: "draft",
			subtotal: 111,
			taxAmount: 0,
			total: 111,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-OUT-CANCELLED",
			status: "cancelled",
			subtotal: 222,
			taxAmount: 0,
			total: 222,
			issuedDate: Date.now(),
			dueDate: Date.now() + 30 * DAY,
		});

		const stats = await asUser.query(api.homeStats.getHomeStats, {});
		// 300 (sent, 2 months old) + 450 (overdue, 2 months old); paid/draft/cancelled excluded.
		expect(stats.invoicesPaid.outstanding).toBe(750);
	});

	// =====================================================================
	// Behavior 7: pendingTasks.total / dueThisWeek
	// =====================================================================

	it("pendingTasks.total counts pending+in-progress; dueThisWeek uses the [start, end) week window", async () => {
		const { asUser } = await seedOrg("tasks");
		const weekRange = getWeekRange();

		await asUser.mutation(api.tasks.create, {
			title: "In range, pending",
			date: weekRange.start,
			status: "pending",
			type: "internal",
		});
		await asUser.mutation(api.tasks.create, {
			title: "In range, in-progress",
			date: weekRange.start + 3 * DAY,
			status: "in-progress",
			type: "internal",
		});
		await asUser.mutation(api.tasks.create, {
			title: "At the exclusive end boundary",
			date: weekRange.end,
			status: "pending",
			type: "internal",
		});
		await asUser.mutation(api.tasks.create, {
			title: "After the week",
			date: weekRange.end + DAY,
			status: "pending",
			type: "internal",
		});
		await asUser.mutation(api.tasks.create, {
			title: "Completed, in range",
			date: weekRange.start,
			status: "completed",
			type: "internal",
		});
		await asUser.mutation(api.tasks.create, {
			title: "Cancelled, in range",
			date: weekRange.start,
			status: "cancelled",
			type: "internal",
		});

		const stats = await asUser.query(api.homeStats.getHomeStats, {});
		// pending/in-progress only: in-range pending, in-range in-progress,
		// boundary pending, and the out-of-week pending all count toward total.
		expect(stats.pendingTasks.total).toBe(4);
		// dueThisWeek excludes the exclusive end-boundary task and the out-of-week one.
		expect(stats.pendingTasks.dueThisWeek).toBe(2);
	});

	// =====================================================================
	// Behavior 8: empty states
	// =====================================================================

	it("returns the all-zero EMPTY_HOME_STATS for a caller with no org", async () => {
		const stats = await t.query(api.homeStats.getHomeStats, {});

		// Mirrors homeStats.ts:74-115 exactly.
		expect(stats).toEqual({
			totalClients: { current: 0, previous: 0, change: 0, changeType: "neutral" },
			completedProjects: {
				current: 0,
				previous: 0,
				change: 0,
				changeType: "neutral",
				totalValue: 0,
			},
			approvedQuotes: {
				current: 0,
				previous: 0,
				change: 0,
				changeType: "neutral",
				totalValue: 0,
			},
			invoicesPaid: {
				current: 0,
				previous: 0,
				change: 0,
				changeType: "neutral",
				totalValue: 0,
				outstanding: 0,
			},
			revenueGoal: {
				percentage: 0,
				current: 0,
				target: 0,
				previousPercentage: 0,
				changePercentage: 0,
				changeType: "neutral",
			},
			pendingTasks: { total: 0, dueThisWeek: 0 },
		});
	});

	it("an org with zero records computes all-zero stats, but revenueGoal.target defaults to 50000 (unlike the no-org EMPTY_HOME_STATS)", async () => {
		const { asUser } = await seedOrg("zerorecords");
		const stats = await asUser.query(api.homeStats.getHomeStats, {});

		expect(stats.totalClients).toEqual({
			current: 0,
			previous: 0,
			change: 0,
			changeType: "neutral",
		});
		expect(stats.completedProjects).toEqual({
			current: 0,
			previous: 0,
			change: 0,
			changeType: "neutral",
			totalValue: 0,
		});
		expect(stats.approvedQuotes).toEqual({
			current: 0,
			previous: 0,
			change: 0,
			changeType: "neutral",
			totalValue: 0,
		});
		expect(stats.invoicesPaid).toEqual({
			current: 0,
			previous: 0,
			change: 0,
			changeType: "neutral",
			totalValue: 0,
			outstanding: 0,
		});
		// Surprise: an authed org with no monthlyRevenueTarget set computes the
		// `|| 50000` default (homeStats.ts:261), unlike the literal `target: 0`
		// in EMPTY_HOME_STATS used for unauthenticated callers.
		expect(stats.revenueGoal).toEqual({
			percentage: 0,
			current: 0,
			target: 50000,
			previousPercentage: 0,
			changePercentage: 0,
			changeType: "neutral",
		});
		expect(stats.pendingTasks).toEqual({ total: 0, dueThisWeek: 0 });
	});
});
