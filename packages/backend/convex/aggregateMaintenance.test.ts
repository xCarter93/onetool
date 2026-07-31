import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
	invoiceCountsAggregate,
} from "./aggregates";
import { dollarsToCents } from "./lib/money";

/**
 * Regression coverage for aggregate maintenance on write paths that patch or
 * delete documents keyed by an aggregate.
 *
 * `invoiceRevenueAggregate` / `invoiceCountsAggregate` sort on
 * [status, paidAt || 0]; `quoteCountsAggregate` on [status, approvedAt || 0].
 * A write path that patches status/paidAt (or deletes a row) without calling
 * the matching AggregateHelpers leaves a phantom entry under the OLD key, so
 * aggregate-backed home stats silently drift. Every assertion below reads the
 * aggregate itself — never ctx.db — so dropping an AggregateHelpers call makes
 * these tests fail with concrete wrong numbers.
 *
 * Covered write paths:
 *  1. invoices.markPaid                         (workspace "Mark as Paid")
 *  2. invoices.markInvoicePaidFromWebhookInternal (Stripe checkout.session)
 *  3. lib/payments.updateInvoiceStatusIfFullyPaid (portal payment-intent)
 *  4. boldsign.handleQuoteStatusUpdate           (e-sign quote transitions)
 *  5. clients.permanentlyDelete / projects.remove cascades
 *
 * NOTE: every tracked row is created through the real Convex mutations —
 * direct db.insert does NOT seed aggregates and would make these vacuous.
 */

type SeedCtx = Parameters<
	Parameters<ReturnType<typeof convexTest>["run"]>[0]
>[0];

const DAY = 24 * 60 * 60 * 1000;

