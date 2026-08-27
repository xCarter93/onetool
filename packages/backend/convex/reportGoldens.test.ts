import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { REPORT_PRESETS, type ReportPresetDefinition } from "./lib/reportPresets";
import { toExecuteReportArgs, type GeneratedReport } from "./reportConfigGeneration";
import {
	DEFAULT_DETAIL_COLUMNS,
	GROUP_BY_OPTIONS,
	usesLegacyDispatch,
	type ReportEntityType,
} from "./lib/reportFields";
import type { ReportFilters } from "./lib/reportFilters";
import type { Id } from "./_generated/dataModel";
import presetArgsGolden from "./__goldens__/report-preset-args.json";
import legacyDispatchGolden from "./__goldens__/report-legacy-dispatch.json";
import detailModeGolden from "./__goldens__/report-detail-mode.json";

/**
 * R0 characterization goldens (PRD-reports-redesign §6). These pin the
 * executeReport compatibility boundary BEFORE the legacy-dispatch retirement:
 * R4a dual-runs the generic pipeline against these exact fixtures and R4c may
 * not delete runReportByConfig until they match (minus the two whitelisted
 * deltas: "Prospective"→"Lead" and top-10-clients→series-limit, §8 d2/d3).
 *
 * The assistant's runReport tool forwards executeReport's result verbatim
 * (assistantTools.ts adds only a `visualization` passthrough) and sends bare
 * { entityType, groupBy, dateRange } args — so the legacy-dispatch fixtures
 * below ARE the assistant payload pin as well. Preset args are pinned with
 * null start/end dates: the fixture pins the config→args mapping; relative
 * date windows are the web's getDateRange concern and separately tested.
 *
 * Fixtures are hand-checked JSON in __goldens__/ compared with toStrictEqual
 * after a JSON round-trip (so key presence matters, undefined doesn't hide
 * drift). There is deliberately NO regeneration flag: to regenerate one,
 * temporarily log the actual JSON, review the diff by hand, and commit —
 * blessing drift must stay a deliberate act.
 *
 * Determinism: Date is faked (only Date — timers stay real so convex-test's
 * scheduler is untouched) and every insert advances the clock by 1s, so
 * _creationTime, creationDate_* buckets, and Date.now() defaults are stable.
 * The org timezone is pinned to America/New_York; all seeded timestamps sit
 * at 15:00 UTC so their ET calendar date is unambiguous.
 */

const T0 = Date.UTC(2026, 5, 15, 12, 0, 0);

// Duplicated from reportPresets.test.ts (test-local helpers can't be imported
// across test files without executing the other suite).
function toGenFilters(filters: ReportFilters | null): GeneratedReport["filters"] {
	if (!filters) return null;
	return {
		logic: filters.logic,
		groups: filters.groups.map((group) => ({
			logic: group.logic,
			rules: group.rules.map((rule) => ({
				field: rule.field,
				operator: rule.operator,
				value: rule.value ?? null,
			})),
		})),
	};
}

function presetToGeneratedReport(preset: ReportPresetDefinition): GeneratedReport {
	return {
		entityType: preset.entityType,
		groupBy: preset.groupBy,
		measure: preset.measure,
		filters: toGenFilters(preset.filters),
		columns: preset.columns,
		startDate: null,
		endDate: null,
		visualization: preset.visualization,
		name: preset.name,
		description: preset.description,
	};
}

