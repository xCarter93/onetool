import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
} from "./test.helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed UTC anchors: with no org timezone set the day/month bucket keys are UTC,
 * so these map to exact "YYYY-MM-DD" / "YYYY-MM" strings.
 */
const JAN_5 = Date.UTC(2026, 0, 5, 12);
const JAN_6 = Date.UTC(2026, 0, 6, 12);
const FEB_10 = Date.UTC(2026, 1, 10, 12);

type PaymentOverrides = {
	paymentAmount: number;
	dueDate: number;
	status?: "pending" | "sent" | "paid" | "refunded" | "overdue" | "cancelled";
	paidAt?: number;
	sortOrder?: number;
};

/**
 * Payments have no test.helpers factory — businessHealth.test.ts raw-inserts
 * them for the same reason: nothing here reads an aggregate or the search
 * index, so trigger-backed creation buys nothing.
 */
async function insertPayment(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	invoiceId: Id<"invoices">,
	overrides: PaymentOverrides
): Promise<Id<"payments">> {
	return await ctx.db.insert("payments", {
		orgId,
		invoiceId,
		paymentAmount: overrides.paymentAmount,
		dueDate: overrides.dueDate,
		description: "Test payment",
		sortOrder: overrides.sortOrder ?? 0,
		status: overrides.status ?? "paid",
		paidAt: overrides.paidAt,
	});
}

describe("dashboardStats.getCollectionPace", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("buckets payment rows, not invoice totals, for a partially paid invoice", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 1000,
				issuedDate: JAN_5,
				dueDate: JAN_6,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 600,
				dueDate: JAN_5,
				status: "paid",
				paidAt: JAN_5,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 400,
				dueDate: JAN_6,
				status: "sent",
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const pace = await asUser.query(api.dashboardStats.getCollectionPace, {
			startDate: JAN_5 - DAY_MS,
			endDate: JAN_6 + DAY_MS,
			granularity: "day",
		});

		expect(pace.invoiced).toEqual([
			{ date: "2026-01-04", value: 0 },
			{ date: "2026-01-05", value: 600 },
			{ date: "2026-01-06", value: 400 },
			{ date: "2026-01-07", value: 0 },
		]);
		expect(pace.collected).toEqual([
			{ date: "2026-01-04", value: 0 },
			{ date: "2026-01-05", value: 600 },
			{ date: "2026-01-06", value: 0 },
			{ date: "2026-01-07", value: 0 },
		]);
		expect(pace.totals).toEqual({ invoiced: 1000, collected: 600 });
	});

	it("excludes payments due outside the window even when paid inside it", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 700,
				issuedDate: JAN_5,
				dueDate: JAN_5,
			});
			// Due in January, collected in February: February's cohort ignores it.
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 700,
				dueDate: JAN_5,
				status: "paid",
				paidAt: FEB_10,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const feb = await asUser.query(api.dashboardStats.getCollectionPace, {
			startDate: Date.UTC(2026, 1, 1),
			endDate: Date.UTC(2026, 1, 28),
			granularity: "day",
		});
		expect(feb.totals).toEqual({ invoiced: 0, collected: 0 });

		// January's cohort counts it as collected, clamped into the window.
		const jan = await asUser.query(api.dashboardStats.getCollectionPace, {
			startDate: Date.UTC(2026, 0, 1),
			endDate: Date.UTC(2026, 0, 31),
			granularity: "day",
		});
		expect(jan.totals).toEqual({ invoiced: 700, collected: 700 });
	});

	it("keeps a refunded payment invoiced but never collected", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 500,
				issuedDate: JAN_5,
				dueDate: JAN_5,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 500,
				dueDate: JAN_5,
				status: "refunded",
				paidAt: JAN_5,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const pace = await asUser.query(api.dashboardStats.getCollectionPace, {
			startDate: JAN_5,
			endDate: JAN_5,
			granularity: "day",
		});

		expect(pace.totals).toEqual({ invoiced: 500, collected: 0 });
	});

	it("ignores cancelled payment rows and draft/cancelled invoices", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);

			const sent = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 100,
				issuedDate: JAN_5,
				dueDate: JAN_5,
			});
			await insertPayment(ctx, org.orgId, sent, {
				paymentAmount: 100,
				dueDate: JAN_5,
				status: "paid",
				paidAt: JAN_5,
			});
			await insertPayment(ctx, org.orgId, sent, {
				paymentAmount: 999,
				dueDate: JAN_5,
				status: "cancelled",
			});

			for (const status of ["draft", "cancelled"] as const) {
				const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
					status,
					total: 800,
					issuedDate: JAN_5,
					dueDate: JAN_5,
				});
				await insertPayment(ctx, org.orgId, invoiceId, {
					paymentAmount: 800,
					dueDate: JAN_5,
					status: "paid",
					paidAt: JAN_5,
				});
			}
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const pace = await asUser.query(api.dashboardStats.getCollectionPace, {
			startDate: JAN_5,
			endDate: JAN_5,
			granularity: "day",
		});

		expect(pace.totals).toEqual({ invoiced: 100, collected: 100 });
	});

	it("returns a dense month series and a null goal until one is set", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 300,
				issuedDate: JAN_5,
				dueDate: FEB_10,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 300,
				dueDate: FEB_10,
				status: "paid",
				paidAt: FEB_10,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const args = {
			startDate: Date.UTC(2025, 11, 1),
			endDate: Date.UTC(2026, 1, 28),
			granularity: "month" as const,
		};

		const unset = await asUser.query(api.dashboardStats.getCollectionPace, args);
		expect(unset.invoiced.map((b) => b.date)).toEqual([
			"2025-12",
			"2026-01",
			"2026-02",
		]);
		expect(unset.invoiced.map((b) => b.value)).toEqual([0, 0, 300]);
		expect(unset.goal).toBeNull();

		// Deliberately different from getHomeStats: no synthetic 50000 default,
		// and an explicit 0 is a real goal rather than a fallback trigger.
		await asUser.mutation(api.organizations.update, {
			monthlyRevenueTarget: 0,
		});
		expect(
			(await asUser.query(api.dashboardStats.getCollectionPace, args)).goal
		).toBe(0);

		await asUser.mutation(api.organizations.update, {
			monthlyRevenueTarget: 12000,
		});
		expect(
			(await asUser.query(api.dashboardStats.getCollectionPace, args)).goal
		).toBe(12000);

		// setMonthlyRevenueTarget can clear (update can't — it drops undefined args).
		await asUser.mutation(api.organizations.setMonthlyRevenueTarget, {
			target: null,
		});
		expect(
			(await asUser.query(api.dashboardStats.getCollectionPace, args)).goal
		).toBeNull();

		await asUser.mutation(api.organizations.setMonthlyRevenueTarget, {
			target: 8000,
		});
		expect(
			(await asUser.query(api.dashboardStats.getCollectionPace, args)).goal
		).toBe(8000);
	});
});

