import { expect, it } from "vitest";
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

it("attributes a consolidated invoice group's amount to its source project", async () => {
	const t = setupConvexTest();
	const seeded = await t.run(async (ctx) => {
		const org = await createTestOrg(ctx);
		const clientId = await createTestClient(ctx, org.orgId);
		const projectId = await createTestProject(ctx, org.orgId, clientId);
		const quoteId = await createTestQuote(ctx, org.orgId, clientId, { projectId });
		const invoiceId = await createTestInvoice(ctx, org.orgId, clientId, {
			status: "sent",
			projectId: undefined,
			total: 250,
		});
		await ctx.db.insert("invoiceGroups", {
			orgId: org.orgId, invoiceId, sourceProjectId: projectId, sourceQuoteId: quoteId,
			serviceDate: Date.UTC(2026, 8, 6), subtotal: 250, discountAmount: 0,
			taxAmount: 0, total: 250, sortOrder: 0,
		});
		return { ...org, projectId };
	});
	const preview = await t
		.withIdentity(createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId))
		.query(api.projects.getPreview, { id: seeded.projectId });
	expect(preview?.related.invoices).toEqual({
		count: 1,
		total: 250,
		outstanding: 250,
		paid: 0,
	});
});
