import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createPremiumTestIdentity, createTestOrg } from "./test.helpers";
import {
	buildQboCustomer,
	buildQboInvoice,
	buildQboPayment,
	deriveInvoiceAmounts,
	escapeQboQueryValue,
	toQboDate,
} from "./lib/quickbooksMappers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ============================================================================
// Mappers (pure)
// ============================================================================

function invoiceDoc(overrides: Partial<Doc<"invoices">> = {}): Doc<"invoices"> {
	return {
		_id: "inv1" as Id<"invoices">,
		_creationTime: 0,
		orgId: "org1" as Id<"organizations">,
		clientId: "cli1" as Id<"clients">,
		invoiceNumber: "INV-000123",
		status: "sent",
		subtotal: 100,
		total: 100,
		issuedDate: Date.UTC(2026, 0, 15),
		dueDate: Date.UTC(2026, 1, 15),
		...overrides,
	} as Doc<"invoices">;
}

function lineItem(
	description: string,
	quantity: number,
	unitPrice: number,
	total: number,
	sortOrder = 0
): Doc<"invoiceLineItems"> {
	return {
		_id: `li${sortOrder}` as Id<"invoiceLineItems">,
		_creationTime: 0,
		invoiceId: "inv1" as Id<"invoices">,
		orgId: "org1" as Id<"organizations">,
		description,
		quantity,
		unitPrice,
		total,
		sortOrder,
	} as Doc<"invoiceLineItems">;
}

