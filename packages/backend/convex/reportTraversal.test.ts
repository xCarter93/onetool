import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createTestClient,
	createTestProject,
	createTestTask,
	createTestQuote,
	createTestInvoice,
	addMemberToOrg,
} from "./test.helpers";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ReportConfigV2 } from "./lib/reportConfig";

/**
 * Related-object traversal in the report engine (§8 d15, F2+F6): dotted FK
 * paths in filters and groupBy, their broken-path semantics, the permission
 * intersection over every table a path crosses, and the registry-derived FK
 * pairs that fall out of REPORT_RELATIONS.
 */

type LabelValue = { label: string; value: number };

const labelValues = (data: { label: string; value: number }[]): LabelValue[] =>
	data.map((d) => ({ label: d.label, value: d.value }));

describe("report traversal: dotted-path filters", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedQuoteLineItems() {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const seeded = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {
				companyName: "Acme",
				leadSource: "website",
			});
			const alpha = await createTestProject(ctx, org.orgId, clientId, {
				title: "Alpha",
				status: "in-progress",
				startDate: Date.UTC(2026, 0, 15, 12),
			});
			const approved = await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "Q-APPROVED",
				status: "approved",
				projectId: alpha,
			});
			const draft = await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "Q-DRAFT",
				status: "draft",
			});
			const lineItem = async (
				quoteId: Id<"quotes">,
				unit: string,
				amount: number
			) =>
				await ctx.db.insert("quoteLineItems", {
					orgId: org.orgId,
					quoteId,
					description: `${unit} work`,
					quantity: 1,
					unit,
					rate: amount,
					amount,
					sortOrder: 0,
				});
			await lineItem(approved, "hour", 100);
			await lineItem(approved, "item", 200);
			await lineItem(draft, "day", 400);
			return { clientId, alpha, approved, draft };
		});
		return { org, asOrg, ...seeded };
	}

	const lineItemConfig = (extra: Partial<ReportConfigV2> = {}): ReportConfigV2 => ({
		version: 2,
		entityType: "quoteLineItems",
		metric: { op: "count" },
		...extra,
	});

	const oneRule = (
		field: string,
		operator: "equals" | "is_empty" | "is_not_empty",
		value?: string
	) => ({
		logic: "and" as const,
		groups: [
			{
				logic: "and" as const,
				rules: [{ field, operator, ...(value !== undefined ? { value } : {}) }],
			},
		],
	});

	it("filters one hop out on the parent's field", async () => {
		const { asOrg } = await seedQuoteLineItems();

		const approved = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: lineItemConfig({ filters: oneRule("quoteId.status", "equals", "approved") }),
		});
		expect(approved.total).toBe(2);

		const declined = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: lineItemConfig({ filters: oneRule("quoteId.status", "equals", "declined") }),
		});
		expect(declined.total).toBe(0);
	});

	it("filters two hops out through quote → project", async () => {
		const { asOrg } = await seedQuoteLineItems();

		const inProgress = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: lineItemConfig({
				filters: oneRule("quoteId.projectId.status", "equals", "in-progress"),
			}),
		});
		expect(inProgress.total).toBe(2);

		const planned = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: lineItemConfig({
				filters: oneRule("quoteId.projectId.status", "equals", "planned"),
			}),
		});
		expect(planned.total).toBe(0);
	});

	it("is_empty passes on a broken path and is_not_empty fails", async () => {
		const { org, asOrg } = await seedQuoteLineItems();
		const { clientId, projectId } = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, { companyName: "Beta Co" });
			const projectId = await createTestProject(ctx, org.orgId, clientId, {
				title: "Beta Build",
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "INV-WITH",
				projectId,
			});
			await createTestInvoice(ctx, org.orgId, clientId, { invoiceNumber: "INV-WITHOUT" });
			return { clientId, projectId };
		});

		const empty = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				filters: oneRule("projectId.title", "is_empty"),
			},
			detail: { columns: ["invoiceNumber"] },
		});
		expect(empty.detail?.rows).toStrictEqual([
			{ id: expect.any(String), invoiceNumber: "INV-WITHOUT", refs: { clientId } },
		]);

		const notEmpty = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				filters: oneRule("projectId.title", "is_not_empty"),
			},
			detail: { columns: ["invoiceNumber"] },
		});
		expect(notEmpty.detail?.rows).toStrictEqual([
			{ id: expect.any(String), invoiceNumber: "INV-WITH", refs: { clientId, projectId } },
		]);
	});

	it("evaluates an OR group mixing a direct rule with a dotted rule", async () => {
		const { asOrg } = await seedQuoteLineItems();

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: lineItemConfig({
				filters: {
					logic: "and",
					groups: [
						{
							logic: "or",
							rules: [
								{ field: "unit", operator: "equals", value: "day" },
								{ field: "quoteId.status", operator: "equals", value: "approved" },
							],
						},
					],
				},
			}),
		});
		// Both approved line items plus the "day" item on the draft quote.
		expect(result.total).toBe(3);
	});

	it("detail mode returns the raw rows a dotted filter matched", async () => {
		const { asOrg, draft } = await seedQuoteLineItems();

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: lineItemConfig({ filters: oneRule("quoteId.status", "equals", "draft") }),
			detail: { columns: ["description", "amount"] },
		});
		expect(result.detail?.rows).toStrictEqual([
			{ id: expect.any(String), description: "day work", amount: 400, refs: { quoteId: draft } },
		]);
		expect(result.detail?.totalMatched).toBe(1);
	});
});

