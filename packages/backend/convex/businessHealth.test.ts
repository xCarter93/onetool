import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
	createTestQuote,
} from "./test.helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

type PaymentOverrides = {
	paymentAmount: number;
	status?:
		| "pending"
		| "sent"
		| "paid"
		| "refunded"
		| "overdue"
		| "cancelled";
	paidAt?: number;
	dueDate?: number;
	sortOrder?: number;
	manualMethod?: "cash" | "check" | "other";
	recordedOutsidePortal?: boolean;
	refundedAmount?: number;
};

/**
 * Payments have no test.helpers factory — the existing suites (invoices.test.ts
 * getOverdue, payments.test.ts) raw-insert them, and businessHealth reads no
 * aggregates and no search index, so trigger-backed creation buys nothing here.
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
		dueDate: overrides.dueDate ?? Date.now(),
		description: "Test payment",
		sortOrder: overrides.sortOrder ?? 0,
		status: overrides.status ?? "paid",
		paidAt: overrides.paidAt,
		manualMethod: overrides.manualMethod,
		recordedOutsidePortal: overrides.recordedOutsidePortal,
		refundedAmount: overrides.refundedAmount,
	});
}

async function grantMemberPermissions(
	ctx: { db: MutationCtx["db"] },
	orgId: Id<"organizations">,
	userId: Id<"users">,
	permissions: Record<
		string,
		{ level: "none" | "view" | "modify" | "delete"; allRecords?: boolean }
	>
): Promise<void> {
	const membership = await ctx.db
		.query("organizationMemberships")
		.withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.unique();
	if (!membership) throw new Error("membership not found");
	await ctx.db.patch(membership._id, { permissions });
}

describe("businessHealth.get", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("nets partial payments out of outstanding", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 10000,
				dueDate: Date.now() + 10 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 4500,
				status: "paid",
				paidAt: Date.now(),
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.outstanding.total).toBe(5500);
		expect(health.outstanding.overdue).toBe(0);
		expect(health.outstanding.invoiceCount).toBe(1);
	});

	it("excludes refunded rows from collected money and restores remaining", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 10000,
				dueDate: Date.now() + 10 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 4500,
				status: "refunded",
				paidAt: Date.now(),
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.outstanding.total).toBe(10000);
		expect(health.collectedThisMonth).toBe(0);
		expect(health.months.at(-1)?.value).toBe(0);
		expect(health.recentPayments).toHaveLength(0);
	});

	it("restores a refunded balance to outstanding when the invoice stayed paid", async () => {
		// The Stripe refund webhook flips only the payment row — the invoice
		// keeps status "paid". Its restored balance must still surface.
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const refundedId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 10000,
				dueDate: Date.now() - 5 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, refundedId, {
				paymentAmount: 10000,
				status: "refunded",
				paidAt: Date.now(),
			});
			// Control: a settled paid invoice stays excluded.
			const settledId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 4000,
				dueDate: Date.now() - 5 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, settledId, {
				paymentAmount: 4000,
				status: "paid",
				paidAt: Date.now(),
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.outstanding.total).toBe(10000);
		expect(health.outstanding.overdue).toBe(10000);
		expect(health.outstanding.invoiceCount).toBe(1);
	});

	it("ignores a fully-covered invoice that is still marked sent", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 2500,
				dueDate: Date.now() - 5 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 2500,
				status: "paid",
				paidAt: Date.now(),
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.outstanding.total).toBe(0);
		expect(health.outstanding.overdue).toBe(0);
		expect(health.outstanding.invoiceCount).toBe(0);
		expect(health.needsAttention).toHaveLength(0);
	});

	it("splits effective-overdue invoices out and orders them most-overdue first", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId, {
				companyName: "Acme Co",
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "1042",
				status: "sent",
				total: 1000,
				dueDate: Date.now() - 3 * DAY_MS,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "1043",
				status: "sent",
				total: 2000,
				dueDate: Date.now() - 30 * DAY_MS,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "1044",
				status: "sent",
				total: 4000,
				dueDate: Date.now() + 10 * DAY_MS,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.outstanding.total).toBe(7000);
		expect(health.outstanding.overdue).toBe(3000);
		expect(health.outstanding.invoiceCount).toBe(3);

		expect(health.needsAttention.map((r) => r.label)).toEqual([
			"Invoice #1043",
			"Invoice #1042",
		]);
		expect(health.needsAttention[0]).toMatchObject({
			kind: "invoice",
			clientName: "Acme Co",
			amount: 2000,
		});
		expect(health.needsAttention[0].dueDate).toBeLessThan(
			health.needsAttention[1].dueDate as number
		);
	});

	it("caps needsAttention at 5, invoices before quotes and quotes oldest-first", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			for (let i = 0; i < 3; i++) {
				await createTestInvoice(ctx, org.orgId, clientId, {
					invoiceNumber: `20${i}`,
					status: "overdue",
					total: 100,
					dueDate: Date.now() - (i + 1) * DAY_MS,
				});
			}
			// Oldest sentAt first among the quotes; the 4th must be dropped by the cap.
			for (let i = 0; i < 4; i++) {
				const quoteId = await createTestQuote(ctx, org.orgId, clientId, {
					quoteNumber: `Q${i}`,
					title: undefined,
					status: "sent",
					total: 500,
				});
				await ctx.db.patch(quoteId, {
					title: undefined,
					sentAt: Date.now() - (10 - i) * DAY_MS,
				});
			}
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.needsAttention).toHaveLength(5);
		expect(health.needsAttention.slice(0, 3).map((r) => r.kind)).toEqual([
			"invoice",
			"invoice",
			"invoice",
		]);
		// Most-overdue invoice first.
		expect(health.needsAttention[0].label).toBe("Invoice #202");
		// Then the two oldest quotes, oldest sentAt first.
		expect(health.needsAttention.slice(3).map((r) => r.label)).toEqual([
			"Quote #Q0",
			"Quote #Q1",
		]);
		expect(health.needsAttention[3]).toMatchObject({
			kind: "quote",
			amount: 500,
		});
		expect(health.needsAttention[3].sentAt).toBeLessThan(
			health.needsAttention[4].sentAt as number
		);
	});

	it("counts only sent quotes in awaiting and appends the quote title to the label", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "217",
				title: "Spring cleanup",
				status: "sent",
				total: 1500,
			});
			await createTestQuote(ctx, org.orgId, clientId, {
				status: "draft",
				total: 900,
			});
			await createTestQuote(ctx, org.orgId, clientId, {
				status: "approved",
				total: 900,
			});
			await createTestQuote(ctx, org.orgId, clientId, {
				status: "expired",
				total: 900,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.awaiting).toEqual({ count: 1, total: 1500 });
		expect(health.needsAttention).toHaveLength(1);
		expect(health.needsAttention[0].label).toBe("Quote #217 — Spring cleanup");
	});

	it("buckets settled payments by the org timezone month, not UTC", async () => {
		// 03:00 UTC on the 1st of the current New York month is still the previous
		// month in New York (UTC-4/-5), so the payment belongs to the prior bucket.
		const nyMonth = new Intl.DateTimeFormat("en-CA", {
			timeZone: "America/New_York",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		})
			.format(new Date())
			.slice(0, 7);
		const firstOfMonthUtc3am = Date.UTC(
			Number(nyMonth.slice(0, 4)),
			Number(nyMonth.slice(5, 7)) - 1,
			1,
			3,
			0,
			0
		);

		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			await ctx.db.patch(org.orgId, { timezone: "America/New_York" });
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 800,
			});
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 800,
				status: "paid",
				paidAt: firstOfMonthUtc3am,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.months).toHaveLength(6);
		expect(health.collectedThisMonth).toBe(0);
		expect(health.months.at(-1)?.value).toBe(0);
		expect(health.months.at(-2)?.value).toBe(800);
		expect(health.months.at(-1)?.label).toMatch(/^[A-Z]{3}$/);
	});

	it("returns the newest 5 settled payments with mapped methods", async () => {
		const now = Date.now();
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId, {
				companyName: "Beta LLC",
			});
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 10000,
			});
			for (let i = 0; i < 6; i++) {
				await insertPayment(ctx, org.orgId, invoiceId, {
					paymentAmount: 100 + i,
					status: "paid",
					paidAt: now - i * 1000,
					sortOrder: i,
				});
			}
			// Manual method passthrough + portal card fallback.
			await insertPayment(ctx, org.orgId, invoiceId, {
				paymentAmount: 42,
				status: "paid",
				paidAt: now + 2000,
				recordedOutsidePortal: true,
				manualMethod: "check",
				sortOrder: 10,
			});
			return org;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const health = await asUser.query(api.businessHealth.get, {});

		expect(health.recentPayments).toHaveLength(5);
		const paidAts = health.recentPayments.map((p) => p.paidAt);
		expect([...paidAts].sort((a, b) => b - a)).toEqual(paidAts);
		expect(health.recentPayments[0]).toMatchObject({
			clientName: "Beta LLC",
			amount: 42,
			method: "check",
		});
		// The portal-settled rows carry neither manualMethod nor recordedOutsidePortal.
		expect(health.recentPayments[1].method).toBe("card");
	});

	it("scopes a member's numbers to their assigned projects", async () => {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "bh_owner",
				clerkOrgId: "bh_org",
			})
		);
		const member = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: "bh_member" })
		);
		const asAdmin = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);

		const clientId = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Scoped Client",
			status: "active",
		});
		const assignedProject = await asAdmin.mutation(api.projects.create, {
			clientId,
			title: "Assigned",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [member.userId],
		});
		const unassignedProject = await asAdmin.mutation(api.projects.create, {
			clientId,
			title: "Unassigned",
			status: "planned",
			projectType: "one-off",
		});

		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "IN-SCOPE",
				status: "sent",
				total: 1000,
				dueDate: Date.now() + 10 * DAY_MS,
				projectId: assignedProject,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "OUT-SCOPE",
				status: "sent",
				total: 7000,
				dueDate: Date.now() + 10 * DAY_MS,
				projectId: unassignedProject,
			});
			// The member gets invoices:view and nothing else, so this quote proves
			// the soft gate: quote data is absent rather than throwing.
			await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "Q-SCOPE",
				status: "sent",
				total: 2500,
				projectId: assignedProject,
			});
			await grantMemberPermissions(ctx, org.orgId, member.userId, {
				invoices: { level: "view" },
			});
		});

		const adminHealth = await asAdmin.query(api.businessHealth.get, {});
		expect(adminHealth.outstanding.total).toBe(8000);
		expect(adminHealth.outstanding.invoiceCount).toBe(2);
		expect(adminHealth.awaiting).toEqual({ count: 1, total: 2500 });

		const memberHealth = await asMember.query(api.businessHealth.get, {});
		expect(memberHealth.outstanding.total).toBe(1000);
		expect(memberHealth.outstanding.invoiceCount).toBe(1);
		// No quotes:view → no quote pipeline and no quote rows in the list.
		expect(memberHealth.awaiting).toEqual({ count: 0, total: 0 });
		expect(
			memberHealth.needsAttention.some((row) => row.kind === "quote")
		).toBe(false);
	});

	it("returns the empty payload for a caller without an org", async () => {
		const health = await t.query(api.businessHealth.get, {});

		expect(health).toEqual({
			outstanding: { total: 0, overdue: 0, invoiceCount: 0 },
			awaiting: { count: 0, total: 0 },
			collectedThisMonth: 0,
			months: [],
			needsAttention: [],
			recentPayments: [],
		});
	});
});

/**
 * Byte-identity oracle for the pinned mobile read (mobilePinnedPaths.test.ts).
 * Shipped binaries have no OTA, so the payload shape, element order and numbers
 * must survive any read-path refactor unchanged. The fixture deliberately
 * includes a paid payment on a CANCELLED invoice — a row that an
 * index-narrowed invoice read would otherwise drop out of `recentPayments`.
 */
