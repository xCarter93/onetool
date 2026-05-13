// Plan 15-02 Task 1 — real bodies for list / get / getDownloadUrl behavioral
// coverage. Plan 15-03 Task 3 fills the six createPaymentIntent bodies via
// SDK-layer mocking via factory injection (NOT raw-fetch stubbing).
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../../test.setup";
import { api } from "../../_generated/api";
import { __setStripeFactoryForTests } from "../invoicesActions";
import type { Id } from "../../_generated/dataModel";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

type Seed = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
};

async function seedOrg(
	t: ReturnType<typeof convexTest>,
	portalId = "portal-inv-1",
	clientName = "Owning Client Inc",
): Promise<Seed> {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Owner",
			email: `owner_${Math.random()}@example.com`,
			image: "https://example.com/u.png",
			externalId: `user_${Math.random()}`,
		});
		const orgId = await ctx.db.insert("organizations", {
			clerkOrganizationId: `org_${Math.random()}`,
			name: "Acme Co",
			ownerUserId: userId,
		});
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: clientName,
			status: "active",
			portalAccessId: portalId,
		});
		const clientContactId = await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: "Jane",
			lastName: "Customer",
			email: "jane@example.com",
			isPrimary: true,
		});
		return { orgId, clientId, clientContactId, clientPortalId: portalId };
	});
}

async function seedSession(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	jti: string,
) {
	await t.run(async (ctx) => {
		await ctx.db.insert("portalSessions", {
			orgId: s.orgId,
			clientId: s.clientId,
			clientContactId: s.clientContactId,
			clientPortalId: s.clientPortalId,
			tokenJti: jti,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000,
		});
	});
}

function ident(s: Seed, jti: string) {
	return {
		issuer: PORTAL_ISSUER,
		subject: s.clientContactId,
		aud: "convex-portal",
		jti,
		orgId: s.orgId,
		clientContactId: s.clientContactId,
		clientPortalId: s.clientPortalId,
	};
}

type InvoiceOverrides = {
	status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
	subtotal?: number;
	taxAmount?: number;
	total?: number;
	issuedDate?: number;
	dueDate?: number;
	invoiceNumber?: string;
	publicToken?: string;
	paidAt?: number;
};

async function insertInvoice(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	overrides: InvoiceOverrides = {},
): Promise<Id<"invoices">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("invoices", {
			orgId: s.orgId,
			clientId: s.clientId,
			invoiceNumber:
				overrides.invoiceNumber ?? `INV-${Math.floor(Math.random() * 1e6)}`,
			status: overrides.status ?? "sent",
			subtotal: overrides.subtotal ?? 100,
			taxAmount: overrides.taxAmount,
			total: overrides.total ?? 100,
			issuedDate: overrides.issuedDate ?? Date.now(),
			dueDate: overrides.dueDate ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
			paidAt: overrides.paidAt,
			publicToken:
				overrides.publicToken ?? `tok_${Math.floor(Math.random() * 1e6)}`,
		});
	});
}

type PaymentOverrides = {
	paymentAmount: number;
	sortOrder: number;
	status?: "pending" | "sent" | "paid" | "refunded" | "overdue" | "cancelled";
	dueDate?: number;
	paidAt?: number;
	description?: string;
	publicToken?: string;
	pendingPaymentIntentClientSecret?: string;
	pendingPaymentIntentId?: string;
	pendingPaymentIntentExpiresAt?: number;
	stripePaymentIntentId?: string;
	checkoutAttemptCounter?: number;
	cardLast4?: string;
	cardBrand?: string;
	stripeReceiptUrl?: string;
};

async function insertPayment(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	invoiceId: Id<"invoices">,
	overrides: PaymentOverrides,
): Promise<Id<"payments">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("payments", {
			orgId: s.orgId,
			invoiceId,
			paymentAmount: overrides.paymentAmount,
			dueDate: overrides.dueDate ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
			description: overrides.description,
			sortOrder: overrides.sortOrder,
			status: overrides.status ?? "pending",
			paidAt: overrides.paidAt,
			publicToken:
				overrides.publicToken ?? `ptok_${Math.floor(Math.random() * 1e6)}`,
			pendingPaymentIntentClientSecret:
				overrides.pendingPaymentIntentClientSecret,
			pendingPaymentIntentId: overrides.pendingPaymentIntentId,
			pendingPaymentIntentExpiresAt: overrides.pendingPaymentIntentExpiresAt,
			stripePaymentIntentId: overrides.stripePaymentIntentId,
			checkoutAttemptCounter: overrides.checkoutAttemptCounter,
			cardLast4: overrides.cardLast4,
			cardBrand: overrides.cardBrand,
			stripeReceiptUrl: overrides.stripeReceiptUrl,
		});
	});
}

