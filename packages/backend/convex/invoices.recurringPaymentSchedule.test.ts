import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
} from "./test.helpers";

describe("recurring invoice payment schedules", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-07T17:00:00Z"));
	});

	it("materializes the approved relative rule once on first send", async () => {
		const seeded = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			await ctx.db.patch(org.orgId, { timezone: "America/New_York" });
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				status: "draft",
				total: 100,
			});
			await ctx.db.patch(invoiceId, {
				recurringPaymentRule: {
					type: "percentage",
					installments: [
						{ percentage: 50, dayOffset: 0 },
						{ percentage: 50, dayOffset: 30 },
					],
				},
			});
			return { ...org, clientId, invoiceId };
		});
		const asUser = t.withIdentity(
			createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId),
		);
		await asUser.mutation(api.invoices.update, {
			id: seeded.invoiceId,
			status: "sent",
		});

		const first = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(seeded.invoiceId),
			payments: await ctx.db
				.query("payments")
				.collect(),
		}));
		expect(first.payments.map((row) => row.paymentAmount)).toEqual([50, 50]);
		expect(first.payments.map((row) => row.dueDate)).toEqual([
			Date.UTC(2026, 2, 7),
			Date.UTC(2026, 3, 6),
		]);
		expect(first.invoice?.paymentScheduleAnchorAt).toBe(Date.now());

		await asUser.mutation(api.invoices.update, {
			id: seeded.invoiceId,
			status: "draft",
		});
		vi.setSystemTime(new Date("2026-03-20T17:00:00Z"));
		await asUser.mutation(api.invoices.update, {
			id: seeded.invoiceId,
			status: "sent",
		});
		const resent = await t.run((ctx) =>
			ctx.db
				.query("payments")
				.collect(),
		);
		expect(resent.map((row) => row.dueDate)).toEqual(
			first.payments.map((row) => row.dueDate),
		);
	});

	it("preserves an owner-set invoice due date as a custom full-payment schedule", async () => {
		const seeded = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, { status: "draft", total: 100 });
			await ctx.db.patch(invoiceId, {
				recurringPaymentRule: { type: "percentage", installments: [{ percentage: 50, dayOffset: 0 }, { percentage: 50, dayOffset: 30 }] },
			});
			return { ...org, invoiceId };
		});
		const asUser = t.withIdentity(createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId));
		const explicitDueDate = Date.UTC(2026, 4, 15);
		await asUser.mutation(api.invoices.update, { id: seeded.invoiceId, dueDate: explicitDueDate });
		await asUser.mutation(api.invoices.update, { id: seeded.invoiceId, status: "sent" });
		const result = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(seeded.invoiceId),
			payments: (await ctx.db.query("payments").collect()).filter((payment) => payment.invoiceId === seeded.invoiceId),
		}));
		expect(result.invoice).toMatchObject({ dueDate: explicitDueDate, paymentScheduleIsCustom: true });
		expect(result.invoice?.paymentScheduleAnchorAt).toBeUndefined();
		expect(result.payments).toHaveLength(1);
		expect(result.payments[0]).toMatchObject({ paymentAmount: 100, dueDate: explicitDueDate, description: "Full Payment" });
	});
});
