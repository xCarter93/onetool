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
import { configForGroupByKey, type ReportConfigV2 } from "./lib/reportConfig";
import type { Id } from "./_generated/dataModel";

/**
 * Pins the observable semantics of reportData.executeReport (the only live
 * export of reportData.ts): v2 `config` requests, detail mode, exact-ms date
 * bounds, and org-timezone week bucketing.
 */

/** An ungrouped count config — the shape every detail-mode request carries. */
const detailConfig = (
	entityType: ReportConfigV2["entityType"],
	extra: Partial<ReportConfigV2> = {}
): ReportConfigV2 => ({
	version: 2,
	entityType,
	metric: { op: "count" },
	...extra,
});

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
			{ label: "Lead", value: 1, bucketKey: "lead" },
			{ label: "Active", value: 2, bucketKey: "active" },
			{ label: "Archived", value: 1, bucketKey: "archived" },
		]);
		expect(result.metadata?.groupBy).toBe("status");
	});

	it("sort arg (R9): value_asc reorders categorical buckets and composes with seriesLimit (slice after sort)", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "lead" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "archived" });
			await createTestClient(ctx, org.orgId, { status: "archived" });
			await createTestClient(ctx, org.orgId, { status: "archived" });
		});

		const sorted = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "status"),
			sort: "value_asc",
		});
		expect(sorted.data.map((d) => d.label)).toEqual(["Lead", "Active", "Archived"]);

		const limited = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "status"),
			sort: "value_asc",
			seriesLimit: 2,
		});
		expect(limited.data.map((d) => d.label)).toEqual(["Lead", "Active"]);
		// total stays scan-wide regardless of the slice (d11).
		expect(limited.total).toBe(6);
	});

	it("sort arg (R9): label_asc sorts buckets alphabetically", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "lead" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "archived" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "status"),
			sort: "label_asc",
		});
		expect(result.data.map((d) => d.label)).toEqual(["Active", "Archived", "Lead"]);
	});

	it("sort arg (R9): time buckets stay chronological — user sort is ignored", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 0, 15),
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 1, 10),
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 1, 20),
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: countConfig("invoices", "issuedDate_month"),
			sort: "value_desc",
		});
		// Feb (2) would lead under value_desc; chronology wins.
		expect(result.data.map((d) => d.value)).toEqual([1, 2]);
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

		expect(result.data[0]).toEqual({ label: "Website", value: 2, bucketKey: "website" });
		expect(result.data[1]).toEqual({ label: "Referral", value: 1, bucketKey: "referral" });
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
		expect(sent).toEqual({
			label: "Sent",
			value: 2,
			bucketKey: "sent",
			metadata: { totalValue: 750.5 },
		});
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

		const { config } = configForGroupByKey("invoices", "month", {
			visualization: { type: "line" },
		});
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
		});

		expect(result.total).toBe(800);
		expect(result.data).toEqual([
			{ label: "Jan 2024", value: 800, bucketKey: "2024-01", metadata: { dateKey: "2024-01" } },
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

		const { config, visualization } = configForGroupByKey("invoices", "client", {
			visualization: { type: "bar" },
		});
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
			seriesLimit: visualization.options?.seriesLimit,
		});

		expect(result.data).toEqual([
			{ label: "Acme Co", value: 750, bucketKey: clientId, metadata: { clientId } },
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
			config: {
				version: 2,
				entityType: "quotes",
				metric: { op: "sum", field: "total" },
				groupBy: "status",
			},
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ Sent: 150, Approved: 400 });
		expect(result.total).toBe(550);
		expect(result.metadata?.totalIsCurrency).toBe(true);
	});

	it("metric: unknown field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				config: {
					version: 2,
					entityType: "quotes",
					metric: { op: "sum", field: "notARealField" },
				},
			})
		).rejects.toThrow();
	});

	it("metric: non-numeric field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				config: {
					version: 2,
					entityType: "quotes",
					metric: { op: "sum", field: "status" },
				},
			})
		).rejects.toThrow();
	});

	it("groupBy: boolean field values keep distinct buckets", async () => {
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
			config: countConfig("clients", "isActive"),
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ True: 2, False: 1 });
	});

	it("groupBy: prototype-named group values bucket like any other text", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { companyName: "constructor" });
			await createTestClient(ctx, org.orgId, { companyName: "constructor" });
			await createTestClient(ctx, org.orgId, { companyName: "__proto__" });
			await createTestClient(ctx, org.orgId, { companyName: "Acme" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "companyName"),
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ Constructor: 2, "  Proto  ": 1, Acme: 1 });
	});

	it("groupBy: non-timestamp time-bucket field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				config: countConfig("quotes", "status_month"),
			})
		).rejects.toThrow();
	});

	it("groupBy: bare timestamp field throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "invoices",
				config: countConfig("invoices", "issuedDate"),
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
			config: detailConfig("quotes"),
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
			id: expect.any(String),
			quoteNumber: null,
			status: "draft",
			total: 200,
			refs: { clientId },
		});
		expect(result.detail?.rows[1]).toEqual({
			id: expect.any(String),
			quoteNumber: "Q-1",
			status: "sent",
			total: 100,
			refs: { clientId },
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
				config: detailConfig("quotes"),
				detail: { columns: ["notARealColumn"] },
			})
		).rejects.toThrow();
	});

	it("detail: empty columns array throws a ConvexError", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				config: detailConfig("quotes"),
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
			config: detailConfig("quotes"),
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
			config: detailConfig("quotes", {
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "sent" }],
						},
					],
				},
			}),
			detail: { columns: ["status"] },
		});

		expect(result.detail?.rows).toEqual([
			{ id: expect.any(String), status: "sent", refs: { clientId } },
		]);
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
			config: countConfig("activities", "entityType"),
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
			config: countConfig("projects", "completedAt_month", {
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "completed" }],
						},
					],
				},
			}),
		});

		expect(result.total).toBe(1);
		expect(result.data).toEqual([
			{ label: "Apr 2024", value: 1, bucketKey: "2024-04", metadata: { dateKey: "2024-04" } },
		]);
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
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "sum", field: "total" },
				groupBy: "dueDate_month",
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
			},
		});

		expect(result.total).toBe(500);
		expect(result.data).toEqual([
			{ label: "Jul 2024", value: 500, bucketKey: "2024-07", metadata: { dateKey: "2024-07" } },
		]);
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
			config: countConfig("tasks", "assigneeUserId"),
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
	it("every GROUP_BY_OPTIONS value resolves to an executable v2 config", () => {
		for (const entity of Object.keys(GROUP_BY_OPTIONS) as ReportEntityType[]) {
			for (const { value } of GROUP_BY_OPTIONS[entity]) {
				const { config } = configForGroupByKey(entity, value, {
					visualization: { type: "bar" },
				});
				const groupable =
					config.metric.op === "ratio" ||
					(config.groupBy !== undefined && isGenericGroupBy(entity, config.groupBy));
				expect(groupable, `${entity}.${value} must resolve to something executable`).toBe(
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

	it("before / after are strict instant comparisons on numbers only (R7)", () => {
		const before: ReportFilters = {
			logic: "and",
			groups: [
				{ logic: "and", rules: [{ field: "dueDate", operator: "before", value: 1000 }] },
			],
		};
		expect(evaluateReportFilters({ dueDate: 999 }, before)).toBe(true);
		expect(evaluateReportFilters({ dueDate: 1000 }, before)).toBe(false);
		expect(evaluateReportFilters({ dueDate: "999" }, before)).toBe(false);

		const after: ReportFilters = {
			logic: "and",
			groups: [
				{ logic: "and", rules: [{ field: "dueDate", operator: "after", value: 1000 }] },
			],
		};
		expect(evaluateReportFilters({ dueDate: 1001 }, after)).toBe(true);
		expect(evaluateReportFilters({ dueDate: 1000 }, after)).toBe(false);
		expect(evaluateReportFilters({ dueDate: undefined }, after)).toBe(false);
	});

	it("on matches the org-timezone calendar day, not the UTC day (R7)", () => {
		// 2026-08-28T02:00Z is still Aug 27 in New York (10pm EDT). A rule value
		// anywhere inside Aug 27 ET must match it; the same rule under UTC
		// (timezone omitted) must not.
		const row = { paidAt: Date.UTC(2026, 7, 28, 2, 0) };
		const onAug27: ReportFilters = {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [
						{ field: "paidAt", operator: "on", value: Date.UTC(2026, 7, 27, 15, 0) },
					],
				},
			],
		};
		expect(evaluateReportFilters(row, onAug27, "America/New_York")).toBe(true);
		expect(evaluateReportFilters(row, onAug27)).toBe(false);

		const onAug28: ReportFilters = {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [
						{ field: "paidAt", operator: "on", value: Date.UTC(2026, 7, 28, 15, 0) },
					],
				},
			],
		};
		expect(evaluateReportFilters(row, onAug28, "America/New_York")).toBe(false);
		expect(evaluateReportFilters(row, onAug28)).toBe(true);
		expect(evaluateReportFilters({ paidAt: null }, onAug28, "America/New_York")).toBe(false);
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

describe("registry widening (R6): payments + line items", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedFinancials() {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
		);
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const seeded = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, {});
			const inv1 = await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "INV-A",
			});
			const inv2 = await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "INV-B",
			});
			const skuId = await ctx.db.insert("skus", {
				orgId: org.orgId,
				name: "Standard Mow",
				unit: "hour",
				rate: 60,
				isActive: true,
				createdAt: 1,
				updatedAt: 1,
			});
			const base = { orgId: org.orgId, sortOrder: 0 };
			await ctx.db.insert("payments", {
				...base,
				invoiceId: inv1,
				paymentAmount: 100,
				dueDate: Date.UTC(2026, 0, 20),
				status: "pending",
			});
			await ctx.db.insert("payments", {
				...base,
				invoiceId: inv1,
				paymentAmount: 250,
				dueDate: Date.UTC(2026, 1, 20),
				status: "overdue",
			});
			await ctx.db.insert("payments", {
				...base,
				invoiceId: inv2,
				paymentAmount: 900,
				dueDate: Date.UTC(2026, 2, 20),
				status: "paid",
				paidAt: Date.UTC(2026, 2, 25),
			});
			await ctx.db.insert("invoiceLineItems", {
				...base,
				invoiceId: inv1,
				description: "Deep clean",
				quantity: 3,
				unitPrice: 300,
				total: 900,
				cost: 120,
				skuId,
			});
			await ctx.db.insert("invoiceLineItems", {
				...base,
				invoiceId: inv1,
				description: "Supplies",
				quantity: 1,
				unitPrice: 50,
				total: 50,
			});
			return { clientId, inv1, inv2, skuId };
		});
		return { org, asOrg, ...seeded };
	}

	it("payments by status: canonical registry order, summary Value column, currency total", async () => {
		const { asOrg } = await seedFinancials();
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "payments",
			config: { version: 2, entityType: "payments", metric: { op: "count" }, groupBy: "status" },
		});
		expect(result.data).toStrictEqual([
			{ label: "Pending", value: 1, bucketKey: "pending", metadata: { totalValue: 100 } },
			{ label: "Paid", value: 1, bucketKey: "paid", metadata: { totalValue: 900 } },
			{ label: "Overdue", value: 1, bucketKey: "overdue", metadata: { totalValue: 250 } },
		]);
		expect(result.total).toBe(1250);
		expect(result.metadata?.totalIsCurrency).toBe(true);
	});

	it("payments date range applies to dueDate (the entity dateField)", async () => {
		const { asOrg } = await seedFinancials();
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "payments",
			config: {
				version: 2,
				entityType: "payments",
				metric: { op: "sum", field: "paymentAmount" },
				date: {
					range: {
						kind: "absolute",
						start: Date.UTC(2026, 0, 1),
						end: Date.UTC(2026, 1, 28),
					},
				},
			},
		});
		expect(result.total).toBe(350);
		expect(result.metadata?.totalIsCurrency).toBe(true);
	});

	it("payments group by invoiceId label-resolves invoice numbers", async () => {
		const { asOrg } = await seedFinancials();
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "payments",
			config: {
				version: 2,
				entityType: "payments",
				metric: { op: "sum", field: "paymentAmount" },
				groupBy: "invoiceId",
			},
		});
		expect(result.data.map((d) => ({ label: d.label, value: d.value }))).toStrictEqual([
			{ label: "INV-B", value: 900 },
			{ label: "INV-A", value: 350 },
		]);
	});

	it("line items group by skuId: SKU name labels, null fk becomes No SKU", async () => {
		const { asOrg } = await seedFinancials();
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoiceLineItems",
			config: {
				version: 2,
				entityType: "invoiceLineItems",
				metric: { op: "sum", field: "total" },
				groupBy: "skuId",
			},
		});
		expect(result.data.map((d) => ({ label: d.label, value: d.value }))).toStrictEqual([
			{ label: "Standard Mow", value: 900 },
			{ label: "No SKU", value: 50 },
		]);
		expect(result.metadata?.itemValueIsCurrency).toBe(true);
	});

	it("permission mapping: payments and invoiceLineItems gate on invoices, quoteLineItems on quotes", async () => {
		const { org } = await seedFinancials();
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
					quotes: { level: "view", allRecords: true },
					invoices: { level: "view" },
				},
			});
		});
		const asMember = t.withIdentity(createTestIdentity(member.clerkUserId, org.clerkOrgId));

		const bare = { version: 2, metric: { op: "count" } } as const;
		// quotes allRecords covers quoteLineItems…
		const qli = await asMember.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: { ...bare, entityType: "quoteLineItems" },
		});
		expect(qli.total).toBe(0);

		// …but invoices without allRecords denies payments and invoiceLineItems.
		for (const entityType of ["payments", "invoiceLineItems"] as const) {
			const caught = await asMember
				.query(api.reportData.executeReport, {
					entityType,
					config: { ...bare, entityType },
				})
				.then(
					() => null,
					(error: unknown) => error
				);
			expect(caught, entityType).not.toBeNull();
		}
	});
});