describe("report traversal: dotted-path groupBy", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("fk-terminal path buckets by the terminal record, broken rows labeled for the first missing hop", async () => {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		await t.run(async (ctx) => {
			const acme = await createTestClient(ctx, org.orgId, { companyName: "Acme" });
			const globex = await createTestClient(ctx, org.orgId, { companyName: "Globex" });
			const acmeProject = await createTestProject(ctx, org.orgId, acme, { title: "Alpha" });
			const globexProject = await createTestProject(ctx, org.orgId, globex, { title: "Beta" });
			await createTestInvoice(ctx, org.orgId, acme, { projectId: acmeProject, total: 100 });
			await createTestInvoice(ctx, org.orgId, acme, { projectId: acmeProject, total: 100 });
			await createTestInvoice(ctx, org.orgId, acme, { projectId: acmeProject, total: 100 });
			await createTestInvoice(ctx, org.orgId, globex, { projectId: globexProject, total: 100 });
			await createTestInvoice(ctx, org.orgId, globex, { projectId: globexProject, total: 100 });
			await createTestInvoice(ctx, org.orgId, acme, { total: 100 });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "projectId.clientId",
			},
		});
		expect(labelValues(result.data)).toStrictEqual([
			{ label: "Acme", value: 3 },
			{ label: "Globex", value: 2 },
			{ label: "No Project", value: 1 },
		]);
		expect(result.metadata?.groupBy).toBe("projectId.clientId");
	});

	it("field-terminal path uses the terminal def's option order and separates empty from broken", async () => {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		await t.run(async (ctx) => {
			const referred = await createTestClient(ctx, org.orgId, { leadSource: "referral" });
			const web = await createTestClient(ctx, org.orgId, { leadSource: "website" });
			const unknown = await createTestClient(ctx, org.orgId, {});
			await createTestTask(ctx, org.orgId, { clientId: web });
			await createTestTask(ctx, org.orgId, { clientId: web });
			await createTestTask(ctx, org.orgId, { clientId: referred });
			await createTestTask(ctx, org.orgId, { clientId: unknown });
			await createTestTask(ctx, org.orgId, {});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: {
				version: 2,
				entityType: "tasks",
				metric: { op: "count" },
				groupBy: "clientId.leadSource",
			},
		});
		// Canonical clients.leadSource order first (website before referral), then
		// the reached-but-empty bucket, then the broken-path bucket.
		expect(labelValues(result.data)).toStrictEqual([
			{ label: "Website", value: 2 },
			{ label: "Referral", value: 1 },
			{ label: "Unknown", value: 1 },
			{ label: "No Client", value: 1 },
		]);
	});

	it("granularity path buckets chronologically and drops rows with no reachable timestamp", async () => {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {});
			const january = await createTestProject(ctx, org.orgId, clientId, {
				title: "Jan",
				startDate: Date.UTC(2026, 0, 15, 12),
			});
			const february = await createTestProject(ctx, org.orgId, clientId, {
				title: "Feb",
				startDate: Date.UTC(2026, 1, 15, 12),
			});
			await createTestInvoice(ctx, org.orgId, clientId, { projectId: february });
			await createTestInvoice(ctx, org.orgId, clientId, { projectId: february });
			await createTestInvoice(ctx, org.orgId, clientId, { projectId: january });
			// No project at all, and a project with no startDate — both unbucketable.
			await createTestInvoice(ctx, org.orgId, clientId, {});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "projectId.startDate_month",
			},
			sort: "value_desc",
		});
		// Chronological despite the user sort; the projectless invoice is excluded
		// from data AND from the total.
		expect(result.data.map((d) => d.value)).toStrictEqual([1, 2]);
		expect(result.total).toBe(3);
	});

	it("path field grouping keeps the per-bucket summary value column", async () => {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {});
			const sent = await createTestQuote(ctx, org.orgId, clientId, { status: "sent" });
			await ctx.db.insert("quoteLineItems", {
				orgId: org.orgId,
				quoteId: sent,
				description: "Labor",
				quantity: 1,
				unit: "hour",
				rate: 250,
				amount: 250,
				sortOrder: 0,
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: {
				version: 2,
				entityType: "quoteLineItems",
				metric: { op: "count" },
				groupBy: "quoteId.status",
			},
		});
		expect(result.data).toStrictEqual([
			{ label: "Sent", value: 1, bucketKey: "sent", metadata: { totalValue: 250 } },
		]);
		expect(result.total).toBe(250);
	});

	it("segmentBy stays direct-only — a dotted segment is rejected", async () => {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "invoices",
				config: {
					version: 2,
					entityType: "invoices",
					metric: { op: "count" },
					groupBy: "status",
					segmentBy: "clientId.status",
				},
			})
		).rejects.toThrow(/segmentBy/);
	});
});