describe("portal.invoices", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// -------------------------------------------------------------------------
	// list
	// -------------------------------------------------------------------------

	it("list: returns invoices for the session's clientContact filtered to non-draft non-cancelled status", async () => {
		const s = await seedOrg(t, "p-list-status");
		const jti = "l-status";
		await seedSession(t, s, jti);
		const sentId = await insertInvoice(t, s, {
			status: "sent",
			issuedDate: Date.now(),
		});
		const paidId = await insertInvoice(t, s, {
			status: "paid",
			issuedDate: Date.now() - 1000,
		});
		await insertInvoice(t, s, { status: "draft" });
		await insertInvoice(t, s, { status: "cancelled" });

		const asPortal = t.withIdentity(ident(s, jti));
		const rows = await asPortal.query(api.portal.invoices.list, {});
		const ids = rows.map((r) => r._id);
		expect(ids).toContain(sentId);
		expect(ids).toContain(paidId);
		expect(rows).toHaveLength(2);
		// issuedDate DESC
		expect(rows[0]!._id).toBe(sentId);
		expect(rows[1]!._id).toBe(paidId);
	});

	it("list: excludes invoices whose orgId does not match the session.orgId (cross-tenant lockdown)", async () => {
		const sA = await seedOrg(t, "p-list-cross-A");
		const sB = await seedOrg(t, "p-list-cross-B");
		const jtiA = "l-cross-A";
		await seedSession(t, sA, jtiA);
		const ownId = await insertInvoice(t, sA, { status: "sent" });
		await insertInvoice(t, sB, { status: "sent" });

		const asPortal = t.withIdentity(ident(sA, jtiA));
		const rows = await asPortal.query(api.portal.invoices.list, {});
		expect(rows).toHaveLength(1);
		expect(rows[0]!._id).toBe(ownId);
	});

	it("list: each row includes paymentSummary with totalPaid, totalRemaining, displayStatus derivations", async () => {
		const s = await seedOrg(t, "p-list-summary");
		const jti = "l-summary";
		await seedSession(t, s, jti);
		const invId = await insertInvoice(t, s, {
			status: "sent",
			total: 300,
			dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
		});
		await insertPayment(t, s, invId, {
			paymentAmount: 100,
			sortOrder: 0,
			status: "paid",
			paidAt: Date.now(),
		});
		await insertPayment(t, s, invId, {
			paymentAmount: 200,
			sortOrder: 1,
			status: "sent",
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const rows = await asPortal.query(api.portal.invoices.list, {});
		expect(rows).toHaveLength(1);
		expect(rows[0]!.paymentSummary.totalPaid).toBe(100);
		expect(rows[0]!.paymentSummary.totalRemaining).toBe(200);
		expect(rows[0]!.paymentSummary.displayStatus).toBe("partial");
		expect(rows[0]!.paymentSummary.installmentCount).toBe(2);
		expect(rows[0]!.paymentSummary.isLegacy).toBe(false);
	});

	it("list: displayStatus = overdue when Date.now() > invoice.dueDate AND totalRemaining > 0 AND status !== cancelled", async () => {
		const s = await seedOrg(t, "p-list-overdue");
		const jti = "l-overdue";
		await seedSession(t, s, jti);
		const invId = await insertInvoice(t, s, {
			status: "sent",
			total: 100,
			dueDate: Date.now() - 24 * 60 * 60 * 1000,
		});
		await insertPayment(t, s, invId, {
			paymentAmount: 100,
			sortOrder: 0,
			status: "sent",
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const rows = await asPortal.query(api.portal.invoices.list, {});
		expect(rows[0]!.paymentSummary.displayStatus).toBe("overdue");
	});

	it("list: returns PortalInvoiceListItemPublic DTO — never raw payment rows with pendingPaymentIntentClientSecret or stripePaymentIntentId", async () => {
		const s = await seedOrg(t, "p-list-dto");
		const jti = "l-dto";
		await seedSession(t, s, jti);
		const invId = await insertInvoice(t, s, { status: "sent", total: 100 });
		const SECRET_MARKER = "pi_secret_test_LEAKY_DO_NOT_EXPOSE_xyz123";
		await insertPayment(t, s, invId, {
			paymentAmount: 100,
			sortOrder: 0,
			status: "sent",
			pendingPaymentIntentClientSecret: SECRET_MARKER,
			pendingPaymentIntentId: "pi_test_id_123",
			stripePaymentIntentId: "pi_test_intent_456",
			checkoutAttemptCounter: 3,
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const rows = await asPortal.query(api.portal.invoices.list, {});
		const serialized = JSON.stringify(rows);
		expect(serialized).not.toContain(SECRET_MARKER);
		expect(serialized).not.toContain("pi_test_id_123");
		expect(serialized).not.toContain("pi_test_intent_456");
		expect(serialized).not.toContain("pendingPaymentIntentClientSecret");
		expect(serialized).not.toContain("pendingPaymentIntentId");
		expect(serialized).not.toContain("stripePaymentIntentId");
		expect(serialized).not.toContain("checkoutAttemptCounter");
	});

	// -------------------------------------------------------------------------
	// get
	// -------------------------------------------------------------------------

	it("get: returns invoice + line items + all payments rows (PortalPaymentPublic DTOs) in sortOrder + paymentSummary", async () => {
		const s = await seedOrg(t, "p-get-shape");
		const jti = "g-shape";
		await seedSession(t, s, jti);
		const invId = await insertInvoice(t, s, {
			status: "sent",
			subtotal: 100,
			total: 100,
		});
		await t.run(async (ctx) => {
			await ctx.db.insert("invoiceLineItems", {
				invoiceId: invId,
				orgId: s.orgId,
				description: "Service A",
				quantity: 2,
				unitPrice: 25,
				total: 50,
				sortOrder: 1,
			});
			await ctx.db.insert("invoiceLineItems", {
				invoiceId: invId,
				orgId: s.orgId,
				description: "Service B",
				quantity: 1,
				unitPrice: 50,
				total: 50,
				sortOrder: 0,
			});
		});
		await insertPayment(t, s, invId, {
			paymentAmount: 60,
			sortOrder: 1,
			status: "sent",
		});
		await insertPayment(t, s, invId, {
			paymentAmount: 40,
			sortOrder: 0,
			status: "paid",
			paidAt: Date.now(),
			cardBrand: "visa",
			cardLast4: "4242",
			stripeReceiptUrl: "https://receipt.example/abc",
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.invoices.get, {
			invoiceId: invId,
		});
		expect(result.lineItems).toHaveLength(2);
		expect(result.lineItems[0]!.sortOrder).toBe(0);
		expect(result.lineItems[1]!.sortOrder).toBe(1);
		expect(result.payments).toHaveLength(2);
		expect(result.payments[0]!.sortOrder).toBe(0);
		expect(result.payments[1]!.sortOrder).toBe(1);
		expect(result.payments[0]!.cardBrand).toBe("visa");
		expect(result.payments[0]!.cardLast4).toBe("4242");
		expect(result.payments[0]!.receiptUrl).toBe("https://receipt.example/abc");
		// non-paid row strips receipt fields
		expect(result.payments[1]!.cardBrand).toBeNull();
		expect(result.payments[1]!.cardLast4).toBeNull();
		expect(result.payments[1]!.receiptUrl).toBeNull();
		expect(result.paymentSummary.totalPaid).toBe(40);
		expect(result.paymentSummary.totalRemaining).toBe(60);
		expect(result.activePaymentPublic).not.toBeNull();
		expect(result.activePaymentPublic!.sortOrder).toBe(1);
	});

	it("get: rejects with FORBIDDEN when clientContact does not own the invoice", async () => {
		const sA = await seedOrg(t, "p-get-cross-A");
		const sB = await seedOrg(t, "p-get-cross-B");
		const jtiB = "g-cross-B";
		await seedSession(t, sB, jtiB);
		const invA = await insertInvoice(t, sA, { status: "sent" });

		const asPortalB = t.withIdentity(ident(sB, jtiB));
		try {
			await asPortalB.query(api.portal.invoices.get, { invoiceId: invA });
			throw new Error("expected throw");
		} catch (err: unknown) {
			const e = err as { name?: string; data?: unknown };
			const data =
				typeof e.data === "string"
					? (JSON.parse(e.data) as { code?: string })
					: (e.data as { code?: string } | undefined);
			expect(data?.code).toBe("FORBIDDEN");
		}
	});

	it("get: masquerades draft and cancelled invoices as NOT_FOUND (existence-leak prevention)", async () => {
		const s = await seedOrg(t, "p-get-mask");
		const jti = "g-mask";
		await seedSession(t, s, jti);
		const draftId = await insertInvoice(t, s, { status: "draft" });
		const cancelledId = await insertInvoice(t, s, { status: "cancelled" });

		const asPortal = t.withIdentity(ident(s, jti));
		for (const id of [draftId, cancelledId]) {
			try {
				await asPortal.query(api.portal.invoices.get, { invoiceId: id });
				throw new Error("expected throw");
			} catch (err: unknown) {
				const e = err as { name?: string; data?: unknown };
				const data =
					typeof e.data === "string"
						? (JSON.parse(e.data) as { code?: string })
						: (e.data as { code?: string } | undefined);
				expect(data?.code).toBe("NOT_FOUND");
			}
		}
	});

	it("get: legacy single-token invoice (zero payments rows) returns isLegacy: true at response top level, payments: [], activePaymentPublic: null AND legacyPayUrl === `/pay/${invoice.publicToken}`", async () => {
		const s = await seedOrg(t, "p-get-legacy");
		const jti = "g-legacy";
		await seedSession(t, s, jti);
		const TOKEN = "legacy-public-tok-12345";
		const invId = await insertInvoice(t, s, {
			status: "sent",
			publicToken: TOKEN,
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.invoices.get, {
			invoiceId: invId,
		});
		expect(result.isLegacy).toBe(true);
		expect(result.payments).toEqual([]);
		expect(result.activePaymentPublic).toBeNull();
		expect(result.legacyPayUrl).toBe(`/pay/${TOKEN}`);
	});

	it("get: NON-legacy invoice (at least one payment row) returns legacyPayUrl === null AND isLegacy === false", async () => {
		const s = await seedOrg(t, "p-get-non-legacy");
		const jti = "g-non-legacy";
		await seedSession(t, s, jti);
		const invId = await insertInvoice(t, s, { status: "sent", total: 100 });
		await insertPayment(t, s, invId, {
			paymentAmount: 100,
			sortOrder: 0,
			status: "sent",
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.invoices.get, {
			invoiceId: invId,
		});
		expect(result.isLegacy).toBe(false);
		expect(result.legacyPayUrl).toBe(null);
	});

	// -------------------------------------------------------------------------
	// getDownloadUrl
	// -------------------------------------------------------------------------

	it("getDownloadUrl: returns null when no document exists; never throws on missing PDF", async () => {
		const s = await seedOrg(t, "p-dl-null");
		const jti = "d-null";
		await seedSession(t, s, jti);
		const invId = await insertInvoice(t, s, { status: "sent" });

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.invoices.getDownloadUrl, {
			invoiceId: invId,
		});
		expect(result).toBeNull();
	});

	it("getDownloadUrl: rejects a document whose orgId matches another tenant even if entityId/documentType match (cross-org pinned-doc guard)", async () => {
		const sA = await seedOrg(t, "p-dl-cross-A");
		const sB = await seedOrg(t, "p-dl-cross-B");
		const jtiA = "d-cross-A";
		const jtiB = "d-cross-B";
		await seedSession(t, sA, jtiA);
		await seedSession(t, sB, jtiB);
		const invA = await insertInvoice(t, sA, { status: "sent" });
		const invB = await insertInvoice(t, sB, { status: "sent" });

		// Both orgs have a documents row keyed on entityId=their-own-invoice.
		const { aUrl, bUrl } = await t.run(async (ctx) => {
			const aSid = await ctx.storage.store(
				new Blob(["A-content"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: sA.orgId,
				documentType: "invoice",
				documentId: invA,
				storageId: aSid,
				generatedAt: Date.now(),
				version: 1,
			});
			const bSid = await ctx.storage.store(
				new Blob(["B-content"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: sB.orgId,
				documentType: "invoice",
				documentId: invB,
				storageId: bSid,
				generatedAt: Date.now(),
				version: 1,
			});
			return {
				aUrl: await ctx.storage.getUrl(aSid),
				bUrl: await ctx.storage.getUrl(bSid),
			};
		});

		const asA = t.withIdentity(ident(sA, jtiA));
		const aResult = await asA.query(api.portal.invoices.getDownloadUrl, {
			invoiceId: invA,
		});
		expect(aResult).not.toBeNull();
		expect(aResult!.url).toBe(aUrl);
		expect(aResult!.url).not.toBe(bUrl);

		const asB = t.withIdentity(ident(sB, jtiB));
		const bResult = await asB.query(api.portal.invoices.getDownloadUrl, {
			invoiceId: invB,
		});
		expect(bResult).not.toBeNull();
		expect(bResult!.url).toBe(bUrl);
		expect(bResult!.url).not.toBe(aUrl);
	});

	// -------------------------------------------------------------------------
	// createPaymentIntent — Plan 15-03 (SDK-layer mocking via __setStripeFactoryForTests)
	// -------------------------------------------------------------------------

	describe("createPaymentIntent", () => {
		const PUBLISHABLE_KEY = "pk_test_15_03_xyz";

		beforeEach(() => {
			process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
			process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
		});

		afterEach(() => {
			__setStripeFactoryForTests(null);
		});

		async function seedEnabledOrg(
			s: Seed,
			opts: { chargesEnabled?: boolean; accountId?: string } = {},
		) {
			await t.run(async (ctx) => {
				await ctx.db.patch(s.orgId, {
					stripeConnectAccountId: opts.accountId ?? "acct_test_pi_action",
					stripeChargesEnabled: opts.chargesEnabled ?? true,
				});
			});
		}

		it("createPaymentIntent: mints PI on connected account with idempotency key acct-pi-{paymentId}-{attemptId}", async () => {
			const s = await seedOrg(t, "p-cpi-mint");
			const jti = "cpi-mint";
			await seedSession(t, s, jti);
			await seedEnabledOrg(s, { accountId: "acct_mint_1" });
			const invId = await insertInvoice(t, s, { status: "sent", total: 100 });
			const paymentId = await insertPayment(t, s, invId, {
				paymentAmount: 100,
				sortOrder: 0,
				status: "sent",
				publicToken: "ptok_mint_1",
			});

			const create = vi.fn().mockResolvedValue({
				id: "pi_mint_1",
				client_secret: "pi_mint_1_secret_xyz",
			});
			const retrieve = vi.fn();
			__setStripeFactoryForTests(
				() =>
					({
						paymentIntents: { create, retrieve },
					}) as never,
			);

			const asPortal = t.withIdentity(ident(s, jti));
			const result = await asPortal.action(
				api.portal.invoicesActions.createPaymentIntent,
				{ invoiceId: invId },
			);

			expect(result.clientSecret).toBe("pi_mint_1_secret_xyz");
			expect(result.publishableKey).toBe(PUBLISHABLE_KEY);
			expect(result.stripeAccountId).toBe("acct_mint_1");
			expect(result.paymentId).toBe(paymentId);
			expect(result.amount).toBe(100);

			expect(create).toHaveBeenCalledTimes(1);
			const [createBody, requestOpts] = create.mock.calls[0]!;
			expect(createBody.amount).toBe(10000);
			expect(createBody.currency).toBe("usd");
			expect(createBody.metadata.publicToken).toBe("ptok_mint_1");
			// stripeAccount lives in the REQUEST OPTIONS object, never the create body.
			expect(createBody.stripeAccount).toBeUndefined();
			expect(requestOpts).toEqual({
				stripeAccount: "acct_mint_1",
				idempotencyKey: `acct-pi-${paymentId}-1`,
			});

			// Counter advances on success.
			const payment = await t.run((ctx) => ctx.db.get(paymentId));
			expect(payment?.checkoutAttemptCounter).toBe(1);
			expect(payment?.pendingPaymentIntentId).toBe("pi_mint_1");
			expect(payment?.pendingPaymentIntentClientSecret).toBe(
				"pi_mint_1_secret_xyz",
			);
		});

		it("createPaymentIntent: increments checkoutAttemptCounter ONLY on successful mint (Pitfall 7) — transient failure leaves counter unchanged", async () => {
			const s = await seedOrg(t, "p-cpi-counter");
			const jti = "cpi-counter";
			await seedSession(t, s, jti);
			await seedEnabledOrg(s);
			const invId = await insertInvoice(t, s, { status: "sent", total: 50 });
			const paymentId = await insertPayment(t, s, invId, {
				paymentAmount: 50,
				sortOrder: 0,
				status: "sent",
				publicToken: "ptok_counter_1",
			});

			const create = vi
				.fn()
				.mockRejectedValueOnce(new Error("transient stripe error"))
				.mockResolvedValueOnce({
					id: "pi_counter_2",
					client_secret: "pi_counter_2_secret",
				});
			__setStripeFactoryForTests(
				() =>
					({
						paymentIntents: { create, retrieve: vi.fn() },
					}) as never,
			);

			const asPortal = t.withIdentity(ident(s, jti));

			// First attempt fails — counter must stay at 0.
			await expect(
				asPortal.action(api.portal.invoicesActions.createPaymentIntent, {
					invoiceId: invId,
				}),
			).rejects.toThrow();
			const afterFail = await t.run((ctx) => ctx.db.get(paymentId));
			expect(afterFail?.checkoutAttemptCounter ?? 0).toBe(0);

			// Second attempt succeeds — counter advances to 1.
			await asPortal.action(api.portal.invoicesActions.createPaymentIntent, {
				invoiceId: invId,
			});
			const afterSuccess = await t.run((ctx) => ctx.db.get(paymentId));
			expect(afterSuccess?.checkoutAttemptCounter).toBe(1);

			// Both calls used attemptId=1 because the first never advanced the counter.
			expect(create).toHaveBeenCalledTimes(2);
			const firstKey = create.mock.calls[0]![1].idempotencyKey;
			const secondKey = create.mock.calls[1]![1].idempotencyKey;
			expect(firstKey).toBe(`acct-pi-${paymentId}-1`);
			expect(secondKey).toBe(`acct-pi-${paymentId}-1`);
		});

		it("createPaymentIntent: reuses cached PI when status === requires_payment_method AND now < pendingExpiresAt - 60s buffer", async () => {
			const s = await seedOrg(t, "p-cpi-reuse");
			const jti = "cpi-reuse";
			await seedSession(t, s, jti);
			await seedEnabledOrg(s, { accountId: "acct_reuse_1" });
			const invId = await insertInvoice(t, s, { status: "sent", total: 75 });
			await insertPayment(t, s, invId, {
				paymentAmount: 75,
				sortOrder: 0,
				status: "sent",
				publicToken: "ptok_reuse_1",
				pendingPaymentIntentId: "pi_reuse_cached",
				pendingPaymentIntentClientSecret: "cached_secret_xyz",
				pendingPaymentIntentExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
			});

			const retrieve = vi.fn().mockResolvedValue({
				id: "pi_reuse_cached",
				status: "requires_payment_method",
				client_secret: "cached_secret_xyz",
			});
			const create = vi.fn();
			__setStripeFactoryForTests(
				() =>
					({
						paymentIntents: { create, retrieve },
					}) as never,
			);

			const asPortal = t.withIdentity(ident(s, jti));
			const result = await asPortal.action(
				api.portal.invoicesActions.createPaymentIntent,
				{ invoiceId: invId },
			);

			expect(result.clientSecret).toBe("cached_secret_xyz");
			expect(retrieve).toHaveBeenCalledWith("pi_reuse_cached", {
				stripeAccount: "acct_reuse_1",
			});
			expect(create).not.toHaveBeenCalled();
		});

		it("createPaymentIntent: mints fresh PI when cached pi.status !== requires_payment_method (covers processing/succeeded/canceled/requires_action — Pitfall 5)", async () => {
			const s = await seedOrg(t, "p-cpi-fresh");
			const jti = "cpi-fresh";
			await seedSession(t, s, jti);
			await seedEnabledOrg(s);
			const invId = await insertInvoice(t, s, { status: "sent", total: 40 });
			const paymentId = await insertPayment(t, s, invId, {
				paymentAmount: 40,
				sortOrder: 0,
				status: "sent",
				publicToken: "ptok_fresh_1",
				pendingPaymentIntentId: "pi_stale",
				pendingPaymentIntentClientSecret: "stale_secret",
				pendingPaymentIntentExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
				checkoutAttemptCounter: 2,
			});

			const retrieve = vi
				.fn()
				.mockResolvedValue({ id: "pi_stale", status: "requires_action" });
			const create = vi
				.fn()
				.mockResolvedValue({ id: "pi_fresh", client_secret: "fresh_secret" });
			__setStripeFactoryForTests(
				() =>
					({
						paymentIntents: { create, retrieve },
					}) as never,
			);

			const asPortal = t.withIdentity(ident(s, jti));
			const result = await asPortal.action(
				api.portal.invoicesActions.createPaymentIntent,
				{ invoiceId: invId },
			);

			expect(result.clientSecret).toBe("fresh_secret");
			expect(create).toHaveBeenCalledTimes(1);
			const [, requestOpts] = create.mock.calls[0]!;
			// counter was 2; attemptId = 3.
			expect(requestOpts.idempotencyKey).toBe(`acct-pi-${paymentId}-3`);
			const payment = await t.run((ctx) => ctx.db.get(paymentId));
			expect(payment?.checkoutAttemptCounter).toBe(3);
		});

		// Action errors are wrapped: err.data is a JSON-string of a JSON-string in
		// convex-test for ConvexErrors raised inside internal queries called via
		// ctx.runQuery (Phase 14.2-02 decision). Parse twice.
		function parseActionErrorCode(err: unknown): string | undefined {
			const e = err as { data?: unknown };
			let raw = e?.data;
			if (typeof raw !== "string") {
				return (raw as { code?: string } | undefined)?.code;
			}
			// First parse strips the outer JSON-string wrapper.
			try {
				const once = JSON.parse(raw);
				if (typeof once === "string") {
					return (JSON.parse(once) as { code?: string }).code;
				}
				return (once as { code?: string }).code;
			} catch {
				return undefined;
			}
		}

		it("createPaymentIntent: throws PAYMENTS_NOT_ENABLED when org.stripeChargesEnabled !== true", async () => {
			const s = await seedOrg(t, "p-cpi-disabled");
			const jti = "cpi-disabled";
			await seedSession(t, s, jti);
			await seedEnabledOrg(s, { chargesEnabled: false });
			const invId = await insertInvoice(t, s, { status: "sent", total: 100 });
			await insertPayment(t, s, invId, {
				paymentAmount: 100,
				sortOrder: 0,
				status: "sent",
			});

			const create = vi.fn();
			__setStripeFactoryForTests(
				() =>
					({
						paymentIntents: { create, retrieve: vi.fn() },
					}) as never,
			);

			const asPortal = t.withIdentity(ident(s, jti));
			try {
				await asPortal.action(api.portal.invoicesActions.createPaymentIntent, {
					invoiceId: invId,
				});
				throw new Error("expected throw");
			} catch (err: unknown) {
				expect(parseActionErrorCode(err)).toBe("PAYMENTS_NOT_ENABLED");
			}
			expect(create).not.toHaveBeenCalled();
		});

		it("createPaymentIntent: legacy invoice (zero payments rows) throws LEGACY_INVOICE_NOT_PAYABLE — server backstop only; UI must never reach this state", async () => {
			const s = await seedOrg(t, "p-cpi-legacy");
			const jti = "cpi-legacy";
			await seedSession(t, s, jti);
			await seedEnabledOrg(s);
			const invId = await insertInvoice(t, s, { status: "sent", total: 100 });
			// NO payments row inserted — legacy invoice.

			__setStripeFactoryForTests(
				() =>
					({
						paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
					}) as never,
			);

			const asPortal = t.withIdentity(ident(s, jti));
			try {
				await asPortal.action(api.portal.invoicesActions.createPaymentIntent, {
					invoiceId: invId,
				});
				throw new Error("expected throw");
			} catch (err: unknown) {
				expect(parseActionErrorCode(err)).toBe("LEGACY_INVOICE_NOT_PAYABLE");
			}
		});
	});
});
