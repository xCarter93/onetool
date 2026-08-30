import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";
import { consumeMeter } from "./lib/entitlements";

/**
 * CHARACTERIZATION suite for every writer that flips an invoice's status.
 * These tests pin what the code does TODAY, ahead of extracting a shared
 * `transitionInvoice` seam — including the places where today's behavior is
 * the bug the seam exists to fix. Those assertions carry the marker comment
 * so the refactor has to update them deliberately.
 *
 * Meter accounting on send transitions is owned by sliceA.packaging.test.ts;
 * nothing here re-tests it except the automation-executor paths (E), which
 * sliceA does not reach.
 */

// No test below calls sendToClient, but the send paths share module-level env
// reads — stubbing keeps an accidental send from touching Resend.
process.env.RESEND_API_KEY = "test-key";
process.env.PORTAL_JWT_ISSUER =
	process.env.PORTAL_JWT_ISSUER ?? "https://portal.example.com";

type TestInstance = ReturnType<typeof setupConvexTest>;

describe("invoice status writers (characterization)", () => {
	let t: TestInstance;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ---------------------------------------------------------------- helpers

	async function seedOrg(overrides: {
		clerkUserId?: string;
		clerkOrgId?: string;
		premium?: boolean;
	} = {}) {
		const seeded = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: overrides.clerkUserId,
				clerkOrgId: overrides.clerkOrgId,
			});
			if (overrides.premium) {
				await ctx.db.patch(org.orgId, { hasPremiumFeatureAccess: true });
			}
			const clientId = await createTestClient(ctx, org.orgId);
			return { ...org, clientId };
		});
		const asUser = t.withIdentity(
			createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId)
		);
		return { ...seeded, asUser };
	}

	/** Draft invoice created through the public API so triggers/aggregates fire. */
	async function createDraftInvoice(
		asUser: ReturnType<TestInstance["withIdentity"]>,
		clientId: Id<"clients">,
		total = 1000
	) {
		const now = Date.now();
		return await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: `INV-${Math.random().toString(36).slice(2, 8)}`,
			status: "draft",
			subtotal: total,
			total,
			issuedDate: now,
			dueDate: now + 30 * 24 * 60 * 60 * 1000,
		});
	}

	async function paymentRows(
		invoiceId: Id<"invoices">
	): Promise<Doc<"payments">[]> {
		return await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("payments")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.collect();
			return rows.sort((a, b) => a.sortOrder - b.sortOrder);
		});
	}

	async function statusEvents(entityId: string) {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.query("domainEvents").collect();
			return rows.filter(
				(row) =>
					row.eventType === "entity.status_changed" &&
					row.payload.entityId === entityId
			);
		});
	}

	async function activitiesOfType(entityId: string, activityType: string) {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.query("activities").collect();
			return rows.filter(
				(row) => row.entityId === entityId && row.activityType === activityType
			);
		});
	}

	async function sendUsage(orgId: Id<"organizations">) {
		return await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("planUsage")
				.withIndex("by_org_meter_period", (q) =>
					q.eq("orgId", orgId).eq("meter", "clientSends")
				)
				.collect();
			return rows[0] ?? null;
		});
	}

	async function drain() {
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	// =====================================================================
	// A. invoices.update status flips
	// =====================================================================

	describe("A. invoices.update", () => {
		it("draft→paid settles rows, writes an invoice_paid activity, emits entity.status_changed, stamps paidAt", async () => {
			const { asUser, clientId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 1000,
						dueDate: Date.now() + 86_400_000,
						description: "Full payment",
						sortOrder: 0,
					},
				],
			});
			await drain();

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "paid",
			});
			await drain();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("paid");
			expect(invoice?.paidAt).toBeTypeOf("number");

			const rows = await paymentRows(invoiceId);
			expect(rows).toHaveLength(1);
			expect(rows[0]!.status).toBe("paid");
			expect(rows[0]!.recordedOutsidePortal).toBe(true);
			expect(rows[0]!.paidAt).toBeTypeOf("number");

			const paidActivities = await activitiesOfType(invoiceId, "invoice_paid");
			expect(paidActivities).toHaveLength(1);

			const events = await statusEvents(invoiceId);
			expect(events).toHaveLength(1);
			expect(events[0]!.eventSource).toBe("invoices.update");
			expect(events[0]!.payload.oldValue).toBe("draft");
			expect(events[0]!.payload.newValue).toBe("paid");
			// emitStatusChangeEvent stamps the acting user — contrast with the
			// executor's raw insert in E, which carries cascade metadata instead.
			expect(
				(events[0]!.payload.metadata as { actorUserId?: string } | undefined)
					?.actorUserId
			).toBeDefined();
		});

		it("paid→draft succeeds, leaves paidAt stamped and settled rows settled", async () => {
			const { asUser, clientId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 1000,
						dueDate: Date.now() + 86_400_000,
						description: "Full payment",
						sortOrder: 0,
					},
				],
			});
			await drain();

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "paid",
			});
			await drain();
			const paidAt = (await t.run(async (ctx) => ctx.db.get(invoiceId)))?.paidAt;
			expect(paidAt).toBeTypeOf("number");

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			// There is no transition matrix: paid→draft is accepted, paidAt is left
			// stamped, and the settled installment rows are never un-settled.
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "draft",
			});
			await drain();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("draft");
			expect(invoice?.paidAt).toBe(paidAt);

			const rows = await paymentRows(invoiceId);
			expect(rows[0]!.status).toBe("paid");
			expect(rows[0]!.recordedOutsidePortal).toBe(true);
		});

		it("paid→paid duplicates the activity but re-stamps nothing else", async () => {
			const { asUser, clientId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "paid",
			});
			await drain();
			const firstPaidAt = (await t.run(async (ctx) => ctx.db.get(invoiceId)))
				?.paidAt;

			vi.advanceTimersByTime(60_000);
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "paid",
			});
			await drain();

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			// The activity write is the one branch not guarded on the status having
			// actually changed, so re-saving a paid invoice logs a second payment.
			expect(await activitiesOfType(invoiceId, "invoice_paid")).toHaveLength(2);

			// Everything guarded on the change stays put.
			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.paidAt).toBe(firstPaidAt);
			expect(await statusEvents(invoiceId)).toHaveLength(1);
		});
	});

	// =====================================================================
	// B. invoices.markPaid
	// =====================================================================

	describe("B. invoices.markPaid", () => {
		it("settles rows and writes an invoice_paid activity, but emits no entity.status_changed", async () => {
			const { asUser, clientId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 600,
						dueDate: Date.now() + 86_400_000,
						description: "Deposit",
						sortOrder: 0,
					},
					{
						paymentAmount: 400,
						dueDate: Date.now() + 2 * 86_400_000,
						description: "Balance",
						sortOrder: 1,
					},
				],
			});
			await drain();

			await asUser.mutation(api.invoices.markPaid, {
				id: invoiceId,
				paymentMethod: "cash",
			});
			await drain();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("paid");
			expect(invoice?.paidAt).toBeTypeOf("number");

			const rows = await paymentRows(invoiceId);
			expect(rows.map((r) => r.status)).toEqual(["paid", "paid"]);
			expect(rows.every((r) => r.recordedOutsidePortal === true)).toBe(true);

			expect(await activitiesOfType(invoiceId, "invoice_paid")).toHaveLength(1);

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			// markPaid never calls emitStatusChangeEvent, so no automation can
			// trigger off an invoice marked paid from the workspace.
			expect(await statusEvents(invoiceId)).toHaveLength(0);
		});

		it("throws CONFLICT on an already-paid invoice", async () => {
			const { asUser, clientId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.invoices.markPaid, { id: invoiceId });
			await drain();

			await expect(
				asUser.mutation(api.invoices.markPaid, { id: invoiceId })
			).rejects.toThrow(/already paid/i);
		});

		it("throws CONFLICT on a cancelled invoice", async () => {
			const { asUser, clientId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "cancelled",
			});
			await drain();

			await expect(
				asUser.mutation(api.invoices.markPaid, { id: invoiceId })
			).rejects.toThrow(/cancelled/i);

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("cancelled");
		});
	});

	// =====================================================================
	// C. Stripe Checkout webhook: markInvoicePaidFromWebhookInternal
	// =====================================================================

	describe("C. invoices.markInvoicePaidFromWebhookInternal", () => {
		it("flips !paid→paid and settles rows, with no activity row and no status event", async () => {
			const { asUser, clientId, orgId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 1000,
						dueDate: Date.now() + 86_400_000,
						description: "Full payment",
						sortOrder: 0,
					},
				],
			});
			// Invoice publicToken is legacy (no writer mints one); the webhook
			// resolves the invoice by it, so seed one directly.
			const publicToken = "inv-token-webhook-1";
			await t.run(async (ctx) => ctx.db.patch(invoiceId, { publicToken }));
			await drain();

			// Called with no identity — the production webhook shape.
			await t.mutation(internal.invoices.markInvoicePaidFromWebhookInternal, {
				orgId,
				sessionId: "cs_test_123",
				amountTotal: 100_000, // dollars→cents of the 1000 total
				metadata: { publicToken },
				paymentIntentId: "pi_test_123",
			});
			await drain();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("paid");
			expect(invoice?.paidAt).toBeTypeOf("number");
			expect(invoice?.stripeSessionId).toBe("cs_test_123");
			expect(invoice?.stripePaymentIntentId).toBe("pi_test_123");

			const rows = await paymentRows(invoiceId);
			expect(rows[0]!.status).toBe("paid");
			expect(rows[0]!.recordedOutsidePortal).toBe(true);

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			// The handler *calls* ActivityHelpers.invoicePaid, but createActivity
			// resolves the actor from auth and this mutation runs unauthenticated,
			// so it throws into the warn-and-continue catch: no activity is written.
			expect(await activitiesOfType(invoiceId, "invoice_paid")).toHaveLength(0);

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			expect(await statusEvents(invoiceId)).toHaveLength(0);
		});

		it("is idempotent on an already-paid invoice", async () => {
			const { asUser, clientId, orgId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			const publicToken = "inv-token-webhook-2";
			await t.run(async (ctx) => ctx.db.patch(invoiceId, { publicToken }));
			await asUser.mutation(api.invoices.markPaid, { id: invoiceId });
			await drain();
			const paidAt = (await t.run(async (ctx) => ctx.db.get(invoiceId)))?.paidAt;

			await t.mutation(internal.invoices.markInvoicePaidFromWebhookInternal, {
				orgId,
				sessionId: "cs_test_456",
				amountTotal: 100_000,
				metadata: { publicToken },
				paymentIntentId: "pi_test_456",
			});
			await drain();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.paidAt).toBe(paidAt);
			expect(invoice?.stripeSessionId).toBeUndefined();
		});
	});

	// =====================================================================
	// D. Portal/Stripe per-installment cascade
	// =====================================================================

	describe("D. payments.markPaidByPublicTokenInternal cascade", () => {
		it("flips the invoice to paid only once every row settles, with no activity row and no status event", async () => {
			const { asUser, clientId, orgId } = await seedOrg();
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 600,
						dueDate: Date.now() + 86_400_000,
						description: "Deposit",
						sortOrder: 0,
					},
					{
						paymentAmount: 400,
						dueDate: Date.now() + 2 * 86_400_000,
						description: "Balance",
						sortOrder: 1,
					},
				],
			});
			// Portal rows carry a publicToken; configurePayments doesn't mint one.
			const seeded = await paymentRows(invoiceId);
			await t.run(async (ctx) => {
				await ctx.db.patch(seeded[0]!._id, { publicToken: "pay-token-a" });
				await ctx.db.patch(seeded[1]!._id, { publicToken: "pay-token-b" });
			});
			await drain();

			await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken: "pay-token-a",
				stripePaymentIntentId: "pi_a",
				source: "confirm",
			});
			await drain();

			let invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("draft");
			expect(invoice?.paidAt).toBeUndefined();
			// A Stripe collection grants +10 clientSends, once per org per period.
			expect((await sendUsage(orgId))?.bonus).toBe(10);

			await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken: "pay-token-b",
				stripePaymentIntentId: "pi_b",
				source: "confirm",
			});
			await drain();

			invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("paid");
			expect(invoice?.paidAt).toBeTypeOf("number");

			const rows = await paymentRows(invoiceId);
			expect(rows.map((r) => r.status)).toEqual(["paid", "paid"]);
			// Portal settlement is not "recorded outside the portal".
			expect(rows.every((r) => r.recordedOutsidePortal === undefined)).toBe(
				true
			);

			// The second collection in the same period does not re-grant the bonus.
			const usage = await sendUsage(orgId);
			expect(usage?.bonus).toBe(10);
			expect(usage?.used).toBe(0);

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			// updateInvoiceStatusIfFullyPaid patches status + paidAt and celebrates,
			// but writes no activity row and emits no status event, so a portal
			// payment is invisible to the activity feed and to automations.
			expect(await activitiesOfType(invoiceId, "invoice_paid")).toHaveLength(0);
			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			expect(await statusEvents(invoiceId)).toHaveLength(0);
		});
	});

	// =====================================================================
	// E. Automation executor: applyStatusUpdate on invoices
	// =====================================================================

	describe("E. automation update_field on invoice status", () => {
		/** update_field action node writing `field` on the triggering record. */
		function updateFieldActionNode(id: string, field: string, value: string) {
			return {
				id,
				type: "action" as const,
				config: {
					kind: "action" as const,
					action: {
						type: "update_field" as const,
						target: "self" as const,
						field,
						value: { kind: "static" as const, value },
					},
				},
			};
		}

		/** Event-bus scheduler hops are skipped under VITEST — drive them here. */
		async function drainEvents() {
			for (let i = 0; i < 10; i++) {
				await t.mutation(internal.eventBus.processEvents, {});
				await t.finishAllScheduledFunctions(vi.runAllTimers);
				const pending = await t.run(async (ctx) =>
					ctx.db
						.query("domainEvents")
						.withIndex("by_status", (q) => q.eq("status", "pending"))
						.first()
				);
				if (!pending) break;
			}
		}

		async function executions() {
			return await t.run(async (ctx) =>
				ctx.db.query("workflowExecutions").collect()
			);
		}

		/** Org + client + a published automation flipping new invoices to `status`. */
		async function seedInvoiceAutomation(status: string) {
			const setup = await seedOrg({ premium: true });
			const automationId = await setup.asUser.mutation(api.automations.create, {
				name: `Auto-${status} new invoices`,
				trigger: { type: "record_created", objectType: "invoice" },
				nodes: [updateFieldActionNode("act-1", "status", status)],
				isActive: true,
			});
			return { ...setup, automationId };
		}

		it("draft→sent debits the clientSends meter once and stamps firstSentAt", async () => {
			const { asUser, orgId, clientId } = await seedInvoiceAutomation("sent");

			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await drainEvents();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("sent");
			expect(invoice?.firstSentAt).toBeGreaterThan(0);
			expect((await sendUsage(orgId))?.used).toBe(1);
		});

		it("at meter exhaustion the node fails, the run is recorded, and the invoice stays draft", async () => {
			const { asUser, orgId, userId, clientId } =
				await seedInvoiceAutomation("sent");
			// The meter reads the ORG plan while the run gate also honors the
			// automation's creator — the only shape that reaches an exhausted meter.
			await t.run(async (ctx) => {
				await ctx.db.patch(userId, { hasPremiumFeatureAccess: true });
				await ctx.db.patch(orgId, { hasPremiumFeatureAccess: false });
				await consumeMeter(ctx, orgId, "clientSends", { amount: 20 });
			});

			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await drainEvents();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("draft");
			expect(invoice?.firstSentAt).toBeUndefined();
			expect((await sendUsage(orgId))?.used).toBe(20);

			const rows = await executions();
			expect(rows).toHaveLength(1);
			expect(rows[0]!.status).toBe("failed");
			expect(
				rows[0]!.nodesExecuted.find((n) => n.nodeId === "act-1")?.error
			).toBe(
				"Send limit reached for this month. The record was not moved to sent."
			);
		});

		it("any→paid stamps paidAt but leaves installments outstanding, writes no activity, and emits a raw cascade event", async () => {
			const { asUser, clientId, automationId } =
				await seedInvoiceAutomation("paid");

			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 1000,
						dueDate: Date.now() + 86_400_000,
						description: "Full payment",
						sortOrder: 0,
					},
				],
			});
			await drainEvents();

			const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
			expect(invoice?.status).toBe("paid");
			expect(invoice?.paidAt).toBeTypeOf("number");

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			// applyStatusUpdate patches the status directly: it never calls
			// settleOutstandingPaymentsForInvoice, so the portal still shows a Pay
			// button on an invoice the automation just marked paid.
			const rows = await paymentRows(invoiceId);
			expect(rows).toHaveLength(1);
			expect(rows[0]!.status).toBe("pending");

			// PINNED CURRENT BEHAVIOR — the transitionInvoice seam will change this
			expect(await activitiesOfType(invoiceId, "invoice_paid")).toHaveLength(0);

			// The event is a raw domainEvents insert (not emitStatusChangeEvent),
			// carrying the executor's recursion-protection metadata.
			const events = await statusEvents(invoiceId);
			expect(events).toHaveLength(1);
			expect(events[0]!.eventSource).toBe(
				"automationExecutor.applyStatusUpdate"
			);
			expect(events[0]!.payload.oldValue).toBe("draft");
			expect(events[0]!.payload.newValue).toBe("paid");
			const metadata = events[0]!.payload.metadata as {
				executionChain: Id<"workflowAutomations">[];
				recursionDepth: number;
				isCascade: boolean;
			};
			expect(metadata.isCascade).toBe(true);
			expect(metadata.executionChain).toContain(automationId);
			expect(metadata.recursionDepth).toBeTypeOf("number");
		});
	});

	// =====================================================================
	// F. QuickBooks enqueue
	// =====================================================================

	/**
	 * The enqueue hook is a silent side effect of every status writer: nothing
	 * downstream fails when a call site loses it, the invoice just stops
	 * reaching QuickBooks. These pin which writers currently queue a job.
	 */
	describe("F. QuickBooks enqueue", () => {
		async function connectQbo(orgId: Id<"organizations">) {
			await t.run(async (ctx) => {
				const organization = await ctx.db.get(orgId);
				await ctx.db.insert("quickbooksConnections", {
					orgId,
					realmId: `realm_${orgId}`,
					environment: "sandbox",
					accessToken: "access_live",
					accessTokenExpiresAt: Date.now() + 10 * 60 * 60 * 1000,
					refreshToken: "refresh_live",
					refreshTokenExpiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
					status: "connected",
					connectedByUserId: organization!.ownerUserId,
					// The default: a draft is ineligible, so a job appearing is proof
					// the status flip is what queued it.
					syncInvoicesOn: "sent",
					syncPayments: true,
					autoDisambiguateNames: true,
				});
			});
		}

		async function invoiceJobs(
			orgId: Id<"organizations">,
			invoiceId: Id<"invoices">
		) {
			return await t.run(async (ctx) => {
				const rows = await ctx.db
					.query("quickbooksSyncJobs")
					.withIndex("by_org_status", (q) => q.eq("orgId", orgId))
					.collect();
				return rows.filter((row) => row.dedupeKey === `invoice:${invoiceId}`);
			});
		}

		it("invoices.update queues the invoice once it leaves draft", async () => {
			const { asUser, orgId, clientId } = await seedOrg();
			await connectQbo(orgId);
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);
			expect(await invoiceJobs(orgId, invoiceId)).toHaveLength(0);

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "paid",
			});

			const [job] = await invoiceJobs(orgId, invoiceId);
			expect(job?.operation).toBe("upsert");
		});

		it("the Stripe webhook writer queues too, despite having no acting user", async () => {
			const { asUser, orgId, clientId } = await seedOrg();
			await connectQbo(orgId);
			const invoiceId = await createDraftInvoice(asUser, clientId, 1000);

			const publicToken = "inv-token-qbo-1";
			await t.run(async (ctx) => ctx.db.patch(invoiceId, { publicToken }));

			await t.mutation(internal.invoices.markInvoicePaidFromWebhookInternal, {
				orgId,
				sessionId: "cs_qbo_1",
				amountTotal: 100_000,
				metadata: { publicToken },
				paymentIntentId: "pi_qbo_1",
			});

			expect(await invoiceJobs(orgId, invoiceId)).toHaveLength(1);
		});
	});
});