describe("drill-down: bucketKey on data points and detail scoping", () => {
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
			if (timezone) await ctx.db.patch(setup.orgId, { timezone });
			return setup;
		});
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		return { org, asOrg };
	}

	const countConfig = (
		entityType: ReportConfigV2["entityType"],
		groupBy?: string,
		extra: Partial<ReportConfigV2> = {}
	): ReportConfigV2 => ({
		version: 2,
		entityType,
		metric: { op: "count" },
		...(groupBy ? { groupBy } : {}),
		...extra,
	});

	// ==========================================================================
	// 1. Data points expose the raw bucket key
	// ==========================================================================

	it("bucketKey: direct field grouping carries the raw field value", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "lead" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, {});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "leadSource"),
		});

		// Only the null-leadSource rows exist, so the single bucket is "unknown".
		expect(result.data.map((d) => d.bucketKey)).toEqual(["unknown"]);

		const byStatus = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "status"),
		});
		expect(byStatus.data.map((d) => ({ label: d.label, bucketKey: d.bucketKey }))).toEqual([
			{ label: "Lead", bucketKey: "lead" },
			{ label: "Active", bucketKey: "active" },
		]);
	});

	it("bucketKey: month grouping carries the dateKey", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 0, 15),
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 1, 10),
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: countConfig("invoices", "issuedDate_month"),
		});

		expect(result.data.map((d) => d.bucketKey)).toEqual(["2026-01", "2026-02"]);
	});

	it("bucketKey: dotted-path grouping carries the resolved value, broken paths their prefixed key", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			const acme = await createTestClient(ctx, org.orgId, {
				companyName: "Acme",
				leadSource: "website",
			});
			await createTestTask(ctx, org.orgId, { clientId: acme });
			await createTestTask(ctx, org.orgId, {});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: countConfig("tasks", "clientId.leadSource"),
		});

		expect(result.data.map((d) => ({ label: d.label, bucketKey: d.bucketKey }))).toEqual([
			{ label: "Website", bucketKey: "website" },
			{ label: "No Client", bucketKey: "__broken:clients" },
		]);
	});

	it("bucketKey: the ungrouped Total point has none", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run((ctx) => createTestClient(ctx, org.orgId));

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients"),
		});

		expect(result.data).toEqual([{ label: "Total", value: 1 }]);
	});

	// ==========================================================================
	// 2. detail.bucketKey scopes the scanned rows
	// ==========================================================================

	it("detail bucketKey: direct-field bucket returns only its rows", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", quoteNumber: "Q-1" });
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", quoteNumber: "Q-2" });
			await createTestQuote(ctx, org.orgId, clientId, { status: "draft", quoteNumber: "Q-3" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config: countConfig("quotes", "status"),
			detail: { columns: ["quoteNumber", "status"], bucketKey: "sent" },
		});

		expect(result.detail?.rows.map((r) => r.quoteNumber).sort()).toEqual(["Q-1", "Q-2"]);
		expect(result.detail?.totalMatched).toBe(2);
		expect(result.detail?.rowsTruncated).toBe(false);
		expect(result.total).toBe(2);
	});

	it("detail bucketKey: the 'unknown' bucket returns the null-valued rows", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, {
				companyName: "Has Source",
				leadSource: "website",
			});
			await createTestClient(ctx, org.orgId, { companyName: "No Source" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: countConfig("clients", "leadSource"),
			detail: { columns: ["companyName"], bucketKey: "unknown" },
		});

		expect(result.detail?.rows.map((r) => r.companyName)).toEqual(["No Source"]);
		expect(result.detail?.totalMatched).toBe(1);
	});

	it("detail bucketKey: month bucket uses the org calendar, not UTC", async () => {
		const { org, asOrg } = await seedOrg("Pacific/Auckland");
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		// 2026-01-31 20:00 UTC is 2026-02-01 09:00 in Auckland (UTC+13 in January).
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "INV-BOUNDARY",
				issuedDate: Date.UTC(2026, 0, 31, 20, 0),
			});
			await createTestInvoice(ctx, org.orgId, clientId, {
				invoiceNumber: "INV-MID-JAN",
				issuedDate: Date.UTC(2026, 0, 15, 0, 0),
			});
		});

		const config = countConfig("invoices", "issuedDate_month");
		const feb = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
			detail: { columns: ["invoiceNumber"], bucketKey: "2026-02" },
		});
		expect(feb.detail?.rows.map((r) => r.invoiceNumber)).toEqual(["INV-BOUNDARY"]);
		expect(feb.detail?.totalMatched).toBe(1);

		const jan = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
			detail: { columns: ["invoiceNumber"], bucketKey: "2026-01" },
		});
		expect(jan.detail?.rows.map((r) => r.invoiceNumber)).toEqual(["INV-MID-JAN"]);
	});

	it("detail bucketKey: dotted-path bucket scopes line items to one client", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			const acme = await createTestClient(ctx, org.orgId, { companyName: "Acme" });
			const globex = await createTestClient(ctx, org.orgId, { companyName: "Globex" });
			const acmeQuote = await createTestQuote(ctx, org.orgId, acme, { quoteNumber: "Q-A" });
			const globexQuote = await createTestQuote(ctx, org.orgId, globex, { quoteNumber: "Q-G" });
			const lineItem = (quoteId: Id<"quotes">, description: string) =>
				ctx.db.insert("quoteLineItems", {
					orgId: org.orgId,
					quoteId,
					description,
					quantity: 1,
					unit: "hour",
					rate: 100,
					amount: 100,
					sortOrder: 0,
				});
			await lineItem(acmeQuote, "Acme mow");
			await lineItem(acmeQuote, "Acme edge");
			await lineItem(globexQuote, "Globex mow");
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: countConfig("quoteLineItems", "quoteId.clientId.companyName"),
			detail: { columns: ["description", "amount"], bucketKey: "Acme" },
		});

		expect(result.detail?.rows.map((r) => r.description).sort()).toEqual([
			"Acme edge",
			"Acme mow",
		]);
		expect(result.detail?.totalMatched).toBe(2);
	});

	it("detail bucketKey: the broken-path bucket returns the rows whose path breaks", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			const acme = await createTestClient(ctx, org.orgId, {
				companyName: "Acme",
				leadSource: "website",
			});
			await createTestTask(ctx, org.orgId, { clientId: acme, title: "Has client" });
			await createTestTask(ctx, org.orgId, { title: "No client" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: countConfig("tasks", "clientId.leadSource"),
			detail: { columns: ["title"], bucketKey: "__broken:clients" },
		});

		expect(result.detail?.rows.map((r) => r.title)).toEqual(["No client"]);
		expect(result.detail?.totalMatched).toBe(1);
	});

	it("detail bucketKey: without a groupBy it throws", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				config: countConfig("quotes"),
				detail: { columns: ["quoteNumber"], bucketKey: "sent" },
			})
		).rejects.toThrow(/requires a groupBy/);
	});

	it("detail bucketKey: scoping composes with the row cap", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await createTestQuote(ctx, org.orgId, clientId, { status: "sent" });
			}
			await createTestQuote(ctx, org.orgId, clientId, { status: "draft" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config: countConfig("quotes", "status"),
			detail: { columns: ["status"], bucketKey: "sent", limit: 3 },
		});

		expect(result.detail?.rows).toHaveLength(3);
		expect(result.detail?.totalMatched).toBe(5);
		expect(result.detail?.rowsTruncated).toBe(true);
		expect(result.total).toBe(5);
	});

	// ==========================================================================
	// 3. Detail rows carry their record id
	// ==========================================================================

	it("detail rows carry the record _id as `id`", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		const quoteId = await t.run((ctx) =>
			createTestQuote(ctx, org.orgId, clientId, { status: "sent", quoteNumber: "Q-1" })
		);

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config: detailConfig("quotes"),
			detail: { columns: ["quoteNumber"] },
		});

		expect(result.detail?.rows).toEqual([
			{ id: quoteId, quoteNumber: "Q-1", refs: { clientId } },
		]);
	});

	// ==========================================================================
	// 4. FK fields as detail columns
	// ==========================================================================

	it("detail: a registered FK column returns the raw id string", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run((ctx) =>
			createTestTask(ctx, org.orgId, { assigneeUserId: org.userId, title: "Mow" })
		);

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: detailConfig("tasks"),
			detail: { columns: ["title", "assigneeUserId"] },
		});

		expect(result.detail?.rows[0].assigneeUserId).toBe(org.userId);
		expect(result.detail?.columns).toContainEqual({
			field: "assigneeUserId",
			label: "Assignee",
			type: "string",
		});
	});

	// REPORT_FIELDS deliberately omits v.id foreign keys, so parent links come
	// from the per-row `refs` map, never from a column.
	it.each([
		["tasks", "projectId"],
		["payments", "invoiceId"],
		["quoteLineItems", "quoteId"],
	] as const)("detail: %s.%s is not an accepted column", async (entityType, column) => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType,
				config: detailConfig(entityType),
				detail: { columns: [column] },
			})
		).rejects.toThrow(/Unknown report detail column/);
	});

	// ==========================================================================
	// 4b. Detail rows expose their FK ids through `refs`
	// ==========================================================================

	it("detail refs: line item rows carry their parent quote id", async () => {
		const { org, asOrg } = await seedOrg();
		const { quoteId } = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId, { companyName: "Acme" });
			const quoteId = await createTestQuote(ctx, org.orgId, clientId, {
				quoteNumber: "Q-A",
			});
			await ctx.db.insert("quoteLineItems", {
				orgId: org.orgId,
				quoteId,
				description: "Acme mow",
				quantity: 1,
				unit: "hour",
				rate: 100,
				amount: 100,
				sortOrder: 0,
			});
			return { quoteId };
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quoteLineItems",
			config: detailConfig("quoteLineItems"),
			detail: { columns: ["description"] },
		});

		// skuId is unset, so only the edge the row actually carries appears.
		expect(result.detail?.rows).toEqual([
			{ id: expect.any(String), description: "Acme mow", refs: { quoteId } },
		]);
	});

	it("detail refs: every set edge appears; a row with no edges has no refs", async () => {
		const { org, asOrg } = await seedOrg();
		const { clientId, projectId } = await t.run(async (ctx) => {
			const clientId = await createTestClient(ctx, org.orgId);
			const projectId = await createTestProject(ctx, org.orgId, clientId);
			await createTestTask(ctx, org.orgId, {
				title: "Linked",
				clientId,
				projectId,
				date: Date.UTC(2026, 0, 2),
			});
			await createTestTask(ctx, org.orgId, { title: "Orphan", date: Date.UTC(2026, 0, 1) });
			return { clientId, projectId };
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: detailConfig("tasks"),
			detail: { columns: ["title"] },
		});

		const rows = result.detail?.rows ?? [];
		const linked = rows.find((r) => r.title === "Linked");
		const orphan = rows.find((r) => r.title === "Orphan");
		expect(linked?.refs).toEqual({ projectId, clientId });
		// No assignee, project or client — the map is omitted, not left empty.
		expect(orphan).toEqual({ id: expect.any(String), title: "Orphan" });
	});

	it("detail refs: an entity with no relation edges never carries refs", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run((ctx) => createTestClient(ctx, org.orgId, { companyName: "Acme" }));

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			config: detailConfig("clients"),
			detail: { columns: ["companyName"] },
		});

		expect(result.detail?.rows).toEqual([
			{ id: expect.any(String), companyName: "Acme" },
		]);
	});

	// ==========================================================================
	// 5. Ratio config + detail
	// ==========================================================================

	it("detail against a ratio config returns plain rows instead of throwing", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "approved" });
			await createTestQuote(ctx, org.orgId, clientId, { status: "declined" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config: {
				version: 2,
				entityType: "quotes",
				metric: { op: "ratio", ratioKey: "conversionRate" },
			},
			detail: { columns: ["status"] },
		});

		expect(result.detail?.rows.map((r) => r.status).sort()).toEqual(["approved", "declined"]);
		expect(result.detail?.totalMatched).toBe(2);
	});
});
