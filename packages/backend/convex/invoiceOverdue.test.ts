import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
	createTestInvoice,
} from "./test.helpers";
import { ORG_FLIP_CAP } from "./invoiceOverdue";

const DAY = 24 * 60 * 60 * 1000;
// 06:00 UTC = 01:00 America/New_York (EST, the sweep hour) and 00:00
// America/Chicago (CST, an hour short of it).
const NOW = new Date("2026-01-15T06:00:00Z").getTime();
/** UTC midnight of the calendar day it is in New York at NOW — how dueDate is stored. */
const TODAY = Date.UTC(2026, 0, 15);

describe("invoice overdue sweep", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	type SeededOrg = Awaited<ReturnType<typeof seedOrg>>;

	async function seedOrg(suffix: string, timezone: string) {
		const seed = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: `user_${suffix}`,
				clerkOrgId: `org_${suffix}`,
				userEmail: `${suffix}@example.com`,
			});
			await ctx.db.patch(org.orgId, { timezone });
			const clientId = await createTestClient(ctx, org.orgId);
			await ctx.db.patch(clientId, { portalAccessId: `portal-${suffix}` });
			await createTestClientContact(ctx, org.orgId, clientId, {
				isPrimary: true,
				email: `contact-${suffix}@example.com`,
			});
			return { ...org, clientId };
		});
		return {
			...seed,
			asUser: t.withIdentity(
				createTestIdentity(seed.clerkUserId, seed.clerkOrgId)
			),
		};
	}

	async function createInvoice(
		org: SeededOrg,
		opts: { number: string; dueDate: number; send: boolean }
	): Promise<Id<"invoices">> {
		const invoiceId = await org.asUser.mutation(api.invoices.create, {
			clientId: org.clientId,
			invoiceNumber: opts.number,
			subtotal: 100,
			total: 100,
			status: "draft",
			issuedDate: opts.dueDate - DAY,
			dueDate: opts.dueDate,
		});
		if (opts.send) {
			// The status flip, not the email, is what the sweep reads — and it
			// debits the send meter and stamps firstSentAt exactly like
			// sendToClient does, without scheduling the email and PDF hops.
			await org.asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "sent",
			});
		}
		return invoiceId;
	}

	const statusOf = (id: Id<"invoices">) =>
		t.run(async (ctx) => (await ctx.db.get(id))?.status);

	const sweepEvents = () =>
		t.run(async (ctx) =>
			(await ctx.db.query("domainEvents").collect()).filter(
				(e) => e.eventSource === "invoices.overdueSweep"
			)
		);

	const overdueNotifications = (orgId: Id<"organizations">) =>
		t.run(async (ctx) =>
			(await ctx.db.query("notifications").collect()).filter(
				(n) => n.orgId === orgId && n.notificationType === "invoice_overdue"
			)
		);

	const clientSendsUsed = (orgId: Id<"organizations">) =>
		t.run(async (ctx) => {
			const rows = (await ctx.db.query("planUsage").collect()).filter(
				(r) => r.orgId === orgId && r.meter === "clientSends"
			);
			return rows.reduce((sum, row) => sum + row.used, 0);
		});

	const sweepOrg = (orgId: Id<"organizations">) =>
		t.mutation(internal.invoiceOverdue.sweepOrgOverdueInvoices, { orgId });

	it("flips a past-due sent invoice, emits, notifies the owner, and leaves the send meter alone", async () => {
		const org = await seedOrg("a", "America/New_York");
		const invoiceId = await createInvoice(org, {
			number: "INV-001",
			dueDate: TODAY - 3 * DAY,
			send: true,
		});

		const before = await t.run(async (ctx) => ctx.db.get(invoiceId));
		expect(before?.status).toBe("sent");
		expect(before?.firstSentAt).toBeDefined();
		const usedBefore = await clientSendsUsed(org.orgId);
		expect(usedBefore).toBe(1);

		expect(await sweepOrg(org.orgId)).toEqual({ flipped: 1, announced: 1 });

		const after = await t.run(async (ctx) => ctx.db.get(invoiceId));
		expect(after?.status).toBe("overdue");
		// The immutable send-debit key must survive the ageing flip untouched.
		expect(after?.firstSentAt).toBe(before?.firstSentAt);

		const events = await sweepEvents();
		expect(events).toHaveLength(1);
		expect(events[0].payload).toMatchObject({
			entityType: "invoice",
			entityId: invoiceId,
			oldValue: "sent",
			newValue: "overdue",
		});

		const notifications = await overdueNotifications(org.orgId);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			userId: org.userId,
			entityType: "invoice",
			entityId: invoiceId,
			isRead: false,
			sentVia: "in_app",
		});

		expect(await clientSendsUsed(org.orgId)).toBe(usedBefore);
	});

	it("leaves an invoice due today alone in a zone west of UTC", async () => {
		// Regression: dueDate stores UTC midnight of the calendar day, so at
		// 01:00 EST (06:00 UTC) comparing it to Date.now() reads a due-today
		// invoice as six hours late and flips it a day early.
		const org = await seedOrg("a", "America/New_York");
		const dueToday = await createInvoice(org, {
			number: "INV-TODAY",
			dueDate: TODAY,
			send: true,
		});
		const dueYesterday = await createInvoice(org, {
			number: "INV-YESTERDAY",
			dueDate: TODAY - DAY,
			send: true,
		});

		expect(await sweepOrg(org.orgId)).toEqual({ flipped: 1, announced: 1 });

		expect(await statusOf(dueToday)).toBe("sent");
		expect(await statusOf(dueYesterday)).toBe("overdue");
	});

	it("skips drafts, not-yet-due sent invoices, and other orgs", async () => {
		const org = await seedOrg("a", "America/New_York");
		const other = await seedOrg("b", "America/New_York");

		const draftId = await createInvoice(org, {
			number: "INV-DRAFT",
			dueDate: TODAY - 3 * DAY,
			send: false,
		});
		const futureId = await createInvoice(org, {
			number: "INV-FUTURE",
			dueDate: TODAY + 3 * DAY,
			send: true,
		});
		const otherOrgId = await createInvoice(other, {
			number: "INV-OTHER",
			dueDate: TODAY - 3 * DAY,
			send: true,
		});

		expect(await sweepOrg(org.orgId)).toEqual({ flipped: 0, announced: 0 });

		expect(await statusOf(draftId)).toBe("draft");
		expect(await statusOf(futureId)).toBe("sent");
		expect(await statusOf(otherOrgId)).toBe("sent");
		expect(await sweepEvents()).toHaveLength(0);
		expect(await overdueNotifications(org.orgId)).toHaveLength(0);
	});

	it("is idempotent across runs", async () => {
		const org = await seedOrg("a", "America/New_York");
		await createInvoice(org, {
			number: "INV-001",
			dueDate: TODAY - 3 * DAY,
			send: true,
		});

		await sweepOrg(org.orgId);
		expect(await sweepOrg(org.orgId)).toEqual({ flipped: 0, announced: 0 });

		expect(await sweepEvents()).toHaveLength(1);
		expect(await overdueNotifications(org.orgId)).toHaveLength(1);
	});

	describe("grace window", () => {
		it("announces an invoice that went overdue exactly at the edge of the window", async () => {
			const org = await seedOrg("a", "America/New_York");
			await createInvoice(org, {
				number: "INV-EDGE",
				dueDate: TODAY - 7 * DAY,
				send: true,
			});

			expect(await sweepOrg(org.orgId)).toEqual({ flipped: 1, announced: 1 });
			expect(await sweepEvents()).toHaveLength(1);
			expect(await overdueNotifications(org.orgId)).toHaveLength(1);
		});

		it("flips an older backlog silently, so the first run after deploy can't storm", async () => {
			const org = await seedOrg("a", "America/New_York");
			const staleId = await createInvoice(org, {
				number: "INV-STALE",
				dueDate: TODAY - 8 * DAY,
				send: true,
			});

			expect(await sweepOrg(org.orgId)).toEqual({ flipped: 1, announced: 0 });

			expect(await statusOf(staleId)).toBe("overdue");
			expect(await sweepEvents()).toHaveLength(0);
			expect(await overdueNotifications(org.orgId)).toHaveLength(0);
		});

		it("a backlog past the flip cap can't delay a freshly-due invoice out of the window", async () => {
			const org = await seedOrg("a", "America/New_York");
			// One full cap's worth of long-dead invoices, oldest first. Taking the
			// range ascending would spend the whole run on these and leave the
			// fresh one queued until it too aged past the grace window.
			const freshId = await t.run(async (ctx) => {
				for (let i = 0; i < ORG_FLIP_CAP; i++) {
					await createTestInvoice(ctx, org.orgId, org.clientId, {
						invoiceNumber: `INV-OLD-${i}`,
						status: "sent",
						dueDate: TODAY - (100 + i) * DAY,
						firstSentAt: TODAY - (101 + i) * DAY,
					});
				}
				return createTestInvoice(ctx, org.orgId, org.clientId, {
					invoiceNumber: "INV-FRESH",
					status: "sent",
					dueDate: TODAY - DAY,
					firstSentAt: TODAY - 2 * DAY,
				});
			});

			expect(await sweepOrg(org.orgId)).toEqual({
				flipped: ORG_FLIP_CAP,
				announced: 1,
			});

			expect(await statusOf(freshId)).toBe("overdue");
			const notifications = await overdueNotifications(org.orgId);
			expect(notifications).toHaveLength(1);
			expect(notifications[0].entityId).toBe(freshId);
		});
	});

	it("only sweeps orgs whose local clock reads the sweep hour", async () => {
		const eastern = await seedOrg("a", "America/New_York"); // 01:00 local
		const central = await seedOrg("b", "America/Chicago"); // 00:00 local

		const easternInvoice = await createInvoice(eastern, {
			number: "INV-EAST",
			dueDate: TODAY - 3 * DAY,
			send: true,
		});
		const centralInvoice = await createInvoice(central, {
			number: "INV-CENTRAL",
			dueDate: TODAY - 3 * DAY,
			send: true,
		});

		const dispatch = await t.mutation(
			internal.invoiceOverdue.sweepOverdueInvoices,
			{}
		);
		expect(dispatch).toMatchObject({ dispatched: 1, isDone: true });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await statusOf(easternInvoice)).toBe("overdue");
		expect(await statusOf(centralInvoice)).toBe("sent");
	});

	it("honors the start instant on a continuation that crosses the hour", async () => {
		// Stands in for a paginated run whose later pages land after 01:59:
		// re-reading the clock there would skip every org on those pages.
		const org = await seedOrg("a", "America/New_York");
		const invoiceId = await createInvoice(org, {
			number: "INV-EAST",
			dueDate: TODAY - 3 * DAY,
			send: true,
		});

		vi.setSystemTime(NOW + 60 * 60 * 1000);
		const dispatch = await t.mutation(
			internal.invoiceOverdue.sweepOverdueInvoices,
			{ now: NOW }
		);
		expect(dispatch).toMatchObject({ dispatched: 1 });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await statusOf(invoiceId)).toBe("overdue");
	});
});
