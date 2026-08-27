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
import { evaluateReportFilters, type ReportFilters } from "./lib/reportFilters";
import {
	GROUP_BY_OPTIONS,
	isGenericGroupBy,
	type ReportEntityType,
} from "./lib/reportFields";
import { normalizeReportConfig, type ReportConfigV2 } from "./lib/reportConfig";
import type { Id } from "./_generated/dataModel";

/**
 * Pins the observable semantics of reportData.executeReport (the only live
 * export of reportData.ts) on the unified pipeline: v2 `config` requests
 * (including v1 magic keys via normalizeReportConfig), the still-supported
 * standalone aggregation/detail args (deleted at R14), exact-ms date bounds,
 * and org-timezone week bucketing.
 */

describe("reportData.executeReport", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg(timezone?: string) {
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx, {
				clerkUserId: "user_1",
				clerkOrgId: "org_1",
			});
			if (timezone) {
				await ctx.db.patch(setup.orgId, { timezone });
			}
			return setup;
		});
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		return { org, asOrg };
	}

	const countConfig = (
		entityType: ReportConfigV2["entityType"],
		groupBy: string,
		extra: Partial<ReportConfigV2> = {}
	): ReportConfigV2 => ({
		version: 2,
		entityType,
		metric: { op: "count" },
		groupBy,
		...extra,
	});

	// ==========================================================================
	// Clients
	// ==========================================================================

	it("clients by status: canonical order, zeros dropped, Lead label (d2)", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "lead" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "archived" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "status"),
		});

		expect(result.total).toBe(4);
		expect(result.data).toEqual([
			{ label: "Lead", value: 1 },
			{ label: "Active", value: 2 },
			{ label: "Archived", value: 1 },
		]);
		expect(result.metadata?.groupBy).toBe("status");
	});

	it("clients leadSource groups in canonical options order with capitalized labels", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { leadSource: "website" });
			await createTestClient(ctx, org.orgId, { leadSource: "website" });
			await createTestClient(ctx, org.orgId, { leadSource: "referral" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "leadSource"),
		});

		expect(result.data[0]).toEqual({ label: "Website", value: 2 });
		expect(result.data[1]).toEqual({ label: "Referral", value: 1 });
	});

	it("clients creationDate_month buckets by creation time", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, {});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "creationDate_month"),
		});

		expect(result.data).toHaveLength(1);
		expect(result.total).toBe(1);
	});

	// ==========================================================================
	// Projects
	// ==========================================================================

	it("projects by status counts with zeros dropped by default", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestProject(ctx, org.orgId, clientId, { status: "planned" });
			await createTestProject(ctx, org.orgId, clientId, { status: "completed" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: countConfig("projects", "status"),
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ Planned: 1, Completed: 1 });
	});

	it("projects projectType groupBy uses One-off/Recurring labels", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestProject(ctx, org.orgId, clientId, { projectType: "recurring" });
			await createTestProject(ctx, org.orgId, clientId, { projectType: "one-off" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: countConfig("projects", "projectType"),
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ "Recurring": 1, "One-off": 1 });
	});

	// ==========================================================================
	// Tasks — date field is `date`, not _creationTime
	// ==========================================================================

	it("tasks by status with includeEmptyValues keeps zero buckets in canonical order", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { status: "pending" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: countConfig("tasks", "status", { includeEmptyValues: true }),
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		// All four statuses present even at zero.
		expect(byLabel).toEqual({
			Pending: 1,
			"In Progress": 0,
			Completed: 0,
			Cancelled: 0,
		});
	});

	it("tasks completionRate reports 0-100 rate as total, Completed/Pending as data", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { status: "completed" });
			await createTestTask(ctx, org.orgId, { status: "completed" });
			await createTestTask(ctx, org.orgId, { status: "pending" });
			await createTestTask(ctx, org.orgId, { status: "in-progress" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: {
				version: 2,
				entityType: "tasks",
				metric: { op: "ratio", ratioKey: "completionRate" },
			},
		});

		expect(result.total).toBe(50); // 2/4 = 50%
		expect(result.data).toEqual([
			{ label: "Completed", value: 2 },
			{ label: "Pending", value: 2 },
		]);
	});

	it("tasks date filtering uses the `date` field, not _creationTime", async () => {
		const { org, asOrg } = await seedOrg();
		const inRange = Date.UTC(2024, 5, 15);
		const outOfRange = Date.UTC(2024, 8, 15);
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { date: inRange, status: "pending" });
			await createTestTask(ctx, org.orgId, { date: outOfRange, status: "pending" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: countConfig("tasks", "status", {
				date: {
					range: {
						kind: "absolute",
						start: Date.UTC(2024, 5, 1),
						end: Date.UTC(2024, 5, 30),
					},
				},
			}),
		});

		expect(result.total).toBe(1);
	});

	// ==========================================================================
	// Quotes
	// ==========================================================================

	it("quotes by status: counts per status with dollar totalValue metadata; total = dollars", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 500.5 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 250 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "approved", total: 1000 });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config: countConfig("quotes", "status"),
		});

		expect(result.total).toBe(1750.5); // dollars, never /100
		const sent = result.data.find((d) => d.label === "Sent");
		expect(sent).toEqual({ label: "Sent", value: 2, metadata: { totalValue: 750.5 } });
		expect(result.metadata?.totalIsCurrency).toBe(true);
	});

	it("quotes conversionRate: rate = approved / (sent+approved+declined+expired)", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent" });
			await createTestQuote(ctx, org.orgId, clientId, { status: "approved" });
			await createTestQuote(ctx, org.orgId, clientId, { status: "draft" }); // excluded from denominator
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config: {
				version: 2,
				entityType: "quotes",
				metric: { op: "ratio", ratioKey: "conversionRate" },
			},
		});

		expect(result.total).toBe(50); // 1/2
	});

	// ==========================================================================
	// Invoices — default date field is issuedDate; month/client specials use paidAt
	// ==========================================================================

	it("invoices by status filters by issuedDate and reports dollar totals", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		const inRange = Date.UTC(2024, 5, 10);
		const outOfRange = Date.UTC(2024, 9, 10);
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 1200,
				issuedDate: inRange,
				paidAt: outOfRange, // paidAt outside range must NOT exclude this row from the default report
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 300,
				issuedDate: outOfRange,
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: countConfig("invoices", "status", {
				date: {
					range: {
						kind: "absolute",
						start: Date.UTC(2024, 5, 1),
						end: Date.UTC(2024, 5, 30),
					},
				},
			}),
		});

		expect(result.total).toBe(1200);
		const paid = result.data.find((d) => d.label === "Paid");
		expect(paid?.metadata).toEqual({ totalValue: 1200 });
	});

	it("expanded revenue-by-month config sums paid revenue by paidAt month (paid status only)", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 500,
				paidAt: Date.UTC(2024, 0, 15),
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 300,
				paidAt: Date.UTC(2024, 0, 20),
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 999,
			}); // not paid — excluded
		});

		const { config } = normalizeReportConfig(
			{ entityType: "invoices", groupBy: ["month"] },
			{ type: "line" }
		);
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
		});

		expect(result.total).toBe(800);
		expect(result.data).toEqual([
			{ label: "Jan 2024", value: 800, metadata: { dateKey: "2024-01" } },
		]);
	});

	it("expanded revenue-by-client config resolves labels, series-limited, paid only", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) =>
			createTestClient(ctx, org.orgId, { companyName: "Acme Co" })
		);
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 750,
				paidAt: Date.now(),
			});
		});

		const { config, visualization } = normalizeReportConfig(
			{ entityType: "invoices", groupBy: ["client"] },
			{ type: "bar" }
		);
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
			seriesLimit: visualization.options?.seriesLimit,
		});

		expect(result.data).toEqual([
			{ label: "Acme Co", value: 750, metadata: { clientId } },
		]);
	});

	// ==========================================================================
	// Activities — date field is `timestamp`, no seed helper (insert directly)
	// ==========================================================================

	async function insertActivity(
		orgId: Id<"organizations">,
		userId: Id<"users">,
		overrides: { activityType?: string; timestamp?: number } = {}
	) {
		return await t.run(async (ctx) => {
			return await ctx.db.insert("activities", {
				orgId,
				userId,
				activityType: (overrides.activityType ?? "client_created") as any,
				entityType: "client",
				entityId: "fake-id",
				entityName: "Fake Entity",
				description: "test activity",
				timestamp: overrides.timestamp ?? Date.now(),
				isVisible: true,
			});
		});
	}

	it("activities by activityType counts with underscore-separated labels", async () => {
		const { org, asOrg } = await seedOrg();
		await insertActivity(org.orgId, org.userId, { activityType: "client_created" });
		await insertActivity(org.orgId, org.userId, { activityType: "client_created" });
		await insertActivity(org.orgId, org.userId, { activityType: "quote_sent" });

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "activities",
			config: countConfig("activities", "activityType"),
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ "Client Created": 2, "Quote Sent": 1 });
	});

	// ==========================================================================
	// Bare legacy args died with the dispatch at R4c
	// ==========================================================================

	it("a request with no config, aggregation, or detail throws", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				groupBy: "totallyBogusGroupBy",
			})
		).rejects.toThrow(/requires a config/);
	});

	// ==========================================================================
	// TZ bug A (FIXED): exact millisecond date bounds, no re-clamping
	// ==========================================================================

	it("dateRange bounds are exact milliseconds — a row 30 min after `end` is excluded, a row exactly at `end` is included", async () => {
		const { org, asOrg } = await seedOrg();
		const end = Date.UTC(2024, 5, 15, 12, 0, 0);
		const thirtyMinAfter = end + 30 * 60 * 1000;

		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { date: end, status: "pending" });
			await createTestTask(ctx, org.orgId, { date: thirtyMinAfter, status: "pending" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: countConfig("tasks", "status", {
				date: {
					range: { kind: "absolute", start: Date.UTC(2024, 5, 1), end },
				},
			}),
		});

		expect(result.total).toBe(1);
	});

	// ==========================================================================
	// TZ bug B (FIXED): week bucketing computed in the org's IANA timezone
	// ==========================================================================

	it("week bucketing uses the org's IANA timezone, not server-local", async () => {
		const { org, asOrg } = await seedOrg("America/New_York");
		// Sunday 03:00 UTC = Saturday 22:00 ET (EST, UTC-5 in January) — must
		// bucket into the PRIOR week (the week starting the Sunday before).
		const sundayUtcEarlyMorning = Date.UTC(2024, 0, 7, 3, 0, 0);

		await insertActivity(org.orgId, org.userId, {
			activityType: "client_created",
			timestamp: sundayUtcEarlyMorning,
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "activities",
			config: countConfig("activities", "timestamp_week"),
		});

		expect(result.data).toHaveLength(1);
		// The prior Sunday (Dec 31 2023), not the naive UTC week (Jan 7 2024).
		expect(result.data[0].metadata?.dateKey).toBe("2023-12-31");
	});

	// ==========================================================================
	// filters (new additive capability)
	// ==========================================================================

	it("filters: equals on status narrows the scan before grouping", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "lead" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "status", {
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "active" }],
						},
					],
				},
			}),
		});

		expect(result.total).toBe(1);
	});

	it("filters: unknown field throws a ConvexError before scanning", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				config: countConfig("clients", "status", {
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [{ field: "notARealField", operator: "equals", value: "x" }],
							},
						],
					},
				}),
			})
		).rejects.toThrow();
	});

	// ==========================================================================
	// aggregation (new additive capability)
	// ==========================================================================

	it("aggregation: sum of quote totals grouped by status", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 100 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 50 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "approved", total: 400 });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			groupBy: "status",
			aggregation: { op: "sum", field: "total" },
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ Sent: 150, Approved: 400 });
		expect(result.total).toBe(550);
		expect(result.metadata?.totalIsCurrency).toBe(true);
	});

	it("generic-only groupBy without aggregation throws instead of silently returning the legacy default", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "invoices",
				groupBy: "issuedDate_month",
			})
		).rejects.toThrow();
	});

	it("aggregation: unknown field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				aggregation: { op: "sum", field: "notARealField" },
			})
		).rejects.toThrow();
	});

	it("aggregation: non-numeric field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				aggregation: { op: "sum", field: "status" },
			})
		).rejects.toThrow();
	});

	it("aggregation groupBy: boolean field values keep distinct buckets", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			const a = await createTestClient(ctx, org.orgId);
			const b = await createTestClient(ctx, org.orgId);
			const c = await createTestClient(ctx, org.orgId);
			await ctx.db.patch(a, { isActive: true });
			await ctx.db.patch(b, { isActive: true });
			await ctx.db.patch(c, { isActive: false });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			groupBy: "isActive",
			aggregation: { op: "count" },
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ True: 2, False: 1 });
	});

	it("aggregation groupBy: non-timestamp time-bucket field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				groupBy: "status_month",
				aggregation: { op: "count" },
			})
		).rejects.toThrow();
	});

	it("aggregation groupBy: bare timestamp field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "invoices",
				groupBy: "issuedDate",
				aggregation: { op: "count" },
			})
		).rejects.toThrow();
	});

	// ==========================================================================
	// detail mode (new additive capability — exclusive of groupBy/aggregation)
	// ==========================================================================

	it("detail: returns requested columns with labels/types, rows sorted date-desc, null for missing values", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, {
				status: "sent",
				total: 100,
				quoteNumber: "Q-1",
			});
			// Insert directly (bypassing the helper's quoteNumber default) so this
			// row has no quoteNumber — exercises the missing-value -> null path.
			await ctx.db.insert("quotes", {
				orgId: org.orgId,
				clientId,
				title: "No Number",
				status: "draft",
				subtotal: 200,
				total: 200,
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			detail: { columns: ["quoteNumber", "status", "total"] },
		});

		expect(result.data).toEqual([]);
		expect(result.detail?.columns).toEqual([
			{ field: "quoteNumber", label: "Quote Number", type: "string" },
			{ field: "status", label: "Status", type: "string" },
			{ field: "total", label: "Total", type: "currency" },
		]);
		expect(result.detail?.rows).toHaveLength(2);
		// Newest first (second-created quote sorts before the first by _creationTime).
		expect(result.detail?.rows[0]).toEqual({
			quoteNumber: null,
			status: "draft",
			total: 200,
		});
		expect(result.detail?.rows[1]).toEqual({
			quoteNumber: "Q-1",
			status: "sent",
			total: 100,
		});
		expect(result.detail?.totalMatched).toBe(2);
		expect(result.detail?.rowsTruncated).toBe(false);
		expect(result.total).toBe(2);
	});

	it("detail: unknown column throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				detail: { columns: ["notARealColumn"] },
			})
		).rejects.toThrow();
	});

	it("detail: empty columns array throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				detail: { columns: [] },
			})
		).rejects.toThrow();
	});

	it("detail: limit caps rows and sets rowsTruncated/totalMatched", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: i });
			}
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			detail: { columns: ["status"], limit: 3 },
		});

		expect(result.detail?.rows).toHaveLength(3);
		expect(result.detail?.totalMatched).toBe(5);
		expect(result.detail?.rowsTruncated).toBe(true);
		expect(result.total).toBe(5);
	});

	it("detail: filters narrow the scan before rows are built", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 100 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "draft", total: 200 });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			detail: { columns: ["status"] },
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "sent" }],
					},
				],
			},
		});

		expect(result.detail?.rows).toEqual([{ status: "sent" }]);
		expect(result.detail?.totalMatched).toBe(1);
	});

	// ==========================================================================
	// Generic pipeline coverage for the newly-expanded GROUP_BY_OPTIONS values
	// ==========================================================================

	it("activities entityType groupBy with an explicit count runs through the generic pipeline", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await ctx.db.insert("activities", {
				orgId: org.orgId,
				userId: org.userId,
				activityType: "client_created",
				entityType: "client",
				entityId: "fake-id-1",
				entityName: "Fake Entity 1",
				description: "test activity",
				timestamp: Date.now(),
				isVisible: true,
			});
			await ctx.db.insert("activities", {
				orgId: org.orgId,
				userId: org.userId,
				activityType: "invoice_paid",
				entityType: "invoice",
				entityId: "fake-id-2",
				entityName: "Fake Entity 2",
				description: "test activity",
				timestamp: Date.now(),
				isVisible: true,
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "activities",
			groupBy: "entityType",
			aggregation: { op: "count" },
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ Client: 1, Invoice: 1 });
	});

	it("projects completedAt_month groupBy + count + status=completed filter runs through the generic pipeline", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		const completedAt = Date.UTC(2024, 3, 10);
		await t.run(async (ctx) => {
			const completedId = await createTestProject(ctx, org.orgId, clientId, {
				status: "completed",
			});
			await ctx.db.patch(completedId, { completedAt });
			await createTestProject(ctx, org.orgId, clientId, { status: "planned" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			groupBy: "completedAt_month",
			aggregation: { op: "count" },
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "completed" }],
					},
				],
			},
		});

		expect(result.total).toBe(1);
		expect(result.data).toEqual([{ label: "Apr 2024", value: 1, metadata: { dateKey: "2024-04" } }]);
	});

	it("invoices dueDate_month groupBy + sum(total) + or-filters (sent/overdue) runs through the generic pipeline", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		const dueDate = Date.UTC(2024, 6, 1);
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "sent",
				total: 200,
				dueDate,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "overdue",
				total: 300,
				dueDate,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 999,
				dueDate,
			}); // excluded — not sent/overdue
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			groupBy: "dueDate_month",
			aggregation: { op: "sum", field: "total" },
			filters: {
				logic: "and",
				groups: [
					{
						logic: "or",
						rules: [
							{ field: "status", operator: "equals", value: "sent" },
							{ field: "status", operator: "equals", value: "overdue" },
						],
					},
				],
			},
		});

		expect(result.total).toBe(500);
		expect(result.data).toEqual([{ label: "Jul 2024", value: 500, metadata: { dateKey: "2024-07" } }]);
	});

	// ==========================================================================
	// Assignee bucket label resolution (tasks x assigneeUserId)
	// ==========================================================================

	it("tasks assigneeUserId groupBy resolves bucket labels to user names, with Unassigned for missing assignee", async () => {
		const { org, asOrg } = await seedOrg();
		const otherUserId = await t.run((ctx) =>
			ctx.db.insert("users", {
				name: "Jamie Rivera",
				email: "jamie@example.com",
				image: "https://example.com/image.jpg",
				externalId: "user_jamie",
			})
		);
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { assigneeUserId: org.userId });
			await createTestTask(ctx, org.orgId, { assigneeUserId: org.userId });
			await createTestTask(ctx, org.orgId, { assigneeUserId: otherUserId });
			await createTestTask(ctx, org.orgId, {}); // unassigned
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			groupBy: "assigneeUserId",
			aggregation: { op: "count" },
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({
			"Test User": 2,
			"Jamie Rivera": 1,
			Unassigned: 1,
		});
	});
});

