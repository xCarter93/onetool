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
} from "./test.helpers";
import { api } from "./_generated/api";
import { evaluateReportFilters, type ReportFilters } from "./lib/reportFilters";
import type { Id } from "./_generated/dataModel";

/**
 * Pins the observable semantics of reportData.executeReport (the only live
 * export of reportData.ts) across all entity x groupBy combos, then locks in
 * two fixed TZ behaviors that the legacy implementation got wrong:
 *   - exact-ms date bounds (no server-local day re-clamping)
 *   - week bucketing computed in the org's IANA timezone
 * Also covers the new additive `filters` / `aggregation` args.
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

	// ==========================================================================
	// Clients
	// ==========================================================================

	it("clients default groupBy counts by status with prettified labels", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "lead" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "active" });
			await createTestClient(ctx, org.orgId, { status: "archived" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			dateRange: undefined,
		});

		expect(result.total).toBe(4);
		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ Prospective: 1, Active: 2, Archived: 1 });
		expect(result.metadata?.groupBy).toBe("status");
	});

	it("clients leadSource groups by lead source, capitalized, sorted desc", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { leadSource: "website" });
			await createTestClient(ctx, org.orgId, { leadSource: "website" });
			await createTestClient(ctx, org.orgId, { leadSource: "referral" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			groupBy: "leadSource",
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
			groupBy: "creationDate_month",
		});

		expect(result.data).toHaveLength(1);
		expect(result.total).toBe(1);
	});

	// ==========================================================================
	// Projects
	// ==========================================================================

	it("projects default groupBy counts by status (zero-filled to all statuses)", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestProject(ctx, org.orgId, clientId, { status: "planned" });
			await createTestProject(ctx, org.orgId, clientId, { status: "completed" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "projects",
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
			groupBy: "projectType",
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ "Recurring": 1, "One-off": 1 });
	});

	// ==========================================================================
	// Tasks — date field is `date`, not _creationTime
	// ==========================================================================

	it("tasks default groupBy counts all statuses without zero-filtering", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { status: "pending" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
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
			groupBy: "completionRate",
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
			dateRange: { start: Date.UTC(2024, 5, 1), end: Date.UTC(2024, 5, 30) },
		});

		expect(result.total).toBe(1);
	});

	// ==========================================================================
	// Quotes
	// ==========================================================================

	it("quotes default groupBy: counts per status with dollar totalValue metadata; total = dollars", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 500.5 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 250 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "approved", total: 1000 });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
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
			groupBy: "conversionRate",
		});

		expect(result.total).toBe(50); // 1/2
	});

	// ==========================================================================
	// Invoices — default date field is issuedDate; month/client specials use paidAt
	// ==========================================================================

	it("invoices default groupBy filters by issuedDate and reports dollar totals", async () => {
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
			dateRange: { start: Date.UTC(2024, 5, 1), end: Date.UTC(2024, 5, 30) },
		});

		expect(result.total).toBe(1200);
		const paid = result.data.find((d) => d.label === "Paid");
		expect(paid?.metadata).toEqual({ totalValue: 1200 });
	});

	it("invoices month groupBy sums paid revenue by paidAt month (paid status only)", async () => {
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

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			groupBy: "month",
		});

		expect(result.total).toBe(800);
		expect(result.data).toEqual([{ label: "2024-01", value: 800 }]);
	});

	it("invoices client groupBy revenue by client, top 10, paid only", async () => {
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

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			groupBy: "client",
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

	it("activities default groupBy counts by activityType", async () => {
		const { org, asOrg } = await seedOrg();
		await insertActivity(org.orgId, org.userId, { activityType: "client_created" });
		await insertActivity(org.orgId, org.userId, { activityType: "client_created" });
		await insertActivity(org.orgId, org.userId, { activityType: "quote_sent" });

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "activities",
		});

		const byLabel = Object.fromEntries(result.data.map((d) => [d.label, d.value]));
		expect(byLabel).toEqual({ "Client Created": 2, "Quote Sent": 1 });
	});

	// ==========================================================================
	// Unknown groupBy fallback (pinned: silently falls back to default grouping)
	// ==========================================================================

	it("unknown groupBy literal silently falls back to the entity's default grouping", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestClient(ctx, org.orgId, { status: "active" });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "clients",
			groupBy: "totallyBogusGroupBy",
		});

		expect(result.metadata?.groupBy).toBe("status");
		expect(result.total).toBe(1);
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
			dateRange: { start: Date.UTC(2024, 5, 1), end },
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
			groupBy: "timestamp_week",
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
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "active" }],
					},
				],
			},
		});

		expect(result.total).toBe(1);
	});

	it("filters: unknown field throws a ConvexError before scanning", async () => {
		const { asOrg } = await seedOrg();

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "notARealField", operator: "equals", value: "x" }],
						},
					],
				},
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