describe("report traversal: registry-derived FK pairs", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedQuotesWithLineItems() {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const seeded = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {});
			const big = await createTestQuote(ctx, org.orgId, clientId, { quoteNumber: "Q-BIG" });
			const small = await createTestQuote(ctx, org.orgId, clientId, { quoteNumber: "Q-SMALL" });
			const lineItem = async (quoteId: Id<"quotes">, amount: number) =>
				await ctx.db.insert("quoteLineItems", {
					orgId: org.orgId,
					quoteId,
					description: "Work",
					quantity: 1,
					unit: "hour",
					rate: amount,
					amount,
					sortOrder: 0,
				});
			await lineItem(big, 600);
			await lineItem(big, 200);
			await lineItem(small, 150);
			return { clientId, big, small };
		});
		return { org, asOrg, ...seeded };
	}

	it("line items roll up per quote by grouping on the registry FK", async () => {
		const { asOrg } = await seedQuotesWithLineItems();

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: {
				version: 2,
				entityType: "quoteLineItems",
				metric: { op: "sum", field: "amount" },
				groupBy: "quoteId",
			},
		});
		expect(labelValues(result.data)).toStrictEqual([
			{ label: "Q-BIG", value: 800 },
			{ label: "Q-SMALL", value: 150 },
		]);
		expect(result.total).toBe(950);
	});

	it("a newly derived direct FK groupBy keeps the None label for a null id", async () => {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {});
			const quoteId = await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "Q-1",
			});
			await createTestInvoice(ctx, org.orgId, clientId, { quoteId, total: 100 });
			await createTestInvoice(ctx, org.orgId, clientId, { quoteId, total: 100 });
			await createTestInvoice(ctx, org.orgId, clientId, { total: 100 });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "quoteId",
			},
		});
		// Direct-FK grouping keeps "None" (goldens pin it); only path grouping
		// says "No Quote".
		expect(labelValues(result.data)).toStrictEqual([
			{ label: "Q-1", value: 2 },
			{ label: "None", value: 1 },
		]);
	});
});

