import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
	createTestProject,
	createTestQuote,
} from "./test.helpers";

describe("invoice group projections", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("returns org-validated source labels and exact group totals", async () => {
		const seeded = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const projectId = await createTestProject(ctx, org.orgId, clientId, {
				title: "September service",
			});
			const quoteId = await createTestQuote(ctx, org.orgId, clientId, {
				projectId,
				quoteNumber: "Q-204",
			});
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
				projectId,
			});
			const groupId = await ctx.db.insert("invoiceGroups", {
				orgId: org.orgId,
				invoiceId,
				sourceProjectId: projectId,
				sourceQuoteId: quoteId,
				serviceDate: Date.UTC(2026, 8, 6),
				subtotal: 100,
				discountAmount: 10,
				taxAmount: 7.43,
				total: 97.43,
				sortOrder: 0,
			});
			return { ...org, invoiceId, projectId, quoteId, groupId };
		});
		const groups = await t
			.withIdentity(createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId))
			.query(api.invoices.getGroups, { invoiceId: seeded.invoiceId });
		expect(groups).toEqual([
			expect.objectContaining({
				_id: seeded.groupId,
				sourceProjectId: seeded.projectId,
				projectTitle: "September service",
				sourceQuoteId: seeded.quoteId,
				quoteNumber: "Q-204",
				serviceDate: Date.UTC(2026, 8, 6),
				subtotal: 100,
				discountAmount: 10,
				taxAmount: 7.43,
				total: 97.43,
				sortOrder: 0,
			}),
		]);
	});

	it("rejects a cross-organization source reference", async () => {
		const seeded = await t.run(async (ctx) => {
			const owner = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, owner.orgId);
			const projectId = await createTestProject(ctx, owner.orgId, clientId);
			const invoiceId = await createTestInvoice(ctx, owner.orgId, clientId, { projectId });
			const otherOrgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "other-org",
				name: "Other Org",
				ownerUserId: owner.userId,
			});
			const otherClient = await createTestClient(ctx, otherOrgId);
			const quoteId = await createTestQuote(ctx, otherOrgId, otherClient);
			await ctx.db.insert("invoiceGroups", {
				orgId: owner.orgId, invoiceId, sourceProjectId: projectId,
				sourceQuoteId: quoteId, serviceDate: Date.UTC(2026, 8, 6),
				subtotal: 100, discountAmount: 0, taxAmount: 0, total: 100, sortOrder: 0,
			});
			return { ...owner, invoiceId };
		});
		await expect(t
			.withIdentity(createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId))
			.query(api.invoices.getGroups, { invoiceId: seeded.invoiceId }))
			.rejects.toThrow("Invoice group source does not match");
	});

	it("blocks global pricing edits that would desynchronize visit snapshots", async () => {
		const seeded = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const projectId = await createTestProject(ctx, org.orgId, clientId);
			const quoteId = await createTestQuote(ctx, org.orgId, clientId, { projectId });
			const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, { projectId });
			await ctx.db.insert("invoiceGroups", {
				orgId: org.orgId, invoiceId, sourceProjectId: projectId,
				sourceQuoteId: quoteId, serviceDate: Date.UTC(2026, 8, 6),
				subtotal: 100, discountAmount: 0, taxAmount: 0, total: 100, sortOrder: 0,
			});
			return { ...org, invoiceId };
		});
		await expect(t
			.withIdentity(createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId))
			.mutation(api.invoices.update, {
				id: seeded.invoiceId,
				discountAmount: 10,
			}))
			.rejects.toThrow("GROUPED_INVOICE_LOCKED");
	});
});