describe("aggregate maintenance", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// ---------------------------------------------------------------- readers
	// All reads go straight at the aggregate btree (same call shape
	// homeStats.getHomeStats uses), so nothing here can be satisfied
	// by the documents table alone.

	const invoiceRevenueFor = (orgId: Id<"organizations">, status: string) =>
		t.run((ctx) =>
			invoiceRevenueAggregate.sum(ctx, {
				namespace: orgId,
				bounds: { prefix: [status] },
			})
		);

	const invoiceCountFor = (orgId: Id<"organizations">, status: string) =>
		t.run((ctx) =>
			invoiceCountsAggregate.count(ctx, {
				namespace: orgId,
				bounds: { prefix: [status] },
			})
		);

	const quoteValueFor = (orgId: Id<"organizations">, status: string) =>
		t.run((ctx) =>
			quoteCountsAggregate.sum(ctx, {
				namespace: orgId,
				bounds: { prefix: [status] },
			})
		);

	const quoteCountFor = (orgId: Id<"organizations">, status: string) =>
		t.run((ctx) =>
			quoteCountsAggregate.count(ctx, {
				namespace: orgId,
				bounds: { prefix: [status] },
			})
		);

	const totalInvoiceCount = (orgId: Id<"organizations">) =>
		t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }));

	const totalInvoiceRevenue = (orgId: Id<"organizations">) =>
		t.run((ctx) => invoiceRevenueAggregate.sum(ctx, { namespace: orgId }));

	const totalQuoteCount = (orgId: Id<"organizations">) =>
		t.run((ctx) => quoteCountsAggregate.count(ctx, { namespace: orgId }));

	const totalQuoteValue = (orgId: Id<"organizations">) =>
		t.run((ctx) => quoteCountsAggregate.sum(ctx, { namespace: orgId }));

	const totalProjectCount = (orgId: Id<"organizations">) =>
		t.run((ctx) => projectCountsAggregate.count(ctx, { namespace: orgId }));

	const totalClientCount = (orgId: Id<"organizations">) =>
		t.run((ctx) => clientCountsAggregate.count(ctx, { namespace: orgId }));

	// ------------------------------------------------------------- seed utils

	async function seedOrg(suffix: string) {
		const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_agg_${suffix}`,
				clerkOrgId: `org_agg_${suffix}`,
			})
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { orgId, asUser };
	}

	/** Client created through the real mutation so clientCountsAggregate is seeded. */
	async function createClientViaApi(
		asUser: ReturnType<typeof t.withIdentity>,
		companyName: string
	): Promise<Id<"clients">> {
		return await asUser.mutation(api.clients.create, {
			companyName,
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});
	}

	/** Invoice created through the real mutation so both invoice aggregates are seeded. */
	async function createInvoiceViaApi(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		opts: {
			invoiceNumber: string;
			total: number;
			status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
			projectId?: Id<"projects">;
		}
	): Promise<Id<"invoices">> {
		const now = Date.now();
		return await asUser.mutation(api.invoices.create, {
			clientId,
			projectId: opts.projectId,
			invoiceNumber: opts.invoiceNumber,
			subtotal: opts.total,
			taxAmount: 0,
			total: opts.total,
			status: opts.status,
			issuedDate: now,
			dueDate: now + 30 * DAY,
		});
	}

	// =====================================================================
	// 1. invoices.markPaid — the workspace "Mark as Paid" button
	// =====================================================================

	describe("invoices.markPaid", () => {
		it("moves the invoice total from the sent range into the paid range", async () => {
			const { orgId, asUser } = await seedOrg("markpaid");
			const clientId = await createClientViaApi(asUser, "Aggregate Co");

			// Two sent invoices: only one gets paid, so the assertions below can
			// tell "aggregate updated" apart from "aggregate wiped".
			const paidInvoiceId = await createInvoiceViaApi(asUser, clientId, {
				invoiceNumber: "INV-AGG-PAID",
				total: 1234.56,
				status: "sent",
			});
			await createInvoiceViaApi(asUser, clientId, {
				invoiceNumber: "INV-AGG-STAYS-SENT",
				total: 500,
				status: "sent",
			});

			// Pre-state: both invoices sit in the "sent" range, nothing is paid.
			expect(await invoiceRevenueFor(orgId, "sent")).toBeCloseTo(1734.56, 6);
			expect(await invoiceCountFor(orgId, "sent")).toBe(2);
			expect(await invoiceRevenueFor(orgId, "paid")).toBe(0);
			expect(await invoiceCountFor(orgId, "paid")).toBe(0);

			// Window used by homeStats for "revenue this month".
			const thisMonthStart = (() => {
				const d = new Date();
				d.setDate(1);
				d.setHours(0, 0, 0, 0);
				return d.getTime();
			})();

			await asUser.mutation(api.invoices.markPaid, {
				id: paidInvoiceId,
				paymentMethod: "cash",
			});

			// The paid invoice left the sent range entirely...
			expect(await invoiceRevenueFor(orgId, "sent")).toBe(500);
			expect(await invoiceCountFor(orgId, "sent")).toBe(1);

			// ...and landed in the paid range with its exact total.
			expect(await invoiceRevenueFor(orgId, "paid")).toBeCloseTo(1234.56, 6);
			expect(await invoiceCountFor(orgId, "paid")).toBe(1);

			// And it is keyed on a real paidAt, i.e. it counts toward this month's
			// revenue goal rather than sitting at the [paid, 0] sentinel key.
			const revenueThisMonth = await t.run((ctx) =>
				invoiceRevenueAggregate.sum(ctx, {
					namespace: orgId,
					bounds: {
						lower: { key: ["paid", thisMonthStart], inclusive: true },
						upper: { key: ["paid", Date.now()], inclusive: true },
					},
				})
			);
			expect(revenueThisMonth).toBeCloseTo(1234.56, 6);

			// Total tracked value is unchanged — this was a move, not a rewrite.
			expect(await totalInvoiceRevenue(orgId)).toBeCloseTo(1734.56, 6);
			expect(await totalInvoiceCount(orgId)).toBe(2);
		});
	});

	// =====================================================================
	// 2. Stripe checkout.session.completed webhook
	// =====================================================================

	describe("invoices.markInvoicePaidFromWebhookInternal", () => {
		it("re-keys the invoice into the paid range on a Stripe checkout webhook", async () => {
			const { orgId, asUser } = await seedOrg("webhook");
			const clientId = await createClientViaApi(asUser, "Webhook Co");
			const invoiceId = await createInvoiceViaApi(asUser, clientId, {
				invoiceNumber: "INV-AGG-WEBHOOK",
				total: 800,
				status: "sent",
			});

			// publicToken is not part of the aggregate key, so patching it here
			// cannot mask a missing aggregate update.
			const publicToken = "tok_agg_webhook";
			await t.run((ctx) => ctx.db.patch(invoiceId, { publicToken }));

			expect(await invoiceRevenueFor(orgId, "sent")).toBe(800);
			expect(await invoiceRevenueFor(orgId, "paid")).toBe(0);

			await t.mutation(internal.invoices.markInvoicePaidFromWebhookInternal, {
				orgId,
				sessionId: "cs_test_agg_1",
				amountTotal: dollarsToCents(800),
				metadata: { publicToken },
				paymentIntentId: "pi_test_agg_1",
			});

			expect(await invoiceRevenueFor(orgId, "sent")).toBe(0);
			expect(await invoiceCountFor(orgId, "sent")).toBe(0);
			expect(await invoiceRevenueFor(orgId, "paid")).toBe(800);
			expect(await invoiceCountFor(orgId, "paid")).toBe(1);
		});
	});

	// =====================================================================
	// 3. Portal / payment-intent path (lib/payments.updateInvoiceStatusIfFullyPaid)
	// =====================================================================

	describe("updateInvoiceStatusIfFullyPaid", () => {
		it("re-keys the invoice when the final installment settles", async () => {
			const { orgId, asUser } = await seedOrg("portal");
			const clientId = await createClientViaApi(asUser, "Portal Co");
			const invoiceId = await createInvoiceViaApi(asUser, clientId, {
				invoiceNumber: "INV-AGG-PORTAL",
				total: 640,
				status: "sent",
			});

			// payments rows are not aggregate-tracked, so seeding one directly is
			// safe (the invoice itself was created through the real mutation).
			const publicToken = "tok_agg_portal";
			await t.run(async (ctx: SeedCtx) => {
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 640,
					dueDate: Date.now() + 7 * DAY,
					sortOrder: 0,
					status: "sent",
					publicToken,
				});
			});

			expect(await invoiceRevenueFor(orgId, "sent")).toBe(640);
			expect(await invoiceRevenueFor(orgId, "paid")).toBe(0);

			await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken,
				stripePaymentIntentId: "pi_test_agg_portal",
				source: "confirm",
			});

			expect(await invoiceRevenueFor(orgId, "sent")).toBe(0);
			expect(await invoiceCountFor(orgId, "sent")).toBe(0);
			expect(await invoiceRevenueFor(orgId, "paid")).toBe(640);
			expect(await invoiceCountFor(orgId, "paid")).toBe(1);
		});
	});

	// =====================================================================
	// 4. BoldSign e-sign quote transitions
	// =====================================================================

	describe("boldsign quote status transitions", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("re-keys the quote from sent to approved on a Completed webhook", async () => {
			const { orgId, asUser } = await seedOrg("boldsign");
			const clientId = await createClientViaApi(asUser, "Esign Co");

			// Quote created through the real mutation so quoteCountsAggregate is seeded.
			const quoteId = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Aggregate Quote",
				quoteNumber: "Q-AGG-ESIGN",
				status: "sent",
				subtotal: 2500,
				taxAmount: 0,
				total: 2500,
			});

			const boldsignDocumentId = "bs_agg_completed";
			await t.run(async (ctx: SeedCtx) => {
				const storageId = await ctx.storage.store(
					new Blob(["pdf"], { type: "application/pdf" })
				);
				await ctx.db.insert("documents", {
					orgId,
					documentType: "quote",
					documentId: quoteId,
					storageId,
					generatedAt: Date.now(),
					version: 1,
					boldsignDocumentId,
					boldsign: {
						documentId: boldsignDocumentId,
						status: "Sent",
						sentTo: [],
					},
				});
			});

			expect(await quoteValueFor(orgId, "sent")).toBe(2500);
			expect(await quoteCountFor(orgId, "sent")).toBe(1);
			expect(await quoteValueFor(orgId, "approved")).toBe(0);

			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId,
				eventType: "Completed",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect(await quoteValueFor(orgId, "sent")).toBe(0);
			expect(await quoteCountFor(orgId, "sent")).toBe(0);
			expect(await quoteValueFor(orgId, "approved")).toBe(2500);
			expect(await quoteCountFor(orgId, "approved")).toBe(1);
			// One quote in, one quote out — no phantom duplicate under the old key.
			expect(await totalQuoteCount(orgId)).toBe(1);
			expect(await totalQuoteValue(orgId)).toBe(2500);
		});
	});

	// =====================================================================
	// 5. Cascade deletes
	// =====================================================================

	describe("cascade deletes", () => {
		it("clients.permanentlyDelete drops child project/quote/invoice aggregate entries", async () => {
			const { orgId, asUser } = await seedOrg("clientcascade");

			// Pre-creation baseline: every aggregate in this namespace is empty.
			expect(await totalClientCount(orgId)).toBe(0);
			expect(await totalProjectCount(orgId)).toBe(0);
			expect(await totalQuoteCount(orgId)).toBe(0);
			expect(await totalInvoiceCount(orgId)).toBe(0);
			expect(await totalInvoiceRevenue(orgId)).toBe(0);

			const clientId = await createClientViaApi(asUser, "Cascade Co");
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Cascade Project",
				status: "planned",
				projectType: "one-off",
			});
			await asUser.mutation(api.quotes.create, {
				clientId,
				projectId,
				title: "Cascade Quote",
				quoteNumber: "Q-AGG-CASCADE",
				status: "approved",
				subtotal: 3200,
				taxAmount: 0,
				total: 3200,
			});
			await createInvoiceViaApi(asUser, clientId, {
				invoiceNumber: "INV-AGG-CASCADE",
				total: 1500,
				status: "sent",
				projectId,
			});

			// Post-creation: exact seeded values.
			expect(await totalClientCount(orgId)).toBe(1);
			expect(await totalProjectCount(orgId)).toBe(1);
			expect(await totalQuoteCount(orgId)).toBe(1);
			expect(await totalQuoteValue(orgId)).toBe(3200);
			expect(await totalInvoiceCount(orgId)).toBe(1);
			expect(await totalInvoiceRevenue(orgId)).toBe(1500);
			expect(await invoiceRevenueFor(orgId, "sent")).toBe(1500);
			expect(await quoteValueFor(orgId, "approved")).toBe(3200);

			// permanentlyDelete only accepts archived clients; clients.remove archives.
			// Archiving does not touch any aggregate key (clientCounts sorts on
			// _creationTime), so the counts above still hold going into the delete.
			await asUser.mutation(api.clients.remove, { id: clientId });
			expect(await totalClientCount(orgId)).toBe(1);

			await asUser.mutation(api.clients.permanentlyDelete, { id: clientId });

			// Every aggregate returns to its pre-creation value — a cascade that
			// deletes rows without AggregateHelpers leaves phantom entries here.
			expect(await totalClientCount(orgId)).toBe(0);
			expect(await totalProjectCount(orgId)).toBe(0);
			expect(await totalQuoteCount(orgId)).toBe(0);
			expect(await totalQuoteValue(orgId)).toBe(0);
			expect(await totalInvoiceCount(orgId)).toBe(0);
			expect(await totalInvoiceRevenue(orgId)).toBe(0);
			expect(await invoiceRevenueFor(orgId, "sent")).toBe(0);
			expect(await quoteValueFor(orgId, "approved")).toBe(0);
		});

		it("projects.remove drops child quote/invoice aggregate entries but leaves the client", async () => {
			const { orgId, asUser } = await seedOrg("projectcascade");
			const clientId = await createClientViaApi(asUser, "Project Cascade Co");
			const projectId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Doomed Project",
				status: "planned",
				projectType: "one-off",
			});
			await asUser.mutation(api.quotes.create, {
				clientId,
				projectId,
				title: "Doomed Quote",
				quoteNumber: "Q-AGG-PROJ",
				status: "sent",
				subtotal: 900,
				taxAmount: 0,
				total: 900,
			});
			await createInvoiceViaApi(asUser, clientId, {
				invoiceNumber: "INV-AGG-PROJ",
				total: 2100,
				status: "sent",
				projectId,
			});

			expect(await totalProjectCount(orgId)).toBe(1);
			expect(await totalQuoteValue(orgId)).toBe(900);
			expect(await totalInvoiceRevenue(orgId)).toBe(2100);
			expect(await totalInvoiceCount(orgId)).toBe(1);

			await asUser.mutation(api.projects.remove, { id: projectId });

			expect(await totalProjectCount(orgId)).toBe(0);
			expect(await totalQuoteCount(orgId)).toBe(0);
			expect(await totalQuoteValue(orgId)).toBe(0);
			expect(await totalInvoiceCount(orgId)).toBe(0);
			expect(await totalInvoiceRevenue(orgId)).toBe(0);
			expect(await invoiceRevenueFor(orgId, "sent")).toBe(0);
			// The client survives the project cascade.
			expect(await totalClientCount(orgId)).toBe(1);
		});
	});
});