describe("report traversal: permissions and validation", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedForPermissions() {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, { companyName: "Acme" });
			const quoteId = await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "Q-1",
			});
			await ctx.db.insert("quoteLineItems", {
				orgId: org.orgId,
				quoteId,
				description: "Work",
				quantity: 1,
				unit: "hour",
				rate: 100,
				amount: 100,
				sortOrder: 0,
			});
		});
		return { org, asOrg };
	}

	it("denies a path that crosses a table the caller cannot report on", async () => {
		const { org } = await seedForPermissions();
		const member = await t.run((ctx) => addMemberToOrg(ctx, org.orgId));
		await t.run(async (ctx) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", org.orgId).eq("userId", member.userId)
				)
				.unique();
			if (!membership) throw new Error("membership not found");
			await ctx.db.patch(membership._id, {
				permissions: {
					reports: { level: "view" },
					quotes: { level: "view", allRecords: true },
					clients: { level: "view" },
				},
			});
		});
		const asMember = t.withIdentity(createTestIdentity(member.clerkUserId, org.clerkOrgId));

		// Sanity: quotes allRecords covers the line items and the one quote hop.
		const allowed = await asMember.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: {
				version: 2,
				entityType: "quoteLineItems",
				metric: { op: "count" },
				groupBy: "quoteId.status",
			},
		});
		expect(labelValues(allowed.data)).toStrictEqual([{ label: "Draft", value: 1 }]);

		// …but reaching clients needs allRecords on clients too, fail closed.
		const caught = await asMember
			.query(api.reportData.executeReport, {
				entityType: "quoteLineItems",
				config: {
					version: 2,
					entityType: "quoteLineItems",
					metric: { op: "count" },
					groupBy: "quoteId.clientId",
				},
			})
			.then(
				() => null,
				(error: unknown) => error
			);
		expect(caught).not.toBeNull();

		const caughtFilter = await asMember
			.query(api.reportData.executeReport, {
				entityType: "quoteLineItems",
				config: {
					version: 2,
					entityType: "quoteLineItems",
					metric: { op: "count" },
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [
									{
										field: "quoteId.clientId.companyName",
										operator: "equals",
										value: "Acme",
									},
								],
							},
						],
					},
				},
			})
			.then(
				() => null,
				(error: unknown) => error
			);
		expect(caughtFilter).not.toBeNull();
	});

	it("rejects an fk-terminal path in a filter", async () => {
		const { asOrg } = await seedForPermissions();
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quoteLineItems",
				config: {
					version: 2,
					entityType: "quoteLineItems",
					metric: { op: "count" },
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [
									{ field: "quoteId.projectId", operator: "is_empty" },
								],
							},
						],
					},
				},
			})
		).rejects.toThrow(/resolves to a related record/);
	});

	it("rejects a granularity suffix in a filter path", async () => {
		const { asOrg } = await seedForPermissions();
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quoteLineItems",
				config: {
					version: 2,
					entityType: "quoteLineItems",
					metric: { op: "count" },
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [
									{
										field: "quoteId.creationDate_month",
										operator: "equals",
										value: "2026-01",
									},
								],
							},
						],
					},
				},
			})
		).rejects.toThrow(/is a time bucket/);
	});

});
