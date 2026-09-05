import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
	createTestProject,
} from "./test.helpers";

/**
 * Behaviour freeze for the Convex read/write performance batch: sequential
 * numbering moved off the org doc onto `orgCounters`, list ordering moved onto
 * the index, `getOverdue` reads payments per invoice, and e-signatures ride the
 * planUsage meter. Every assertion here is about output that must NOT change.
 */
describe("quotes/invoices performance batch", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg(overrides?: {
		clerkUserId?: string;
		clerkOrgId?: string;
	}) {
		return await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, overrides);
			const clientId = await createTestClient(ctx, org.orgId);
			return { ...org, clientId };
		});
	}

	function asUserFor(org: { clerkUserId: string; clerkOrgId: string }) {
		return t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
	}

	async function createQuote(
		asUser: ReturnType<typeof asUserFor>,
		clientId: Id<"clients">,
		extra: { projectId?: Id<"projects">; status?: "draft" | "sent" } = {}
	) {
		return await asUser.mutation(api.quotes.create, {
			clientId,
			status: extra.status ?? "draft",
			subtotal: 100,
			total: 100,
			...(extra.projectId ? { projectId: extra.projectId } : {}),
		});
	}

	async function quoteNumberOf(quoteId: Id<"quotes">) {
		return await t.run(async (ctx) => (await ctx.db.get(quoteId))?.quoteNumber);
	}

	async function counterRowFor(orgId: Id<"organizations">) {
		return await t.run(async (ctx: MutationCtx) =>
			ctx.db
				.query("orgCounters")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.unique()
		);
	}

	// ==========================================================================
	// U5(a) — sequential numbering off the org doc
	// ==========================================================================

	describe("quote numbering", () => {
		it("numbers a fresh org from Q-000001 without touching the org doc", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);

			const before = await t.run((ctx) => ctx.db.get(org.orgId));
			const first = await createQuote(asUser, org.clientId);
			const second = await createQuote(asUser, org.clientId);
			const after = await t.run((ctx) => ctx.db.get(org.orgId));

			expect(await quoteNumberOf(first)).toBe("Q-000001");
			expect(await quoteNumberOf(second)).toBe("Q-000002");
			expect(after).toEqual(before);
			expect((await counterRowFor(org.orgId))?.lastQuoteNumber).toBe(2);
		});

		it("continues from a legacy organizations.lastQuoteNumber", async () => {
			const org = await seedOrg();
			await t.run((ctx) => ctx.db.patch(org.orgId, { lastQuoteNumber: 41 }));

			const quoteId = await createQuote(asUserFor(org), org.clientId);

			expect(await quoteNumberOf(quoteId)).toBe("Q-000042");
		});

		it("seeds from existing quote numbers when neither counter exists", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);

			await createQuote(asUser, org.clientId);
			await createQuote(asUser, org.clientId);

			// Simulate an org that issued numbers before either counter existed.
			await t.run(async (ctx: MutationCtx) => {
				const row = await ctx.db
					.query("orgCounters")
					.withIndex("by_org", (q) => q.eq("orgId", org.orgId))
					.unique();
				if (row) await ctx.db.delete(row._id);
				await ctx.db.patch(org.orgId, { lastQuoteNumber: undefined });
			});

			const third = await createQuote(asUser, org.clientId);
			expect(await quoteNumberOf(third)).toBe("Q-000003");
		});

		it("ignores the org doc once the counter row exists", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);

			await createQuote(asUser, org.clientId);
			await t.run((ctx) => ctx.db.patch(org.orgId, { lastQuoteNumber: 99 }));

			const numbers = [];
			for (let i = 0; i < 4; i++) {
				numbers.push(await quoteNumberOf(await createQuote(asUser, org.clientId)));
			}

			expect(numbers).toEqual(["Q-000002", "Q-000003", "Q-000004", "Q-000005"]);
		});

		it("moves the counter past a manually supplied number", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);

			await createQuote(asUser, org.clientId);
			await asUser.mutation(api.quotes.create, {
				clientId: org.clientId,
				quoteNumber: "Q-000050",
				status: "draft",
				subtotal: 0,
				total: 0,
			});
			const next = await createQuote(asUser, org.clientId);
			expect(await quoteNumberOf(next)).toBe("Q-000051");

			await asUser.mutation(api.quotes.update, { id: next, quoteNumber: "Q-000075" });
			expect(await quoteNumberOf(await createQuote(asUser, org.clientId))).toBe(
				"Q-000076"
			);
		});
	});

	describe("invoice numbering", () => {
		async function approvedQuote(
			asUser: ReturnType<typeof asUserFor>,
			clientId: Id<"clients">
		) {
			const quoteId = await createQuote(asUser, clientId);
			await t.run((ctx) => ctx.db.patch(quoteId, { status: "approved" }));
			return quoteId;
		}

		it("continues from the highest existing INV number", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);
			await t.run((ctx) =>
				createTestInvoice(ctx, org.orgId, org.clientId, {
					invoiceNumber: "INV-000007",
				})
			);

			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId: await approvedQuote(asUser, org.clientId),
			});

			const invoice = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(invoice?.invoiceNumber).toBe("INV-000008");
			expect((await counterRowFor(org.orgId))?.lastInvoiceNumber).toBe(8);
		});

		it("seeds from a legacy number wider than six digits", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);
			await t.run((ctx) =>
				createTestInvoice(ctx, org.orgId, org.clientId, {
					invoiceNumber: "INV-1234567",
				})
			);

			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId: await approvedQuote(asUser, org.clientId),
			});

			const invoice = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(invoice?.invoiceNumber).toBe("INV-1234568");
		});

		it("moves the counter past a manually supplied number", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);
			await asUser.mutation(api.invoices.create, {
				clientId: org.clientId,
				invoiceNumber: "INV-000123",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: Date.now(),
				dueDate: Date.now() + 24 * 60 * 60 * 1000,
			});

			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId: await approvedQuote(asUser, org.clientId),
			});

			const invoice = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(invoice?.invoiceNumber).toBe("INV-000124");
		});

		it("numbers a fresh org from INV-000001 and increments", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);

			const first = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId: await approvedQuote(asUser, org.clientId),
			});
			const second = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId: await approvedQuote(asUser, org.clientId),
			});

			const numbers = await t.run(async (ctx) => [
				(await ctx.db.get(first))?.invoiceNumber,
				(await ctx.db.get(second))?.invoiceNumber,
			]);
			expect(numbers).toEqual(["INV-000001", "INV-000002"]);
		});
	});

	describe("createFromQuote totals", () => {
		it("re-derives taxAmount from the line items under quote pricing", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);
			const quoteId = await createQuote(asUser, org.clientId);
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Mowing",
				quantity: 1,
				unit: "each",
				rate: 200,
				sortOrder: 0,
			});
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				taxEnabled: true,
				taxRate: 10,
			});
			// Simulate a stale stored tax figure on the quote.
			await t.run((ctx) =>
				ctx.db.patch(quoteId, { status: "approved", taxAmount: 5 })
			);

			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId,
			});

			const invoice = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(invoice).toMatchObject({ subtotal: 200, taxAmount: 20, total: 220 });
		});
	});

	// ==========================================================================
	// U4(a) — list ordering and filters
	// ==========================================================================

	describe("list ordering", () => {
		it("quotes.list stays newest-first for every filter branch", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);
			const otherClientId = await t.run((ctx) =>
				createTestClient(ctx, org.orgId, { companyName: "Other Co" })
			);
			const projectId = await t.run((ctx) =>
				createTestProject(ctx, org.orgId, org.clientId)
			);

			const a = await createQuote(asUser, org.clientId, { projectId });
			const b = await createQuote(asUser, org.clientId, { status: "sent" });
			const c = await createQuote(asUser, otherClientId);
			const d = await createQuote(asUser, org.clientId, { projectId });

			expect(await asUser.query(api.quotes.list, {})).toMatchObject(
				[d, c, b, a].map((id) => ({ _id: id }))
			);
			expect(
				await asUser.query(api.quotes.list, { clientId: org.clientId })
			).toMatchObject([d, b, a].map((id) => ({ _id: id })));
			expect(
				await asUser.query(api.quotes.list, { projectId })
			).toMatchObject([d, a].map((id) => ({ _id: id })));
			expect(await asUser.query(api.quotes.list, { status: "sent" })).toMatchObject(
				[{ _id: b }]
			);
		});

		it("invoices.list stays newest-first and keeps AND semantics across filters", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);
			const otherClientId = await t.run((ctx) =>
				createTestClient(ctx, org.orgId, { companyName: "Other Co" })
			);
			const projectId = await t.run((ctx) =>
				createTestProject(ctx, org.orgId, org.clientId)
			);

			const seeded = await t.run(async (ctx) => {
				const a = await createTestInvoice(ctx, org.orgId, org.clientId, {
					status: "sent",
					projectId,
				});
				const b = await createTestInvoice(ctx, org.orgId, otherClientId, {
					status: "sent",
				});
				const c = await createTestInvoice(ctx, org.orgId, org.clientId, {
					status: "draft",
					projectId,
				});
				return { a, b, c };
			});

			expect(await asUser.query(api.invoices.list, {})).toMatchObject(
				[seeded.c, seeded.b, seeded.a].map((id) => ({ _id: id }))
			);
			expect(
				await asUser.query(api.invoices.list, { clientId: org.clientId })
			).toMatchObject([seeded.c, seeded.a].map((id) => ({ _id: id })));
			expect(
				await asUser.query(api.invoices.list, { projectId })
			).toMatchObject([seeded.c, seeded.a].map((id) => ({ _id: id })));
			// status AND clientId both narrow — quotes.list drops status here,
			// invoices.list must not.
			expect(
				await asUser.query(api.invoices.list, {
					status: "sent",
					clientId: org.clientId,
				})
			).toMatchObject([{ _id: seeded.a }]);
			expect(
				await asUser.query(api.invoices.list, { status: "sent", projectId })
			).toMatchObject([{ _id: seeded.a }]);
		});

		it("invoices.list returns nothing for a project in another org", async () => {
			const org = await seedOrg({ clerkUserId: "u_a", clerkOrgId: "org_a" });
			const other = await seedOrg({ clerkUserId: "u_b", clerkOrgId: "org_b" });
			const foreignProjectId = await t.run((ctx) =>
				createTestProject(ctx, other.orgId, other.clientId)
			);
			await t.run((ctx) =>
				createTestInvoice(ctx, other.orgId, other.clientId, {
					projectId: foreignProjectId,
				})
			);

			expect(
				await asUserFor(org).query(api.invoices.list, {
					projectId: foreignProjectId,
				})
			).toEqual([]);
		});
	});

	// ==========================================================================
	// U3(d) — getOverdue reads payments per invoice
	// ==========================================================================

	describe("invoices.getOverdue", () => {
		const DAY_MS = 24 * 60 * 60 * 1000;

		it("reports the remaining balance net of a partial payment", async () => {
			const org = await seedOrg();
			const invoiceId = await t.run(async (ctx) => {
				const invoiceId = await createTestInvoice(ctx, org.orgId, org.clientId, {
					status: "sent",
					total: 1000,
					dueDate: Date.now() - 7 * DAY_MS,
				});
				await ctx.db.insert("payments", {
					orgId: org.orgId,
					invoiceId,
					paymentAmount: 400,
					dueDate: Date.now() - 14 * DAY_MS,
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now() - 10 * DAY_MS,
					publicToken: "tok-paid",
				});
				await ctx.db.insert("payments", {
					orgId: org.orgId,
					invoiceId,
					paymentAmount: 600,
					dueDate: Date.now() - 7 * DAY_MS,
					sortOrder: 1,
					status: "pending",
					publicToken: "tok-pending",
				});
				return invoiceId;
			});

			const overdue = await asUserFor(org).query(api.invoices.getOverdue, {});
			expect(overdue).toHaveLength(1);
			expect(overdue[0]._id).toBe(invoiceId);
			expect(overdue[0].remainingBalance).toBe(600);
		});

		it("keeps the no-payment-rows branch on the invoice total", async () => {
			const org = await seedOrg();
			await t.run((ctx) =>
				createTestInvoice(ctx, org.orgId, org.clientId, {
					status: "overdue",
					total: 250,
					dueDate: Date.now() - DAY_MS,
				})
			);

			const overdue = await asUserFor(org).query(api.invoices.getOverdue, {});
			expect(overdue).toHaveLength(1);
			expect(overdue[0].remainingBalance).toBe(250);
		});

		it("an explicit now matches the server default", async () => {
			const org = await seedOrg();
			await t.run((ctx) =>
				createTestInvoice(ctx, org.orgId, org.clientId, {
					status: "sent",
					dueDate: Date.now() - DAY_MS,
				})
			);
			const asUser = asUserFor(org);

			expect(await asUser.query(api.invoices.getOverdue, {})).toEqual(
				await asUser.query(api.invoices.getOverdue, { now: Date.now() })
			);
		});
	});

	// ==========================================================================
	// U5(b) — e-signatures on the planUsage meter
	// ==========================================================================

	describe("e-signature meter", () => {
		it("a BoldSign Sent transition shows up in entitlements.getMine", async () => {
			const org = await seedOrg();
			const asUser = asUserFor(org);

			await t.run(async (ctx) => {
				const quoteId = await ctx.db.insert("quotes", {
					orgId: org.orgId,
					clientId: org.clientId,
					title: "Signed Quote",
					quoteNumber: "Q-000001",
					status: "draft",
					subtotal: 100,
					taxAmount: 0,
					total: 100,
				});
				const storageId = await ctx.storage.store(
					new Blob(["pdf"], { type: "application/pdf" })
				);
				await ctx.db.insert("documents", {
					orgId: org.orgId,
					documentType: "quote",
					documentId: quoteId,
					storageId,
					version: 1,
					generatedAt: Date.now(),
					boldsignDocumentId: "bs_meter",
					boldsign: {
						documentId: "bs_meter",
						status: "Draft",
						sentTo: [],
					},
				});
			});

			const before = await asUser.query(api.entitlements.getMine, {});
			expect(before.meters[0]).toMatchObject({ key: "esignatures", used: 0 });

			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId: "bs_meter",
				eventType: "Sent",
			});

			const after = await asUser.query(api.entitlements.getMine, {});
			expect(after.meters[0]).toMatchObject({
				key: "esignatures",
				used: 1,
				limit: 5,
				remaining: 4,
			});
		});
	});

	// ==========================================================================
	// U7 — record scope resolved by point read, same allow/deny verdict
	// ==========================================================================

	describe("record scope on line-item mutations", () => {
		async function seedScopedMember() {
			const org = await seedOrg({
				clerkUserId: "scope_owner",
				clerkOrgId: "scope_org",
			});
			const member = await t.run((ctx) =>
				addMemberToOrg(ctx, org.orgId, { clerkUserId: "scope_member" })
			);
			const otherClientId = await t.run((ctx) =>
				createTestClient(ctx, org.orgId, { companyName: "Unassigned Co" })
			);

			const { assignedProjectId } = await t.run(async (ctx: MutationCtx) => {
				const assignedProjectId = await createTestProject(
					ctx,
					org.orgId,
					org.clientId
				);
				await ctx.db.patch(assignedProjectId, {
					assignedUserIds: [member.userId],
				});
				await createTestProject(ctx, org.orgId, otherClientId);

				const membership = await ctx.db
					.query("organizationMemberships")
					.withIndex("by_org_user", (q) =>
						q.eq("orgId", org.orgId).eq("userId", member.userId)
					)
					.unique();
				await ctx.db.patch(membership!._id, {
					permissions: {
						quotes: { level: "modify" },
						invoices: { level: "modify" },
					},
				});
				return { assignedProjectId };
			});

			const asAdmin = asUserFor(org);
			const asMember = t.withIdentity(
				createTestIdentity(member.clerkUserId, org.clerkOrgId)
			);
			return { org, otherClientId, assignedProjectId, asAdmin, asMember };
		}

		it("allows a quote line item on an assigned project and denies an unassigned one", async () => {
			const { org, otherClientId, assignedProjectId, asAdmin, asMember } =
				await seedScopedMember();

			const inScope = await createQuote(asAdmin, org.clientId, {
				projectId: assignedProjectId,
			});
			const outOfScope = await createQuote(asAdmin, otherClientId);

			await expect(
				asMember.mutation(api.quoteLineItems.create, {
					quoteId: inScope,
					description: "In scope",
					quantity: 1,
					unit: "each",
					rate: 10,
					sortOrder: 0,
				})
			).resolves.toBeDefined();

			await expect(
				asMember.mutation(api.quoteLineItems.create, {
					quoteId: outOfScope,
					description: "Out of scope",
					quantity: 1,
					unit: "each",
					rate: 10,
					sortOrder: 0,
				})
			).rejects.toThrow();
		});

		it("allows an invoice line item on an assigned project and denies an unassigned one", async () => {
			const { org, otherClientId, assignedProjectId, asMember } =
				await seedScopedMember();

			const { inScope, outOfScope } = await t.run(
				async (ctx: MutationCtx) => ({
					inScope: await createTestInvoice(ctx, org.orgId, org.clientId, {
						projectId: assignedProjectId,
					}),
					outOfScope: await createTestInvoice(ctx, org.orgId, otherClientId),
				})
			);

			await expect(
				asMember.mutation(api.invoiceLineItems.create, {
					invoiceId: inScope,
					description: "In scope",
					quantity: 1,
					unitPrice: 10,
					sortOrder: 0,
				})
			).resolves.toBeDefined();

			await expect(
				asMember.mutation(api.invoiceLineItems.create, {
					invoiceId: outOfScope,
					description: "Out of scope",
					quantity: 1,
					unitPrice: 10,
					sortOrder: 0,
				})
			).rejects.toThrow();
		});
	});
});