describe("GROUP_BY_OPTIONS invariants", () => {
	it("every GROUP_BY_OPTIONS value expands to an executable v2 config", () => {
		for (const entity of Object.keys(GROUP_BY_OPTIONS) as ReportEntityType[]) {
			for (const { value } of GROUP_BY_OPTIONS[entity]) {
				const { config } = normalizeReportConfig(
					{ entityType: entity, groupBy: [value] },
					{ type: "bar" }
				);
				const groupable =
					config.metric.op === "ratio" ||
					(config.groupBy !== undefined && isGenericGroupBy(entity, config.groupBy));
				expect(groupable, `${entity}.${value} must expand to something executable`).toBe(
					true
				);
			}
		}
	});
});

describe("evaluateReportFilters (pure function)", () => {
	it("and-logic requires all rules in a group to pass", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [
						{ field: "status", operator: "equals", value: "active" },
						{ field: "total", operator: "greater_than", value: 100 },
					],
				},
			],
		};
		expect(evaluateReportFilters({ status: "active", total: 200 }, filters)).toBe(true);
		expect(evaluateReportFilters({ status: "active", total: 50 }, filters)).toBe(false);
	});

	it("or-logic across groups", () => {
		const filters: ReportFilters = {
			logic: "or",
			groups: [
				{ logic: "and", rules: [{ field: "status", operator: "equals", value: "a" }] },
				{ logic: "and", rules: [{ field: "status", operator: "equals", value: "b" }] },
			],
		};
		expect(evaluateReportFilters({ status: "b" }, filters)).toBe(true);
		expect(evaluateReportFilters({ status: "c" }, filters)).toBe(false);
	});

	it("contains is case-insensitive substring on strings", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{ logic: "and", rules: [{ field: "companyName", operator: "contains", value: "ACME" }] },
			],
		};
		expect(evaluateReportFilters({ companyName: "Acme Corp" }, filters)).toBe(true);
		expect(evaluateReportFilters({ companyName: "Other" }, filters)).toBe(false);
	});

	it("is_empty / is_not_empty treat undefined, null, and empty string as empty", () => {
		const isEmpty: ReportFilters = {
			logic: "and",
			groups: [{ logic: "and", rules: [{ field: "notes", operator: "is_empty" }] }],
		};
		expect(evaluateReportFilters({ notes: undefined }, isEmpty)).toBe(true);
		expect(evaluateReportFilters({ notes: null }, isEmpty)).toBe(true);
		expect(evaluateReportFilters({ notes: "" }, isEmpty)).toBe(true);
		expect(evaluateReportFilters({ notes: "hi" }, isEmpty)).toBe(false);
	});

	it("comparison operators only match numbers", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [
				{ logic: "and", rules: [{ field: "total", operator: "greater_than", value: 10 }] },
			],
		};
		expect(evaluateReportFilters({ total: "20" }, filters)).toBe(false);
		expect(evaluateReportFilters({ total: 20 }, filters)).toBe(true);
	});

	it("throws is not applicable here — unknown-field rejection happens at executeReport validation time, not in the pure evaluator", () => {
		const filters: ReportFilters = {
			logic: "and",
			groups: [{ logic: "and", rules: [{ field: "whatever", operator: "equals", value: 1 }] }],
		};
		// The evaluator itself is permissive; field-existence validation is the caller's job.
		expect(evaluateReportFilters({}, filters)).toBe(false);
	});
});