describe("dashboardStats.getAvgDaysToPay", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("weights days-to-pay by payment amount and compares the prior 30 days", async () => {
		const now = Date.now();
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);

			// Current window: 1000 paid after 10 days, 100 paid after 20 days.
			const big = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 1000,
				issuedDate: now - 40 * DAY_MS,
				firstSentAt: now - 20 * DAY_MS,
				dueDate: now,
			});
			await insertPayment(ctx, org.orgId, big, {
				paymentAmount: 1000,
				dueDate: now,
				status: "paid",
				paidAt: now - 10 * DAY_MS,
			});
			const small = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 100,
				issuedDate: now - 25 * DAY_MS,
				firstSentAt: now - 25 * DAY_MS,
				dueDate: now,
			});
			await insertPayment(ctx, org.orgId, small, {
				paymentAmount: 100,
				dueDate: now,
				status: "paid",
				paidAt: now - 5 * DAY_MS,
			});

			// Previous window: settled 40 days ago, 4 days after being sent.
			const older = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 200,
				issuedDate: now - 60 * DAY_MS,
				firstSentAt: now - 44 * DAY_MS,
				dueDate: now - 30 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, older, {
				paymentAmount: 200,
				dueDate: now - 30 * DAY_MS,
				status: "paid",
				paidAt: now - 40 * DAY_MS,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(api.dashboardStats.getAvgDaysToPay, {});

		// (1000×10 + 100×20) / 1100 = 10.909… → 10.9, not the unweighted 15.
		expect(result.days).toBe(10.9);
		expect(result.prevDays).toBe(4);
	});

	it("anchors on issuedDate when the invoice was never sent, and clamps at zero", async () => {
		const now = Date.now();
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 500,
				issuedDate: now - 2 * DAY_MS,
				dueDate: now,
			});
			// Recorded before the invoice was issued — negative days must not count.
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 500,
				dueDate: now,
				status: "paid",
				paidAt: now - 5 * DAY_MS,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		expect(
			(await asUser.query(api.dashboardStats.getAvgDaysToPay, {})).days
		).toBe(0);
	});

	it("returns null in both windows with no settled payments", async () => {
		const { clerkUserId, clerkOrgId } = await t.run((ctx) => createTestOrg(ctx));
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		expect(await asUser.query(api.dashboardStats.getAvgDaysToPay, {})).toEqual({
			days: null,
			prevDays: null,
		});
	});
});