function roundTrip(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

describe("preset → executeReport args goldens", () => {
	it("all 14 presets map to their pinned args", () => {
		const actual = Object.fromEntries(
			REPORT_PRESETS.map((preset) => [
				preset.id,
				roundTrip(toExecuteReportArgs(presetToGeneratedReport(preset))),
			])
		);
		expect(actual).toStrictEqual(presetArgsGolden);
	});
});

describe("executeReport output goldens", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let clock: number;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"], now: T0 });
		clock = T0;
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function tick() {
		clock += 1000;
		vi.setSystemTime(clock);
	}

	async function seedCanonicalOrg() {
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx, {
				clerkUserId: "user_1",
				clerkOrgId: "org_1",
			});
			await ctx.db.patch(setup.orgId, { timezone: "America/New_York" });
			return setup;
		});
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));

		const clientIds: Id<"clients">[] = [];
		const clients = [
			{ companyName: "Acme Cleaning", status: "lead", leadSource: "website" },
			{ companyName: "Birch Landscaping", status: "active", leadSource: "website" },
			{ companyName: "Cedar HVAC", status: "active", leadSource: "referral" },
			{ companyName: "Dogwood Plumbing", status: "inactive", leadSource: "advertising" },
			{ companyName: "Elm Roofing", status: "archived" },
		] as const;
		for (const c of clients) {
			tick();
			clientIds.push(await t.run((ctx) => createTestClient(ctx, org.orgId, { ...c })));
		}

		const projects = [
			{ status: "planned", projectType: "one-off" },
			{ status: "in-progress", projectType: "recurring" },
			{ status: "completed", projectType: "one-off" },
			{ status: "cancelled", projectType: "recurring" },
		] as const;
		for (const [i, p] of projects.entries()) {
			tick();
			const id = await t.run((ctx) =>
				createTestProject(ctx, org.orgId, clientIds[0], { ...p })
			);
			if (i === 2) {
				await t.run((ctx) => ctx.db.patch(id, { completedAt: Date.UTC(2026, 3, 10, 15) }));
			}
		}

		const tasks = [
			{ status: "completed", date: Date.UTC(2026, 4, 4, 15) },
			{ status: "completed", date: Date.UTC(2026, 4, 12, 15) },
			{ status: "pending", date: Date.UTC(2026, 4, 20, 15) },
			{ status: "in-progress", date: Date.UTC(2026, 5, 2, 15) },
			{ status: "cancelled", date: Date.UTC(2026, 5, 10, 15) },
		] as const;
		for (const task of tasks) {
			tick();
			await t.run((ctx) => createTestTask(ctx, org.orgId, { ...task }));
		}

		const quotes = [
			{ quoteNumber: "Q-1001", status: "draft", total: 500 },
			{ quoteNumber: "Q-1002", status: "sent", total: 1000.5 },
			{ quoteNumber: "Q-1003", status: "sent", total: 250 },
			{ quoteNumber: "Q-1004", status: "approved", total: 2000 },
			{ quoteNumber: "Q-1005", status: "declined", total: 750 },
		] as const;
		for (const q of quotes) {
			tick();
			await t.run((ctx) => createTestQuote(ctx, org.orgId, clientIds[0], { ...q }));
		}

		const invoices = [
			{
				invoiceNumber: "INV-1",
				status: "draft",
				total: 100,
				client: 0,
				issuedDate: Date.UTC(2026, 0, 5, 15),
				dueDate: Date.UTC(2026, 0, 20, 15),
			},
			{
				invoiceNumber: "INV-2",
				status: "sent",
				total: 200,
				client: 1,
				issuedDate: Date.UTC(2026, 0, 10, 15),
				dueDate: Date.UTC(2026, 1, 10, 15),
			},
			{
				invoiceNumber: "INV-3",
				status: "paid",
				total: 1200,
				client: 0,
				issuedDate: Date.UTC(2026, 0, 15, 15),
				dueDate: Date.UTC(2026, 1, 1, 15),
				paidAt: Date.UTC(2026, 1, 1, 15),
			},
			{
				invoiceNumber: "INV-4",
				status: "paid",
				total: 800,
				client: 1,
				issuedDate: Date.UTC(2026, 1, 10, 15),
				dueDate: Date.UTC(2026, 2, 1, 15),
				paidAt: Date.UTC(2026, 2, 20, 15),
			},
			{
				invoiceNumber: "INV-5",
				status: "overdue",
				total: 300,
				client: 0,
				issuedDate: Date.UTC(2026, 1, 15, 15),
				dueDate: Date.UTC(2026, 2, 15, 15),
			},
			{
				invoiceNumber: "INV-6",
				status: "cancelled",
				total: 50,
				client: 0,
				issuedDate: Date.UTC(2026, 2, 1, 15),
				dueDate: Date.UTC(2026, 2, 20, 15),
			},
		] as const;
		for (const { client, ...inv } of invoices) {
			tick();
			await t.run((ctx) =>
				createTestInvoice(ctx, org.orgId, clientIds[client], { ...inv })
			);
		}

		const activities = [
			{ activityType: "client_created", timestamp: Date.UTC(2026, 0, 6, 15) },
			{ activityType: "client_created", timestamp: Date.UTC(2026, 0, 20, 15) },
			{ activityType: "quote_sent", timestamp: Date.UTC(2026, 1, 7, 15) },
			{ activityType: "invoice_paid", timestamp: Date.UTC(2026, 2, 21, 15) },
		] as const;
		for (const a of activities) {
			tick();
			await t.run((ctx) =>
				ctx.db.insert("activities", {
					orgId: org.orgId,
					userId: org.userId,
					activityType: a.activityType,
					entityType: "client",
					entityId: "golden-entity-id",
					entityName: "Golden Entity",
					description: "golden seed activity",
					timestamp: a.timestamp,
					isVisible: true,
				})
			);
		}

		return { org, asOrg, clientIds };
	}

	type MatrixArgs = {
		entityType: ReportEntityType;
		groupBy?: string;
		dateRange?: { start?: number; end?: number };
	};

	const LEGACY_MATRIX: Record<string, MatrixArgs> = {
		"clients::__default__": { entityType: "clients" },
		"clients::status": { entityType: "clients", groupBy: "status" },
		"clients::leadSource": { entityType: "clients", groupBy: "leadSource" },
		"clients::creationDate_month": { entityType: "clients", groupBy: "creationDate_month" },
		"clients::creationDate_week": { entityType: "clients", groupBy: "creationDate_week" },
		"clients::creationDate_day": { entityType: "clients", groupBy: "creationDate_day" },
		// Pinned legacy semantics: an unknown literal silently falls back to the
		// entity default grouping.
		"clients::__unknown_literal_fallback__": {
			entityType: "clients",
			groupBy: "totallyBogusGroupBy",
		},
		"projects::__default__": { entityType: "projects" },
		"projects::status": { entityType: "projects", groupBy: "status" },
		"projects::projectType": { entityType: "projects", groupBy: "projectType" },
		"projects::creationDate_month": { entityType: "projects", groupBy: "creationDate_month" },
		"projects::creationDate_week": { entityType: "projects", groupBy: "creationDate_week" },
		"projects::creationDate_day": { entityType: "projects", groupBy: "creationDate_day" },
		"tasks::__default__": { entityType: "tasks" },
		"tasks::status": { entityType: "tasks", groupBy: "status" },
		"tasks::completionRate": { entityType: "tasks", groupBy: "completionRate" },
		"tasks::date_month": { entityType: "tasks", groupBy: "date_month" },
		"tasks::date_week": { entityType: "tasks", groupBy: "date_week" },
		"tasks::date_day": { entityType: "tasks", groupBy: "date_day" },
		"quotes::__default__": { entityType: "quotes" },
		"quotes::status": { entityType: "quotes", groupBy: "status" },
		"quotes::conversionRate": { entityType: "quotes", groupBy: "conversionRate" },
		"invoices::__default__": { entityType: "invoices" },
		"invoices::status": { entityType: "invoices", groupBy: "status" },
		"invoices::month": { entityType: "invoices", groupBy: "month" },
		"invoices::client": { entityType: "invoices", groupBy: "client" },
		"activities::__default__": { entityType: "activities" },
		"activities::activityType": { entityType: "activities", groupBy: "activityType" },
		"activities::timestamp_month": { entityType: "activities", groupBy: "timestamp_month" },
		"activities::timestamp_week": { entityType: "activities", groupBy: "timestamp_week" },
		"activities::timestamp_day": { entityType: "activities", groupBy: "timestamp_day" },
		// Dated variants pin metadata.dateRange plus paidAt-vs-issuedDate window
		// semantics (the Feb window keeps INV-3, paid Feb 1, and drops INV-4).
		"invoices::month::feb-2026": {
			entityType: "invoices",
			groupBy: "month",
			dateRange: {
				start: Date.UTC(2026, 1, 1),
				end: Date.UTC(2026, 1, 28, 23, 59, 59, 999),
			},
		},
		"tasks::status::may-2026": {
			entityType: "tasks",
			groupBy: "status",
			dateRange: {
				start: Date.UTC(2026, 4, 1),
				end: Date.UTC(2026, 4, 31, 23, 59, 59, 999),
			},
		},
	};

	it("matrix covers every LEGACY_DISPATCH_GROUP_BY value plus each entity default", () => {
		const keys = new Set(Object.keys(LEGACY_MATRIX));
		for (const entity of Object.keys(GROUP_BY_OPTIONS) as ReportEntityType[]) {
			expect(keys.has(`${entity}::__default__`), `${entity} default missing`).toBe(true);
			for (const { value } of GROUP_BY_OPTIONS[entity]) {
				if (usesLegacyDispatch(entity, value)) {
					expect(keys.has(`${entity}::${value}`), `${entity}::${value} missing`).toBe(true);
				}
			}
		}
	});

	it("every legacy dispatch output matches its fixture byte-for-byte", async () => {
		const { asOrg } = await seedCanonicalOrg();
		const golden = legacyDispatchGolden as Record<string, unknown>;

		expect(Object.keys(golden).sort()).toStrictEqual(Object.keys(LEGACY_MATRIX).sort());

		for (const [key, args] of Object.entries(LEGACY_MATRIX)) {
			const result = await asOrg.query(api.reportData.executeReport, args);
			expect(roundTrip(result), key).toStrictEqual(golden[key]);
		}
	});

	it("detail mode with default columns matches its fixture per entity", async () => {
		const { asOrg } = await seedCanonicalOrg();
		const golden = detailModeGolden as Record<string, unknown>;

		const entities = Object.keys(DEFAULT_DETAIL_COLUMNS) as ReportEntityType[];
		expect(Object.keys(golden).sort()).toStrictEqual([...entities].sort());

		for (const entityType of entities) {
			const result = await asOrg.query(api.reportData.executeReport, {
				entityType,
				detail: { columns: DEFAULT_DETAIL_COLUMNS[entityType] },
			});
			expect(roundTrip(result), entityType).toStrictEqual(golden[entityType]);
		}
	});

	it(
		"scan ceiling: metadata.truncated flips once an org exceeds 10,000 rows",
		{ timeout: 120_000 },
		async () => {
			const org = await t.run((ctx) =>
				createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
			);
			const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));

			// REPORT_SCAN_CEILING + 1 minimal rows, batched to keep transactions sane.
			const TOTAL = 10_001;
			const BATCH = 500;
			for (let start = 0; start < TOTAL; start += BATCH) {
				const count = Math.min(BATCH, TOTAL - start);
				tick();
				await t.run(async (ctx) => {
					for (let i = 0; i < count; i++) {
						await ctx.db.insert("tasks", {
							orgId: org.orgId,
							title: "T",
							date: Date.UTC(2026, 4, 1, 15),
							status: "pending",
							type: "internal",
						});
					}
				});
			}

			const result = await asOrg.query(api.reportData.executeReport, {
				entityType: "tasks",
			});

			expect(result.metadata?.truncated).toBe(true);
			expect(result.total).toBe(10_000);
		}
	);
});