describe("related-rollup metrics (R5)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg() {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		return { org, asOrg };
	}

	const relatedConfig = (
		entityType: ReportConfigV2["entityType"],
		related: NonNullable<ReportConfigV2["metric"]["related"]>,
		extra: Partial<ReportConfigV2> = {}
	): ReportConfigV2 => ({
		version: 2,
		entityType,
		metric: { op: "related", related },
		...extra,
	});

	const sumInvoicesByProject = {
		entity: "invoices",
		fk: "projectId",
		field: "total",
		op: "sum",
	} as const;

	/** Three projects; Alpha has invoices totaling 800, Beta 200, Gamma none. */
	async function seedProjectsWithInvoices() {
		const { org, asOrg } = await seedOrg();
		const seeded = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {});
			const alpha = await createTestProject(ctx, org.orgId, clientId, { title: "Alpha" });
			const beta = await createTestProject(ctx, org.orgId, clientId, { title: "Beta" });
			const gamma = await createTestProject(ctx, org.orgId, clientId, { title: "Gamma" });
			await createTestInvoice(ctx, org.orgId, clientId, { projectId: alpha, total: 500 });
			await createTestInvoice(ctx, org.orgId, clientId, { projectId: alpha, total: 300 });
			await createTestInvoice(ctx, org.orgId, clientId, { projectId: beta, total: 200 });
			return { clientId, alpha, beta, gamma };
		});
		return { org, asOrg, ...seeded };
	}

	it("equivalence pin: projects related sum(invoices.total) matches invoices groupBy projectId", async () => {
		const { asOrg } = await seedProjectsWithInvoices();

		const related = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", sumInvoicesByProject),
		});
		const grouped = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "sum", field: "total" },
				groupBy: "projectId",
			},
		});

		expect(related.data).toStrictEqual(grouped.data);
		expect(related.total).toBe(grouped.total);
		expect(related.total).toBe(1000);
		expect(related.data.map((d) => d.label)).toStrictEqual(["Alpha", "Beta"]);
		expect(related.metadata?.entityType).toBe("projects");
		expect(related.metadata?.groupBy).toBe("projectId");
		expect(related.metadata?.totalIsCurrency).toBe(true);
		expect(related.metadata?.itemValueIsCurrency).toBe(true);
		expect(related.metadata?.truncated).toBe(false);
		expect(related.metadata?.truncatedEntities).toBeUndefined();
	});

	it("includeEmptyValues surfaces zero-children parents at 0", async () => {
		const { asOrg } = await seedProjectsWithInvoices();
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", sumInvoicesByProject, {
				includeEmptyValues: true,
			}),
		});
		expect(result.data.map((d) => ({ label: d.label, value: d.value }))).toStrictEqual([
			{ label: "Alpha", value: 800 },
			{ label: "Beta", value: 200 },
			{ label: "Gamma", value: 0 },
		]);
		expect(result.total).toBe(1000);
	});

	it("parent filters narrow the universe and drop outside children from buckets AND total", async () => {
		const { org, asOrg, clientId, beta } = await seedProjectsWithInvoices();
		await t.run(async (ctx) => {
			await ctx.db.patch(beta, { status: "cancelled" });
			// A null-fk child: excluded everywhere (a rollup reports on parent records).
			await createTestInvoice(ctx, org.orgId, clientId, { total: 9999 });
		});
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", sumInvoicesByProject, {
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "planned" }],
						},
					],
				},
			}),
		});
		expect(result.data.map((d) => d.label)).toStrictEqual(["Alpha"]);
		expect(result.total).toBe(800);
	});

	it("config.date bounds the CHILD scan with a child-registry date field", async () => {
		const { org, asOrg, clientId, alpha } = await seedProjectsWithInvoices();
		const jan = Date.UTC(2026, 0, 15);
		const jun = Date.UTC(2026, 5, 15);
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				projectId: alpha,
				total: 50,
				paidAt: jan,
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				projectId: alpha,
				total: 70,
				paidAt: jun,
			});
		});
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", sumInvoicesByProject, {
				// paidAt exists on invoices (the child), not on projects — proving
				// date.field resolves against the child registry.
				date: {
					field: "paidAt",
					range: { kind: "absolute", start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 1, 1) },
				},
			}),
		});
		expect(result.data).toStrictEqual([
			{ label: "Alpha", value: 50, metadata: { projectId: String(alpha) } },
		]);
		expect(result.total).toBe(50);
	});

	it("related.filters apply to the child scan and validate against the child registry", async () => {
		const { org, asOrg, clientId, alpha } = await seedProjectsWithInvoices();
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				projectId: alpha,
				total: 60,
				status: "paid",
			});
		});
		const paidOnly = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", {
				...sumInvoicesByProject,
				filters: {
					logic: "and",
					groups: [
						{ logic: "and", rules: [{ field: "status", operator: "equals", value: "paid" }] },
					],
				},
			}),
		});
		expect(paidOnly.total).toBe(60);

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "projects",
				config: relatedConfig("projects", {
					...sumInvoicesByProject,
					filters: {
						logic: "and",
						groups: [
							{ logic: "and", rules: [{ field: "bogus", operator: "equals", value: 1 }] },
						],
					},
				}),
			})
		).rejects.toThrow(/Unknown report filter field "bogus"/);
	});

	it("fail-closed validation: bad pair, bad date field, bad measure field, grouping", async () => {
		const { asOrg } = await seedProjectsWithInvoices();

		// quotes.clientId points at clients, not projects.
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "projects",
				config: relatedConfig("projects", {
					entity: "quotes",
					fk: "clientId",
					op: "count",
				}),
			})
		).rejects.toThrow(/No registry FK "clientId" from entity "quotes" to entity "projects"/);

		// tasks.assigneeUserId targets users, which is not a report entity.
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				config: relatedConfig("clients", {
					entity: "tasks",
					fk: "assigneeUserId",
					op: "count",
				}),
			})
		).rejects.toThrow(/No registry FK "assigneeUserId"/);

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "projects",
				config: relatedConfig("projects", sumInvoicesByProject, {
					date: { field: "companyName", range: { kind: "absolute", start: 0, end: 1 } },
				}),
			})
		).rejects.toThrow(/Unknown report date field "companyName" for entity "invoices"/);

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "projects",
				config: relatedConfig("projects", {
					entity: "invoices",
					fk: "projectId",
					field: "status",
					op: "sum",
				}),
			})
		).rejects.toThrow(/not numeric/);

		for (const extra of [{ groupBy: "status" }, { segmentBy: "status" }]) {
			await expect(
				asOrg.query(api.reportData.executeReport, {
					entityType: "projects",
					config: relatedConfig("projects", sumInvoicesByProject, extra),
				})
			).rejects.toThrow(/Related metrics do not support grouping/);
		}
	});

	it("permission intersection: denied without allRecords on the CHILD entity", async () => {
		const { org, asOrg } = await seedProjectsWithInvoices();
		const member = await t.run((ctx) => addMemberToOrg(ctx, org.orgId));
		await t.run(async (ctx) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) => q.eq("orgId", org.orgId).eq("userId", member.userId))
				.unique();
			if (!membership) throw new Error("membership not found");
			await ctx.db.patch(membership._id, {
				permissions: {
					reports: { level: "view" },
					projects: { level: "view", allRecords: true },
					invoices: { level: "view" },
				},
			});
		});
		const asMember = t.withIdentity(createTestIdentity(member.clerkUserId, org.clerkOrgId));

		// Sanity: the parent-only report is allowed…
		const plain = await asMember.query(api.reportData.executeReport, {
			entityType: "projects",
			config: { version: 2, entityType: "projects", metric: { op: "count" } },
		});
		expect(plain.total).toBe(3);

		// …but the rollup needs the child's allRecords too, fail closed.
		const caught = await asMember
			.query(api.reportData.executeReport, {
				entityType: "projects",
				config: relatedConfig("projects", sumInvoicesByProject),
			})
			.then(
				() => null,
				(error: unknown) => error
			);
		expect(caught).not.toBeNull();

		// The org admin still succeeds (control for the seed).
		const admin = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", sumInvoicesByProject),
		});
		expect(admin.total).toBe(1000);
	});

	it(
		"truncation provenance names the scan that hit the ceiling",
		{ timeout: 120_000 },
		async () => {
			const { org, asOrg } = await seedOrg();
			const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId, {}));
			const TOTAL = 10_001;
			const BATCH = 500;
			for (let start = 0; start < TOTAL; start += BATCH) {
				const count = Math.min(BATCH, TOTAL - start);
				await t.run(async (ctx) => {
					for (let i = 0; i < count; i++) {
						await ctx.db.insert("projects", {
							orgId: org.orgId,
							clientId,
							title: "P",
							status: "planned",
							projectType: "one-off",
						});
					}
				});
			}
			const result = await asOrg.query(api.reportData.executeReport, {
				entityType: "projects",
				config: relatedConfig("projects", { entity: "invoices", fk: "projectId", op: "count" }),
			});
			expect(result.metadata?.truncated).toBe(true);
			expect(result.metadata?.truncatedEntities).toStrictEqual(["projects"]);
		}
	);

	it("seriesLimit truncates parent buckets after sort; labels resolve from parent rows", async () => {
		const { asOrg } = await seedProjectsWithInvoices();
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
			config: relatedConfig("projects", sumInvoicesByProject),
			seriesLimit: 1,
		});
		expect(result.data.map((d) => ({ label: d.label, value: d.value }))).toStrictEqual([
			{ label: "Alpha", value: 800 },
		]);
		// Scan-wide total is unaffected by the series limit.
		expect(result.total).toBe(1000);
	});
});