describe("dashboardStats.getAvgJobValue", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("averages paid-invoice totals and leaves empty buckets null", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 100,
				issuedDate: JAN_5,
				dueDate: JAN_5,
				paidAt: JAN_5,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 300,
				issuedDate: JAN_5,
				dueDate: JAN_5,
				paidAt: JAN_5,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 800,
				issuedDate: JAN_6,
				dueDate: JAN_6,
				paidAt: JAN_6,
			});
			// Unpaid — excluded from both the headline and the series.
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 9999,
				issuedDate: JAN_5,
				dueDate: JAN_5,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(api.dashboardStats.getAvgJobValue, {
			startDate: JAN_5 - DAY_MS,
			endDate: JAN_6,
		});

		expect(result.value).toBe(400); // (100 + 300 + 800) / 3
		// Series is a running average: null before the first paid invoice.
		expect(result.series).toEqual([
			{ date: "2026-01-04", value: null },
			{ date: "2026-01-05", value: 200 },
			{ date: "2026-01-06", value: 400 },
		]);
	});

	it("returns a null value when nothing was paid in range", async () => {
		const { clerkUserId, clerkOrgId } = await t.run((ctx) => createTestOrg(ctx));
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const result = await asUser.query(api.dashboardStats.getAvgJobValue, {
			startDate: JAN_5,
			endDate: JAN_5,
		});
		expect(result.value).toBeNull();
		expect(result.series).toEqual([{ date: "2026-01-05", value: null }]);
	});
});

describe("dashboardStats.getTopClientsByRevenue", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("ranks clients by collected payments and splits the remainder into otherTotal", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const seed = async (name: string, amounts: number[]) => {
				const clientId = await createTestClient(ctx, org.orgId, {
					companyName: name,
				});
				const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
					status: "sent",
					total: 10000,
					issuedDate: JAN_5,
					dueDate: JAN_5,
				});
				for (const amount of amounts) {
					await insertPayment(ctx, org.orgId, invoiceId, {
						paymentAmount: amount,
						dueDate: JAN_5,
						status: "paid",
						paidAt: JAN_5,
					});
				}
			};
			await seed("Alpha", [400, 200]);
			await seed("Bravo", [300]);
			await seed("Charlie", [100]);
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(
			api.dashboardStats.getTopClientsByRevenue,
			{ startDate: JAN_5, endDate: JAN_5, limit: 2 }
		);

		expect(result.grandTotal).toBe(1000);
		expect(result.clients.map((c) => [c.name, c.total, c.share])).toEqual([
			["Alpha", 600, 0.6],
			["Bravo", 300, 0.3],
		]);
		expect(result.otherTotal).toBe(100);
	});

	it("excludes refunded payments and payments outside the range", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId, {
				companyName: "Solo",
			});
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 10000,
				issuedDate: JAN_5,
				dueDate: JAN_5,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 250,
				dueDate: JAN_5,
				status: "paid",
				paidAt: JAN_5,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 900,
				dueDate: JAN_5,
				status: "refunded",
				paidAt: JAN_5,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 700,
				dueDate: FEB_10,
				status: "paid",
				paidAt: FEB_10,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const result = await asUser.query(
			api.dashboardStats.getTopClientsByRevenue,
			{ startDate: JAN_5, endDate: JAN_5 }
		);

		expect(result.grandTotal).toBe(250);
		expect(result.clients).toEqual([
			{
				clientId: result.clients[0]?.clientId,
				name: "Solo",
				total: 250,
				share: 1,
			},
		]);
		expect(result.otherTotal).toBe(0);
	});
});

describe("dashboardStats.getActiveJobCount", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("counts only in-progress projects and follows status transitions", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			await createTestClient(ctx, org.orgId, { companyName: "Acme" });
			return org;
		});
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const clientId = (
			await asUser.query(api.clients.list, {})
		)[0]._id as Id<"clients">;

		// Created through the public API so the projectCounts aggregate is written.
		const active = await asUser.mutation(api.projects.create, {
			clientId,
			title: "Active job",
			status: "in-progress",
			projectType: "one-off",
		});
		await asUser.mutation(api.projects.create, {
			clientId,
			title: "Planned job",
			status: "planned",
			projectType: "one-off",
		});

		expect(
			await asUser.query(api.dashboardStats.getActiveJobCount, {})
		).toEqual({ inProgress: 1, planned: 1 });

		await asUser.mutation(api.projects.update, {
			id: active,
			status: "completed",
		});

		expect(
			await asUser.query(api.dashboardStats.getActiveJobCount, {})
		).toEqual({ inProgress: 0, planned: 1 });
	});
});