describe("QuickBooks mappers", () => {
	it("toQboDate renders yyyy-MM-dd in UTC", () => {
		expect(toQboDate(Date.UTC(2026, 0, 5))).toBe("2026-01-05");
		expect(toQboDate(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12-31");
	});

	it("escapeQboQueryValue backslash-escapes quotes (QBO query syntax)", () => {
		expect(escapeQboQueryValue("O'Brien's Yard")).toBe("O\\'Brien\\'s Yard");
	});

	it("buildQboCustomer maps name, contact, and billing address", () => {
		const payload = buildQboCustomer({
			client: {
				companyName: "Acme Landscaping",
			} as Doc<"clients">,
			primaryContact: {
				firstName: "Dana",
				lastName: "Reed",
				email: "dana@acme.test",
				phone: "555-0100",
			} as Doc<"clientContacts">,
			billingAddress: {
				streetAddress: "1 Main St",
				city: "Austin",
				state: "TX",
				zipCode: "78701",
			} as Doc<"clientProperties">,
		});

		expect(payload).toMatchObject({
			DisplayName: "Acme Landscaping",
			GivenName: "Dana",
			FamilyName: "Reed",
			PrimaryEmailAddr: { Address: "dana@acme.test" },
			PrimaryPhone: { FreeFormNumber: "555-0100" },
			BillAddr: { Line1: "1 Main St", City: "Austin" },
		});
	});

	it("buildQboCustomer omits absent contact and address blocks", () => {
		const payload = buildQboCustomer({
			client: { companyName: "Solo Co" } as Doc<"clients">,
		});
		expect(payload.DisplayName).toBe("Solo Co");
		expect(payload.PrimaryEmailAddr).toBeUndefined();
		expect(payload.BillAddr).toBeUndefined();
	});

	it("deriveInvoiceAmounts treats a quote-mode percentage discount as a percent", () => {
		const lines = [lineItem("Work", 1, 200, 200)];
		const derived = deriveInvoiceAmounts(
			invoiceDoc({
				discountEnabled: true,
				discountAmount: 10, // 10 PERCENT, not $10
				discountType: "percentage",
				taxEnabled: true,
				taxRate: 10,
				subtotal: 200,
				total: 198,
			}),
			lines
		);
		expect(derived).toEqual({
			subtotal: 200,
			discount: 20,
			tax: 18,
			total: 198,
		});
	});

	it("deriveInvoiceAmounts keeps legacy dollar discounts flat", () => {
		const derived = deriveInvoiceAmounts(
			invoiceDoc({ discountAmount: 25, taxAmount: 5, total: 80 }),
			[lineItem("Work", 1, 100, 100)]
		);
		expect(derived).toEqual({
			subtotal: 100,
			discount: 25,
			tax: 5,
			total: 80,
		});
	});

	it("buildQboInvoice emits a dollar discount line for a percentage discount", () => {
		const payload = buildQboInvoice({
			invoice: invoiceDoc({
				discountEnabled: true,
				discountAmount: 10,
				discountType: "percentage",
				subtotal: 200,
				total: 180,
			}),
			lineItems: [lineItem("Work", 1, 200, 200)],
			customerQboId: "7",
			defaultServiceItemQboId: "9",
		});

		const discountLine = payload.Line.find(
			(line) => line.DetailType === "DiscountLineDetail"
		);
		expect(discountLine).toMatchObject({
			Amount: 20,
			DiscountLineDetail: { PercentBased: false },
		});
		expect(payload.DocNumber).toBe("INV-000123");
		expect(payload.TxnDate).toBe("2026-01-15");
		expect(payload.DueDate).toBe("2026-02-15");
	});

	it("buildQboInvoice reconciles per-line rounding against the stored total", () => {
		// 3 x $0.333 rounds to $0.33 per line ($0.99), but the stored total is $1.00.
		const lines = [
			lineItem("A", 1, 0.333, 0.33, 0),
			lineItem("B", 1, 0.333, 0.33, 1),
			lineItem("C", 1, 0.333, 0.33, 2),
		];
		const payload = buildQboInvoice({
			invoice: invoiceDoc({ subtotal: 0.99, total: 1 }),
			lineItems: lines,
			customerQboId: "7",
			defaultServiceItemQboId: "9",
		});

		const amounts = payload.Line.map((line) => line.Amount);
		expect(amounts).toEqual([0.33, 0.33, 0.34]);
		expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);

		// The adjusted line drops Qty/UnitPrice so QBO cannot recompute it away.
		const last = payload.Line[2];
		if (last.DetailType !== "SalesItemLineDetail") throw new Error("bad line");
		expect(last.SalesItemLineDetail.Qty).toBeUndefined();
		expect(last.SalesItemLineDetail.UnitPrice).toBeUndefined();
		const first = payload.Line[0];
		if (first.DetailType !== "SalesItemLineDetail") throw new Error("bad line");
		expect(first.SalesItemLineDetail.Qty).toBe(1);
	});

	it("buildQboInvoice sends TxnTaxDetail only when tax is charged", () => {
		const withTax = buildQboInvoice({
			invoice: invoiceDoc({ taxAmount: 8.25, total: 108.25 }),
			lineItems: [lineItem("Work", 1, 100, 100)],
			customerQboId: "7",
			defaultServiceItemQboId: "9",
		});
		expect(withTax.TxnTaxDetail).toEqual({ TotalTax: 8.25 });

		const withoutTax = buildQboInvoice({
			invoice: invoiceDoc(),
			lineItems: [lineItem("Work", 1, 100, 100)],
			customerQboId: "7",
			defaultServiceItemQboId: "9",
		});
		expect(withoutTax.TxnTaxDetail).toBeUndefined();
	});

	it("buildQboPayment links the payment to the invoice", () => {
		const payload = buildQboPayment({
			payment: {
				paymentAmount: 250.5,
				paidAt: Date.UTC(2026, 2, 3),
			} as Doc<"payments">,
			customerQboId: "7",
			invoiceQboId: "42",
			depositAccountQboId: "88",
		});
		expect(payload).toEqual({
			CustomerRef: { value: "7" },
			TotalAmt: 250.5,
			TxnDate: "2026-03-03",
			DepositToAccountRef: { value: "88" },
			Line: [
				{
					Amount: 250.5,
					LinkedTxn: [{ TxnId: "42", TxnType: "Invoice" }],
				},
			],
		});
	});
});

// ============================================================================
// Convex-backed behavior
// ============================================================================

describe("QuickBooks sync engine", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		// Fake timers keep scheduled processOrgJobs kicks from firing on their
		// own; every worker run in this file is invoked explicitly.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	async function setupOrg(suffix: string) {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `qbo_user_${suffix}`,
				clerkOrgId: `qbo_org_${suffix}`,
			})
		);
		const asOwner = t.withIdentity(
			createPremiumTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { org, asOwner };
	}

	async function connect(
		orgId: Id<"organizations">,
		overrides: Partial<Doc<"quickbooksConnections">> = {}
	) {
		await t.run(async (ctx) => {
			const existing = await ctx.db
				.query("quickbooksConnections")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, overrides);
				return;
			}
			const organization = await ctx.db.get(orgId);
			await ctx.db.insert("quickbooksConnections", {
				orgId,
				realmId: `realm_${orgId}`,
				environment: "sandbox",
				accessToken: "access_live",
				accessTokenExpiresAt: Date.now() + 10 * HOUR,
				refreshToken: "refresh_live",
				refreshTokenExpiresAt: Date.now() + 90 * DAY,
				status: "connected",
				connectedByUserId: organization!.ownerUserId,
				syncInvoicesOn: "sent",
				syncPayments: true,
				autoDisambiguateNames: true,
				...overrides,
			});
		});
	}

	async function jobsFor(orgId: Id<"organizations">) {
		return await t.run(async (ctx) =>
			ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) => q.eq("orgId", orgId))
				.collect()
		);
	}

	async function clearJobsOfType(
		orgId: Id<"organizations">,
		entityType: "client" | "invoice" | "payment" | "all"
	) {
		await t.run(async (ctx) => {
			const all = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_status", (q) => q.eq("orgId", orgId))
				.collect();
			for (const job of all) {
				if (entityType === "all" || job.entityType === entityType) {
					await ctx.db.delete(job._id);
				}
			}
		});
	}

	async function createInvoice(
		asOwner: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		status: "draft" | "sent" = "draft"
	) {
		const now = Date.now();
		return await asOwner.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: `INV-${Math.floor(Math.random() * 1_000_000)}`,
			status,
			subtotal: 100,
			total: 100,
			issuedDate: now,
			dueDate: now + 30 * DAY,
		});
	}

	// ------------------------------------------------------------------
	// Enqueue hook
	// ------------------------------------------------------------------

	describe("maybeEnqueueQboSync", () => {
		it("is a no-op when the org has no connection", async () => {
			const { org, asOwner } = await setupOrg("enq_none");
			await asOwner.mutation(api.clients.create, {
				companyName: "No Sync Co",
				status: "active",
			});
			expect(await jobsFor(org.orgId)).toHaveLength(0);
		});

		it("is a no-op when the connection is disconnected", async () => {
			const { org, asOwner } = await setupOrg("enq_dead");
			await connect(org.orgId, { status: "disconnected" });
			await asOwner.mutation(api.clients.create, {
				companyName: "Paused Co",
				status: "active",
			});
			expect(await jobsFor(org.orgId)).toHaveLength(0);
		});

		it("still queues while the connection needs reauth (drains on reconnect)", async () => {
			const { org, asOwner } = await setupOrg("enq_reauth");
			await connect(org.orgId, { status: "needs_reauth" });
			await asOwner.mutation(api.clients.create, {
				companyName: "Paused Co",
				status: "active",
			});
			const jobs = await jobsFor(org.orgId);
			expect(jobs).toHaveLength(1);
			expect(jobs[0]).toMatchObject({ entityType: "client", status: "pending" });
		});

		it("does not enqueue a cancelled invoice, even when linked", async () => {
			const { org, asOwner } = await setupOrg("enq_cancel");
			await connect(org.orgId, { defaultServiceItemQboId: "9" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "invoice",
				localId: invoiceId,
				qboId: "202",
				qboSyncToken: "0",
			});
			await clearJobsOfType(org.orgId, "all");

			await asOwner.mutation(api.invoices.update, {
				id: invoiceId,
				status: "cancelled",
			});

			expect(
				(await jobsFor(org.orgId)).filter((j) => j.entityType === "invoice")
			).toHaveLength(0);
		});

		it("enqueues a client job on create, even with setup incomplete", async () => {
			const { org, asOwner } = await setupOrg("enq_client");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});

			const jobs = await jobsFor(org.orgId);
			expect(jobs).toHaveLength(1);
			expect(jobs[0]).toMatchObject({
				entityType: "client",
				localId: clientId,
				operation: "upsert",
				status: "pending",
				attempts: 0,
				dedupeKey: `client:${clientId}`,
			});
		});

		it("collapses duplicate pending jobs on dedupeKey", async () => {
			const { org, asOwner } = await setupOrg("enq_dedupe");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await asOwner.mutation(api.clients.update, {
				id: clientId,
				companyName: "Acme Renamed",
			});
			await asOwner.mutation(api.clients.update, {
				id: clientId,
				notes: "again",
			});

			const jobs = await jobsFor(org.orgId);
			expect(jobs.filter((j) => j.entityType === "client")).toHaveLength(1);
		});

		it("skips draft invoices when syncInvoicesOn is 'sent'", async () => {
			const { org, asOwner } = await setupOrg("enq_draft_sent");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await createInvoice(asOwner, clientId, "draft");

			const jobs = await jobsFor(org.orgId);
			expect(jobs.filter((j) => j.entityType === "invoice")).toHaveLength(0);
		});

		it("enqueues draft invoices when syncInvoicesOn is 'created'", async () => {
			const { org, asOwner } = await setupOrg("enq_draft_created");
			await connect(org.orgId, { syncInvoicesOn: "created" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "draft");

			const jobs = await jobsFor(org.orgId);
			expect(jobs.find((j) => j.entityType === "invoice")?.localId).toBe(
				invoiceId
			);
		});

		it("enqueues on the draft to sent transition", async () => {
			const { org, asOwner } = await setupOrg("enq_sent");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "draft");
			expect(
				(await jobsFor(org.orgId)).filter((j) => j.entityType === "invoice")
			).toHaveLength(0);

			await asOwner.mutation(api.invoices.update, {
				id: invoiceId,
				status: "sent",
			});

			const jobs = await jobsFor(org.orgId);
			expect(jobs.find((j) => j.entityType === "invoice")?.localId).toBe(
				invoiceId
			);
		});

		it("enqueues invoice and payment jobs when an invoice is marked paid", async () => {
			const { org, asOwner } = await setupOrg("enq_paid");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			const paymentId = await asOwner.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 100,
				dueDate: Date.now() + DAY,
				description: "Full Payment",
				sortOrder: 0,
			});

			await asOwner.mutation(api.invoices.markPaid, { id: invoiceId });

			const jobs = await jobsFor(org.orgId);
			expect(jobs.find((j) => j.entityType === "invoice")?.localId).toBe(
				invoiceId
			);
			expect(jobs.find((j) => j.entityType === "payment")?.localId).toBe(
				paymentId
			);
		});

		it("skips payment jobs when syncPayments is off", async () => {
			const { org, asOwner } = await setupOrg("enq_nopay");
			await connect(org.orgId, { syncPayments: false });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			await asOwner.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 100,
				dueDate: Date.now() + DAY,
				description: "Full Payment",
				sortOrder: 0,
			});

			await asOwner.mutation(api.invoices.markPaid, { id: invoiceId });

			const jobs = await jobsFor(org.orgId);
			expect(jobs.filter((j) => j.entityType === "payment")).toHaveLength(0);
			expect(jobs.filter((j) => j.entityType === "invoice")).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------
	// Job state machine
	// ------------------------------------------------------------------

	describe("job state machine", () => {
		async function seedJob(
			orgId: Id<"organizations">,
			overrides: Partial<Doc<"quickbooksSyncJobs">> = {}
		): Promise<Id<"quickbooksSyncJobs">> {
			return await t.run(async (ctx) =>
				ctx.db.insert("quickbooksSyncJobs", {
					orgId,
					entityType: "client",
					localId: "local_1",
					operation: "upsert",
					status: "pending",
					attempts: 0,
					runAfter: Date.now(),
					dedupeKey: "client:local_1",
					...overrides,
				})
			);
		}

		it("claimDueJobs flips due jobs to processing and skips future ones", async () => {
			const { org } = await setupOrg("claim");
			const dueId = await seedJob(org.orgId);
			const futureId = await seedJob(org.orgId, {
				localId: "local_2",
				dedupeKey: "client:local_2",
				runAfter: Date.now() + HOUR,
			});

			const claimed = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId: org.orgId,
				limit: 10,
			});

			expect(claimed.map((job) => job._id)).toEqual([dueId]);
			const after = await t.run(async (ctx) => ({
				due: await ctx.db.get(dueId),
				future: await ctx.db.get(futureId),
			}));
			expect(after.due?.status).toBe("processing");
			expect(after.due?.claimedAt).toBeGreaterThan(0);
			expect(after.future?.status).toBe("pending");
		});

		it("claimDueJobs is exclusive: a second pass claims nothing", async () => {
			const { org } = await setupOrg("claim_twice");
			await seedJob(org.orgId);

			const first = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId: org.orgId,
				limit: 10,
			});
			const second = await t.mutation(internal.quickbooks.claimDueJobs, {
				orgId: org.orgId,
				limit: 10,
			});
			expect(first).toHaveLength(1);
			expect(second).toHaveLength(0);
		});

		it("markJobFailed retries with backoff, then parks terminally", async () => {
			const { org } = await setupOrg("fail");
			const jobId = await seedJob(org.orgId, { status: "processing" });
			const runAfter = Date.now() + 60_000;

			await t.mutation(internal.quickbooks.markJobFailed, {
				jobId,
				terminal: false,
				runAfter,
				lastError: "Rate limited",
				lastErrorCode: "429",
			});
			let job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job).toMatchObject({
				status: "pending",
				attempts: 1,
				runAfter,
				lastErrorCode: "429",
			});
			expect(job?.failedAt).toBeUndefined();

			await t.mutation(internal.quickbooks.markJobFailed, {
				jobId,
				terminal: true,
				lastError: "Closed accounting period",
				lastErrorCode: "6000",
			});
			job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job).toMatchObject({ status: "failed", attempts: 2 });
			expect(job?.failedAt).toBeGreaterThan(0);
		});

		it("releaseJob returns a claimed job without burning an attempt", async () => {
			const { org } = await setupOrg("release");
			const jobId = await seedJob(org.orgId, {
				status: "processing",
				attempts: 2,
				claimedAt: Date.now(),
			});
			const later = Date.now() + 15 * 60_000;

			await t.mutation(internal.quickbooks.releaseJob, {
				jobId,
				runAfter: later,
			});

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job).toMatchObject({
				status: "pending",
				attempts: 2,
				runAfter: later,
			});
			expect(job?.claimedAt).toBeUndefined();
		});

		it("reclaimStuckJobs rescues jobs abandoned in processing", async () => {
			const { org } = await setupOrg("reclaim");
			const staleId = await seedJob(org.orgId, {
				status: "processing",
				claimedAt: Date.now() - 30 * 60_000,
			});
			const freshId = await seedJob(org.orgId, {
				localId: "local_2",
				dedupeKey: "client:local_2",
				status: "processing",
				claimedAt: Date.now(),
			});

			const result = await t.mutation(internal.quickbooks.reclaimStuckJobs, {
				staleBeforeMs: Date.now() - 10 * 60_000,
			});

			expect(result.reclaimed).toBe(1);
			const after = await t.run(async (ctx) => ({
				stale: await ctx.db.get(staleId),
				fresh: await ctx.db.get(freshId),
			}));
			expect(after.stale?.status).toBe("pending");
			expect(after.fresh?.status).toBe("processing");
		});

		it("upsertEntityLink inserts then updates in place", async () => {
			const { org } = await setupOrg("link");
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "client",
				localId: "local_1",
				qboId: "42",
				qboSyncToken: "0",
				syncWarning: "something",
			});
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "client",
				localId: "local_1",
				qboId: "42",
				qboSyncToken: "1",
			});

			const links = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksEntityLinks")
					.withIndex("by_org_entity", (q) =>
						q
							.eq("orgId", org.orgId)
							.eq("entityType", "client")
							.eq("localId", "local_1")
					)
					.collect()
			);
			expect(links).toHaveLength(1);
			expect(links[0].qboSyncToken).toBe("1");
			expect(links[0].syncWarning).toBeUndefined();
		});
	});

	// ------------------------------------------------------------------
	// Public surface
	// ------------------------------------------------------------------

	describe("public surface", () => {
		it("getEntityLink returns the link with its warning, null when unconnected", async () => {
			const { org, asOwner } = await setupOrg("get_link");
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "client",
				localId: clientId,
				qboId: "42",
				qboSyncToken: "3",
				syncWarning: "QuickBooks adjusted the tax.",
			});

			// No connection yet.
			expect(
				await asOwner.query(api.quickbooks.getEntityLink, {
					entityType: "client",
					localId: clientId,
				})
			).toBeNull();

			await connect(org.orgId);
			const link = await asOwner.query(api.quickbooks.getEntityLink, {
				entityType: "client",
				localId: clientId,
			});
			expect(link).toMatchObject({
				qboId: "42",
				syncWarning: "QuickBooks adjusted the tax.",
			});
			expect(link?.lastSyncedAt).toBeGreaterThan(0);
		});

		it("listSyncErrors labels rows and tolerates deleted entities", async () => {
			const { org, asOwner } = await setupOrg("errors");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await t.run(async (ctx) => {
				await ctx.db.insert("quickbooksSyncJobs", {
					orgId: org.orgId,
					entityType: "client",
					localId: clientId,
					operation: "upsert",
					status: "failed",
					attempts: 5,
					runAfter: Date.now(),
					failedAt: Date.now(),
					lastError: "QuickBooks rejected the record.",
					lastErrorCode: "6240",
					dedupeKey: `client:${clientId}`,
				});
				await ctx.db.insert("quickbooksSyncJobs", {
					orgId: org.orgId,
					entityType: "invoice",
					localId: "not_a_real_id",
					operation: "upsert",
					status: "failed",
					attempts: 5,
					runAfter: Date.now(),
					failedAt: Date.now(),
					lastError: "gone",
					dedupeKey: "invoice:not_a_real_id",
				});
			});

			const errors = await asOwner.query(api.quickbooks.listSyncErrors, {});
			expect(errors).toHaveLength(2);
			const labels = errors.map((e) => e.entityLabel).sort();
			expect(labels).toEqual(["Acme Co", "Deleted invoice"]);
			expect(errors.find((e) => e.entityType === "client")?.lastErrorCode).toBe(
				"6240"
			);
		});

		it("retryJob resets a failed job and kicks the worker", async () => {
			const { org, asOwner } = await setupOrg("retry");
			await connect(org.orgId);
			const jobId = await t.run(async (ctx) =>
				ctx.db.insert("quickbooksSyncJobs", {
					orgId: org.orgId,
					entityType: "client",
					localId: "local_1",
					operation: "upsert",
					status: "failed",
					attempts: 5,
					runAfter: Date.now(),
					failedAt: Date.now(),
					lastError: "boom",
					dedupeKey: "client:local_1",
				})
			);

			await asOwner.mutation(api.quickbooks.retryJob, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job).toMatchObject({ status: "pending", attempts: 0 });
			expect(job?.failedAt).toBeUndefined();
		});

		it("ignoreJob dismisses a failed job", async () => {
			const { org, asOwner } = await setupOrg("ignore");
			await connect(org.orgId);
			const jobId = await t.run(async (ctx) =>
				ctx.db.insert("quickbooksSyncJobs", {
					orgId: org.orgId,
					entityType: "client",
					localId: "local_1",
					operation: "upsert",
					status: "failed",
					attempts: 5,
					runAfter: Date.now(),
					dedupeKey: "client:local_1",
				})
			);

			await asOwner.mutation(api.quickbooks.ignoreJob, { jobId });

			expect((await t.run(async (ctx) => ctx.db.get(jobId)))?.status).toBe(
				"ignored"
			);
			expect(await asOwner.query(api.quickbooks.listSyncErrors, {})).toEqual([]);
		});

		it("retryAllFailed re-queues every failed job", async () => {
			const { org, asOwner } = await setupOrg("retry_all");
			await connect(org.orgId);
			await t.run(async (ctx) => {
				for (const suffix of ["a", "b"]) {
					await ctx.db.insert("quickbooksSyncJobs", {
						orgId: org.orgId,
						entityType: "client",
						localId: `local_${suffix}`,
						operation: "upsert",
						status: "failed",
						attempts: 5,
						runAfter: Date.now(),
						dedupeKey: `client:local_${suffix}`,
					});
				}
			});

			const result = await asOwner.mutation(api.quickbooks.retryAllFailed, {});
			expect(result.retried).toBe(2);
			const jobs = await jobsFor(org.orgId);
			expect(jobs.every((job) => job.status === "pending")).toBe(true);
		});

		it("denies the error center to a non-premium caller", async () => {
			const { org } = await setupOrg("no_premium");
			await connect(org.orgId);
			const asFree = t.withIdentity({
				subject: org.clerkUserId,
				activeOrgId: org.clerkOrgId,
			});
			expect(await asFree.query(api.quickbooks.listSyncErrors, {})).toEqual([]);
			expect(
				await asFree.query(api.quickbooks.getEntityLink, {
					entityType: "client",
					localId: "local_1",
				})
			).toBeNull();
		});
	});

	// ------------------------------------------------------------------
	// Worker
	// ------------------------------------------------------------------

	describe("processOrgJobs", () => {
		type FetchCall = { url: string; body: unknown };

		/** Mock fetch with a URL-matched responder; records every call. */
		function stubQbo(
			respond: (
				url: string,
				body: unknown
			) => { status?: number; payload: unknown }
		): FetchCall[] {
			const calls: FetchCall[] = [];
			vi.stubGlobal(
				"fetch",
				vi.fn(async (url: string, init?: RequestInit) => {
					const body = init?.body ? JSON.parse(init.body as string) : undefined;
					calls.push({ url: String(url), body });
					const { status = 200, payload } = respond(String(url), body);
					return {
						ok: status >= 200 && status < 300,
						status,
						headers: { get: () => "tid_test" },
						json: async () => payload,
						text: async () => JSON.stringify(payload),
					} as unknown as Response;
				})
			);
			return calls;
		}

		async function seedJobFor(
			orgId: Id<"organizations">,
			localId: string,
			entityType: "client" | "invoice" | "payment" = "client"
		) {
			return await t.run(async (ctx) =>
				ctx.db.insert("quickbooksSyncJobs", {
					orgId,
					entityType,
					localId,
					operation: "upsert",
					status: "pending",
					attempts: 0,
					runAfter: Date.now(),
					dedupeKey: `${entityType}:${localId}`,
				})
			);
		}

		async function linkFor(
			orgId: Id<"organizations">,
			entityType: "client" | "invoice" | "payment",
			localId: string
		) {
			return await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksEntityLinks")
					.withIndex("by_org_entity", (q) =>
						q
							.eq("orgId", orgId)
							.eq("entityType", entityType)
							.eq("localId", localId)
					)
					.first()
			);
		}

		it("creates a Customer and links it", async () => {
			const { org, asOwner } = await setupOrg("w_client");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const seeded = await jobsFor(org.orgId);

			const calls = stubQbo(() => ({
				payload: { Customer: { Id: "101", SyncToken: "0" } },
			}));

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			expect(calls[0].url).toContain("/customer");
			expect(calls[0].body).toMatchObject({ DisplayName: "Acme Co" });

			const job = await t.run(async (ctx) => ctx.db.get(seeded[0]._id));
			expect(job?.status).toBe("succeeded");
			const link = await linkFor(org.orgId, "client", clientId);
			expect(link).toMatchObject({ qboId: "101", qboSyncToken: "0" });
		});

		it("auto-links on a 6240 duplicate name when QBO already has the Customer", async () => {
			const { org, asOwner } = await setupOrg("w_dup");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});

			stubQbo((url) => {
				if (url.includes("/query")) {
					return {
						payload: {
							QueryResponse: {
								Customer: [
									{ Id: "555", SyncToken: "2", DisplayName: "Acme Co" },
								],
							},
						},
					};
				}
				return {
					status: 400,
					payload: {
						Fault: {
							type: "ValidationFault",
							Error: [{ code: "6240", Message: "Duplicate Name Exists Error" }],
						},
					},
				};
			});

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			const link = await linkFor(org.orgId, "client", clientId);
			expect(link).toMatchObject({ qboId: "555", qboSyncToken: "2" });
		});

		it("fails a 6240 terminally when disambiguation is off and no match exists", async () => {
			const { org, asOwner } = await setupOrg("w_dup_off");
			await connect(org.orgId, { autoDisambiguateNames: false });
			await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});

			stubQbo((url) => {
				if (url.includes("/query")) {
					return { payload: { QueryResponse: {} } };
				}
				return {
					status: 400,
					payload: {
						Fault: {
							type: "ValidationFault",
							Error: [{ code: "6240", Message: "Duplicate Name Exists Error" }],
						},
					},
				};
			});

			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			const jobs = await jobsFor(org.orgId);
			expect(jobs[0].status).toBe("failed");
			expect(jobs[0].lastError).toContain("Acme Co");
		});

		it("syncs the Customer before the Invoice in one job", async () => {
			const { org, asOwner } = await setupOrg("w_dep");
			await connect(org.orgId, { defaultServiceItemQboId: "9" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			await clearJobsOfType(org.orgId, "client");

			const calls = stubQbo((url) => {
				if (url.includes("/customer")) {
					return { payload: { Customer: { Id: "101", SyncToken: "0" } } };
				}
				return { payload: { Invoice: { Id: "202", SyncToken: "0" } } };
			});

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			expect(calls[0].url).toContain("/customer");
			expect(calls[1].url).toContain("/invoice");
			expect((await linkFor(org.orgId, "invoice", invoiceId))?.qboId).toBe(
				"202"
			);
		});

		it("sparse-updates already-linked entities via lowercase endpoints", async () => {
			const { org, asOwner } = await setupOrg("w_upd");
			await connect(org.orgId, { defaultServiceItemQboId: "9" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			await clearJobsOfType(org.orgId, "client");
			await t.run(async (ctx) => {
				await ctx.db.insert("quickbooksEntityLinks", {
					orgId: org.orgId,
					entityType: "client",
					localId: clientId,
					qboId: "101",
					qboSyncToken: "0",
					lastSyncedAt: Date.now(),
				});
				await ctx.db.insert("quickbooksEntityLinks", {
					orgId: org.orgId,
					entityType: "invoice",
					localId: invoiceId,
					qboId: "202",
					qboSyncToken: "0",
					lastSyncedAt: Date.now(),
				});
			});

			const calls = stubQbo((url) => {
				if (url.includes("/customer")) {
					return { payload: { Customer: { Id: "101", SyncToken: "1" } } };
				}
				return { payload: { Invoice: { Id: "202", SyncToken: "1" } } };
			});

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			// QBO rejects capitalized entity paths ("/Customer") with
			// "Unsupported Operation"; only lowercase is valid.
			expect(new URL(calls[0].url).pathname).toContain("/customer");
			expect(calls[0].body).toMatchObject({
				Id: "101",
				SyncToken: "0",
				sparse: true,
			});
			expect(new URL(calls[1].url).pathname).toContain("/invoice");
			expect(calls[1].body).toMatchObject({
				Id: "202",
				SyncToken: "0",
				sparse: true,
			});
			const jobs = await jobsFor(org.orgId);
			expect(jobs[0].status).toBe("succeeded");
		});

		it("recovers a stale SyncToken via lowercase re-GET and one retry", async () => {
			const { org, asOwner } = await setupOrg("w_stale");
			await connect(org.orgId);
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await t.run(async (ctx) => {
				await ctx.db.insert("quickbooksEntityLinks", {
					orgId: org.orgId,
					entityType: "client",
					localId: clientId,
					qboId: "101",
					qboSyncToken: "0",
					lastSyncedAt: Date.now(),
				});
			});

			const calls = stubQbo((_url, body) => {
				if (!body) {
					// re-GET of the entity after the stale-token rejection
					return { payload: { Customer: { Id: "101", SyncToken: "3" } } };
				}
				if ((body as { SyncToken?: string }).SyncToken === "0") {
					return {
						status: 400,
						payload: {
							Fault: {
								type: "ValidationFault",
								Error: [{ code: "5010", Message: "Stale Object Error" }],
							},
						},
					};
				}
				return { payload: { Customer: { Id: "101", SyncToken: "4" } } };
			});

			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(new URL(calls[1].url).pathname).toContain("/customer/101");
			expect(calls[2].body).toMatchObject({ SyncToken: "3", sparse: true });
			const link = await linkFor(org.orgId, "client", clientId);
			expect(link?.qboSyncToken).toBe("4");
		});

		it("records a sync warning when Automated Sales Tax overrides the tax", async () => {
			const { org, asOwner } = await setupOrg("w_ast");
			await connect(org.orgId, { defaultServiceItemQboId: "9" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const now = Date.now();
			const invoiceId = await asOwner.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-AST-1",
				status: "sent",
				subtotal: 100,
				taxAmount: 8,
				total: 108,
				issuedDate: now,
				dueDate: now + 30 * DAY,
			});
			await clearJobsOfType(org.orgId, "client");

			stubQbo((url) => {
				if (url.includes("/customer")) {
					return { payload: { Customer: { Id: "101", SyncToken: "0" } } };
				}
				return {
					payload: {
						Invoice: {
							Id: "202",
							SyncToken: "0",
							TxnTaxDetail: { TotalTax: 9.5 },
						},
					},
				};
			});

			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			const link = await linkFor(org.orgId, "invoice", invoiceId);
			expect(link?.syncWarning).toBe(
				"QuickBooks adjusted the tax from $8.00 to $9.50."
			);
		});

		it("holds an invoice job (no attempt burned) when setup is incomplete", async () => {
			const { org, asOwner } = await setupOrg("w_hold");
			await connect(org.orgId, { syncInvoicesOn: "created" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await createInvoice(asOwner, clientId, "draft");
			await clearJobsOfType(org.orgId, "client");
			const calls = stubQbo(() => ({ payload: {} }));

			const before = Date.now();
			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result).toMatchObject({ processed: 0, held: 1, failed: 0 });
			expect(calls).toHaveLength(0);
			const jobs = await jobsFor(org.orgId);
			expect(jobs[0]).toMatchObject({ status: "pending", attempts: 0 });
			expect(jobs[0].runAfter).toBeGreaterThan(before + 10 * 60_000);
		});

		it("leaves jobs pending when the connection is not connected", async () => {
			const { org, asOwner } = await setupOrg("w_reauth");
			await connect(org.orgId);
			await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			await t.mutation(internal.quickbooks.markNeedsReauth, {
				orgId: org.orgId,
			});
			const calls = stubQbo(() => ({ payload: {} }));

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result).toMatchObject({ processed: 0, held: 0, failed: 0 });
			expect(calls).toHaveLength(0);
			const jobs = await jobsFor(org.orgId);
			expect(jobs[0]).toMatchObject({ status: "pending", attempts: 0 });
		});

		it("pauses the batch and flips to needs_reauth on a 401", async () => {
			const { org, asOwner } = await setupOrg("w_401");
			await connect(org.orgId);
			await asOwner.mutation(api.clients.create, {
				companyName: "Acme One",
				status: "active",
			});
			await asOwner.mutation(api.clients.create, {
				companyName: "Acme Two",
				status: "active",
			});

			stubQbo(() => ({
				status: 401,
				payload: {
					Fault: {
						type: "AuthenticationFault",
						Error: [{ code: "3200", Message: "message=Unauthorized" }],
					},
				},
			}));

			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.status).toBe("needs_reauth");
			const jobs = await jobsFor(org.orgId);
			expect(jobs.every((job) => job.status === "pending")).toBe(true);
			expect(jobs.every((job) => job.attempts === 0)).toBe(true);
		});

		it("retries a rate limit with backoff instead of failing", async () => {
			const { org, asOwner } = await setupOrg("w_429");
			await connect(org.orgId);
			await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});

			stubQbo(() => ({
				status: 429,
				payload: { Fault: { Error: [{ code: "0", Message: "Throttled" }] } },
			}));

			const before = Date.now();
			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			const jobs = await jobsFor(org.orgId);
			expect(jobs[0]).toMatchObject({ status: "pending", attempts: 1 });
			expect(jobs[0].runAfter).toBeGreaterThan(before + 55_000);
			expect(jobs[0].lastErrorCode).toBe("429");
		});

		it("holds a payment job until the invoice link exists", async () => {
			const { org, asOwner } = await setupOrg("w_pay_wait");
			await connect(org.orgId, {
				defaultServiceItemQboId: "9",
				depositAccountQboId: "88",
			});
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			const paymentId = await asOwner.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 100,
				dueDate: Date.now() + DAY,
				description: "Full Payment",
				sortOrder: 0,
			});
			await t.run(async (ctx) => {
				await ctx.db.patch(paymentId, { status: "paid", paidAt: Date.now() });
			});
			await clearJobsOfType(org.orgId, "all");
			await seedJobFor(org.orgId, paymentId, "payment");
			const calls = stubQbo(() => ({ payload: {} }));

			const before = Date.now();
			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result).toMatchObject({ processed: 0, held: 1 });
			expect(calls).toHaveLength(0);
			const jobs = await jobsFor(org.orgId);
			const paymentJob = jobs.find((j) => j.entityType === "payment");
			expect(paymentJob).toMatchObject({ status: "pending", attempts: 0 });
			expect(paymentJob?.runAfter).toBeGreaterThanOrEqual(before + 60_000);
			// Backstop: the missing invoice job is queued so the hold can resolve —
			// a partially paid invoice created pre-connection has no other enqueue path.
			const invoiceJob = jobs.find((j) => j.entityType === "invoice");
			expect(invoiceJob).toMatchObject({
				status: "pending",
				localId: invoiceId,
			});
		});

		it("creates a QBO Payment once the invoice and client are linked", async () => {
			const { org, asOwner } = await setupOrg("w_pay");
			await connect(org.orgId, {
				defaultServiceItemQboId: "9",
				depositAccountQboId: "88",
			});
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			const paymentId = await asOwner.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 100,
				dueDate: Date.now() + DAY,
				description: "Full Payment",
				sortOrder: 0,
			});
			await t.run(async (ctx) => {
				await ctx.db.patch(paymentId, { status: "paid", paidAt: Date.now() });
			});
			await clearJobsOfType(org.orgId, "all");
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "client",
				localId: clientId,
				qboId: "101",
				qboSyncToken: "0",
			});
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "invoice",
				localId: invoiceId,
				qboId: "202",
				qboSyncToken: "0",
			});
			await seedJobFor(org.orgId, paymentId, "payment");

			const calls = stubQbo(() => ({
				payload: { Payment: { Id: "303", SyncToken: "0" } },
			}));

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			expect(calls[0].url).toContain("/payment");
			// Crash-retry idempotency: creates carry an Intuit requestid.
			expect(calls[0].url).toContain(`requestid=${paymentId}-0`);
			expect(calls[0].body).toMatchObject({
				TotalAmt: 100,
				DepositToAccountRef: { value: "88" },
				CustomerRef: { value: "101" },
			});
			expect((await linkFor(org.orgId, "payment", paymentId))?.qboId).toBe(
				"303"
			);
		});

		async function setupPaidPayment(prefix: string) {
			const { org, asOwner } = await setupOrg(prefix);
			await connect(org.orgId, { defaultServiceItemQboId: "9" });
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			const paymentId = await asOwner.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 100,
				dueDate: Date.now() + DAY,
				description: "Full Payment",
				sortOrder: 0,
			});
			await t.run(async (ctx) => {
				await ctx.db.patch(paymentId, { status: "paid", paidAt: Date.now() });
			});
			await clearJobsOfType(org.orgId, "all");
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "client",
				localId: clientId,
				qboId: "101",
				qboSyncToken: "0",
			});
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "invoice",
				localId: invoiceId,
				qboId: "202",
				qboSyncToken: "0",
			});
			await seedJobFor(org.orgId, paymentId, "payment");
			return { org, paymentId };
		}

		it("self-heals a missing deposit account when QBO has Undeposited Funds", async () => {
			const { org, paymentId } = await setupPaidPayment("w_pay_heal");

			stubQbo((url) => {
				if (url.includes("/query")) {
					return {
						payload: {
							QueryResponse: {
								Account: [{ Id: "88", Name: "Undeposited Funds" }],
							},
						},
					};
				}
				return { payload: { Payment: { Id: "303", SyncToken: "0" } } };
			});

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			expect((await linkFor(org.orgId, "payment", paymentId))?.qboId).toBe(
				"303"
			);
			const connection = await t.run(async (ctx) =>
				ctx.db
					.query("quickbooksConnections")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.first()
			);
			expect(connection?.depositAccountQboId).toBe("88");
		});

		it("fails a payment actionably when QBO has no Undeposited Funds account", async () => {
			const { org } = await setupPaidPayment("w_pay_noUF");

			stubQbo((url) => {
				if (url.includes("/query")) {
					return { payload: { QueryResponse: {} } };
				}
				return { payload: { Payment: { Id: "303", SyncToken: "0" } } };
			});

			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			const jobs = await jobsFor(org.orgId);
			expect(jobs[0].status).toBe("failed");
			expect(jobs[0].lastError).toContain("Undeposited Funds");
		});

		it("is idempotent for an already-linked payment", async () => {
			const { org, asOwner } = await setupOrg("w_pay_idem");
			await connect(org.orgId, {
				defaultServiceItemQboId: "9",
				depositAccountQboId: "88",
			});
			const clientId = await asOwner.mutation(api.clients.create, {
				companyName: "Acme Co",
				status: "active",
			});
			const invoiceId = await createInvoice(asOwner, clientId, "sent");
			const paymentId = await asOwner.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 100,
				dueDate: Date.now() + DAY,
				description: "Full Payment",
				sortOrder: 0,
			});
			await clearJobsOfType(org.orgId, "all");
			await t.mutation(internal.quickbooks.upsertEntityLink, {
				orgId: org.orgId,
				entityType: "payment",
				localId: paymentId,
				qboId: "303",
				qboSyncToken: "0",
			});
			await seedJobFor(org.orgId, paymentId, "payment");
			const calls = stubQbo(() => ({ payload: {} }));

			const result = await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(result.processed).toBe(1);
			expect(calls).toHaveLength(0);
		});

		it("terminally fails a job whose entity was deleted", async () => {
			const { org } = await setupOrg("w_gone");
			await connect(org.orgId);
			await seedJobFor(org.orgId, "not_a_real_id", "client");
			const calls = stubQbo(() => ({ payload: {} }));

			await t.action(internal.quickbooksActions.processOrgJobs, {
				orgId: org.orgId,
			});

			expect(calls).toHaveLength(0);
			const jobs = await jobsFor(org.orgId);
			expect(jobs[0].status).toBe("failed");
			expect(jobs[0].lastError).toContain("no longer exists");
		});
	});
});