describe("businessHealth.get payload is stable across read-path changes", () => {
	let t: ReturnType<typeof convexTest>;

	// Mid-month, mid-day UTC so no bucket, label or due-date comparison sits on
	// a boundary that a few ms of test runtime could cross.
	const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
		vi.setSystemTime(NOW);
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("matches the recorded payload for a full-status org", async () => {
		const seed = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const alpha = await createTestClient(ctx, org.orgId, {
				companyName: "Alpha Co",
			});
			const beta = await createTestClient(ctx, org.orgId, {
				companyName: "Beta LLC",
			});
			const gamma = await createTestClient(ctx, org.orgId, {
				companyName: "Gamma Inc",
			});

			const draft = await createTestInvoice(ctx, org.orgId, alpha, {
				invoiceNumber: "INV-DRAFT",
				status: "draft",
				total: 500,
				dueDate: NOW - 2 * DAY_MS,
			});
			const sentFuture = await createTestInvoice(ctx, org.orgId, alpha, {
				invoiceNumber: "INV-SENT-FUTURE",
				status: "sent",
				total: 1000,
				dueDate: NOW + 10 * DAY_MS,
			});
			const sentOverdue = await createTestInvoice(ctx, org.orgId, beta, {
				invoiceNumber: "INV-SENT-OVERDUE",
				status: "sent",
				total: 2000,
				dueDate: NOW - 5 * DAY_MS,
			});
			const overdue = await createTestInvoice(ctx, org.orgId, beta, {
				invoiceNumber: "INV-OVERDUE",
				status: "overdue",
				total: 1500,
				dueDate: NOW - 20 * DAY_MS,
			});
			const paid = await createTestInvoice(ctx, org.orgId, gamma, {
				invoiceNumber: "INV-PAID",
				status: "paid",
				total: 800,
				dueDate: NOW - 60 * DAY_MS,
			});
			const refundRestored = await createTestInvoice(ctx, org.orgId, gamma, {
				invoiceNumber: "INV-REFUND-RESTORED",
				status: "paid",
				total: 1200,
				dueDate: NOW - 3 * DAY_MS,
			});
			const cancelled = await createTestInvoice(ctx, org.orgId, alpha, {
				invoiceNumber: "INV-CANCELLED",
				status: "cancelled",
				total: 900,
				dueDate: NOW - DAY_MS,
			});
			const paidOld = await createTestInvoice(ctx, org.orgId, beta, {
				invoiceNumber: "INV-PAID-OLD",
				status: "paid",
				total: 600,
				dueDate: NOW - 160 * DAY_MS,
			});

			const pSentFuture = await insertPayment(ctx, org.orgId, sentFuture, {
				paymentAmount: 300,
				status: "paid",
				paidAt: NOW - DAY_MS,
				manualMethod: "cash",
				recordedOutsidePortal: true,
			});
			const pOverdue = await insertPayment(ctx, org.orgId, overdue, {
				paymentAmount: 500,
				status: "paid",
				paidAt: NOW - 40 * DAY_MS,
			});
			const pPaid = await insertPayment(ctx, org.orgId, paid, {
				paymentAmount: 800,
				status: "paid",
				paidAt: NOW - 70 * DAY_MS,
			});
			const pRefundRestored = await insertPayment(
				ctx,
				org.orgId,
				refundRestored,
				{
					paymentAmount: 1200,
					status: "paid",
					paidAt: NOW - 2 * DAY_MS,
					refundedAmount: 400,
				}
			);
			const pCancelled = await insertPayment(ctx, org.orgId, cancelled, {
				paymentAmount: 900,
				status: "paid",
				paidAt: NOW - 3 * DAY_MS,
			});
			const pPaidOld = await insertPayment(ctx, org.orgId, paidOld, {
				paymentAmount: 600,
				status: "paid",
				paidAt: NOW - 150 * DAY_MS,
			});
			// Neither of these is settled money; both must stay out of the buckets.
			await insertPayment(ctx, org.orgId, sentOverdue, {
				paymentAmount: 100,
				status: "refunded",
				paidAt: NOW - 6 * DAY_MS,
			});
			await insertPayment(ctx, org.orgId, sentFuture, {
				paymentAmount: 700,
				status: "pending",
				dueDate: NOW + 10 * DAY_MS,
				sortOrder: 1,
			});

			await createTestQuote(ctx, org.orgId, alpha, {
				quoteNumber: "Q-DRAFT",
				status: "draft",
				total: 100,
			});
			const sentQuoteOld = await createTestQuote(ctx, org.orgId, beta, {
				quoteNumber: "Q-OLD",
				title: "Spring cleanup",
				status: "sent",
				total: 3000,
			});
			await ctx.db.patch(sentQuoteOld, { sentAt: NOW - 30 * DAY_MS });
			const sentQuoteNew = await createTestQuote(ctx, org.orgId, alpha, {
				quoteNumber: "Q-NEW",
				status: "sent",
				total: 2500,
			});
			await ctx.db.patch(sentQuoteNew, { sentAt: NOW - 10 * DAY_MS });
			await createTestQuote(ctx, org.orgId, gamma, {
				quoteNumber: "Q-APPROVED",
				status: "approved",
				total: 5000,
			});

			return {
				clerkUserId: org.clerkUserId,
				clerkOrgId: org.clerkOrgId,
				aliases: {
					[draft]: "invoice:draft",
					[sentFuture]: "invoice:sentFuture",
					[sentOverdue]: "invoice:sentOverdue",
					[overdue]: "invoice:overdue",
					[paid]: "invoice:paid",
					[refundRestored]: "invoice:refundRestored",
					[cancelled]: "invoice:cancelled",
					[paidOld]: "invoice:paidOld",
					[pSentFuture]: "payment:sentFuture",
					[pOverdue]: "payment:overdue",
					[pPaid]: "payment:paid",
					[pRefundRestored]: "payment:refundRestored",
					[pCancelled]: "payment:cancelled",
					[pPaidOld]: "payment:paidOld",
					[sentQuoteOld]: "quote:sentOld",
					[sentQuoteNew]: "quote:sentNew",
				} as Record<string, string>,
			};
		});

		const asUser = t.withIdentity(
			createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
		);
		const health = await asUser.query(api.businessHealth.get, {});

		const alias = (id: string) => seed.aliases[id] ?? id;
		const normalized = {
			...health,
			needsAttention: health.needsAttention.map((row) => ({
				...row,
				id: alias(row.id),
			})),
			recentPayments: health.recentPayments.map((row) => ({
				...row,
				id: alias(row.id),
				invoiceId: alias(row.invoiceId),
			})),
		};

		expect(normalized).toMatchInlineSnapshot(`
			{
			  "awaiting": {
			    "count": 2,
			    "total": 5500,
			  },
			  "collectedThisMonth": 2000,
			  "months": [
			    {
			      "label": "OCT",
			      "value": 600,
			    },
			    {
			      "label": "NOV",
			      "value": 0,
			    },
			    {
			      "label": "DEC",
			      "value": 0,
			    },
			    {
			      "label": "JAN",
			      "value": 800,
			    },
			    {
			      "label": "FEB",
			      "value": 500,
			    },
			    {
			      "label": "MAR",
			      "value": 2000,
			    },
			  ],
			  "needsAttention": [
			    {
			      "amount": 1000,
			      "clientName": "Beta LLC",
			      "dueDate": 1771848000000,
			      "id": "invoice:overdue",
			      "kind": "invoice",
			      "label": "Invoice #INV-OVERDUE",
			    },
			    {
			      "amount": 2000,
			      "clientName": "Beta LLC",
			      "dueDate": 1773144000000,
			      "id": "invoice:sentOverdue",
			      "kind": "invoice",
			      "label": "Invoice #INV-SENT-OVERDUE",
			    },
			    {
			      "amount": 400,
			      "clientName": "Gamma Inc",
			      "dueDate": 1773316800000,
			      "id": "invoice:refundRestored",
			      "kind": "invoice",
			      "label": "Invoice #INV-REFUND-RESTORED",
			    },
			    {
			      "amount": 3000,
			      "clientName": "Beta LLC",
			      "id": "quote:sentOld",
			      "kind": "quote",
			      "label": "Quote #Q-OLD — Spring cleanup",
			      "sentAt": 1770984000000,
			    },
			    {
			      "amount": 2500,
			      "clientName": "Alpha Co",
			      "id": "quote:sentNew",
			      "kind": "quote",
			      "label": "Quote #Q-NEW — Test Quote",
			      "sentAt": 1772712000000,
			    },
			  ],
			  "outstanding": {
			    "invoiceCount": 4,
			    "overdue": 3400,
			    "total": 4100,
			  },
			  "recentPayments": [
			    {
			      "amount": 300,
			      "clientName": "Alpha Co",
			      "id": "payment:sentFuture",
			      "invoiceId": "invoice:sentFuture",
			      "method": "cash",
			      "paidAt": 1773489600000,
			    },
			    {
			      "amount": 1200,
			      "clientName": "Gamma Inc",
			      "id": "payment:refundRestored",
			      "invoiceId": "invoice:refundRestored",
			      "method": "card",
			      "paidAt": 1773403200000,
			    },
			    {
			      "amount": 900,
			      "clientName": "Alpha Co",
			      "id": "payment:cancelled",
			      "invoiceId": "invoice:cancelled",
			      "method": "card",
			      "paidAt": 1773316800000,
			    },
			    {
			      "amount": 500,
			      "clientName": "Beta LLC",
			      "id": "payment:overdue",
			      "invoiceId": "invoice:overdue",
			      "method": "card",
			      "paidAt": 1770120000000,
			    },
			    {
			      "amount": 800,
			      "clientName": "Gamma Inc",
			      "id": "payment:paid",
			      "invoiceId": "invoice:paid",
			      "method": "card",
			      "paidAt": 1767528000000,
			    },
			  ],
			}
		`);
	});
});
