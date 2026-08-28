import { vi } from "vitest";
import {
	createTestOrg,
	createTestIdentity,
	createTestClient,
	createTestProject,
	createTestTask,
	createTestQuote,
	createTestInvoice,
} from "./test.helpers";
import type { setupConvexTest } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import type { ReportEntityType } from "./lib/reportFields";

/**
 * Canonical golden-fixture org shared by reportGoldens.test.ts (pins legacy
 * dispatch) and reportDualRun.test.ts (proves the unified pipeline reproduces
 * it). One seed, two suites — a drifted copy would produce unexplainable diffs.
 *
 * Callers must fake Date at GOLDEN_T0 before seeding (only Date — timers stay
 * real so convex-test's scheduler is untouched); the seed advances the clock
 * 1s per insert so _creationTime buckets are stable. Org timezone is pinned to
 * America/New_York; seeded timestamps sit at 15:00 UTC so their ET calendar
 * date is unambiguous.
 */

export const GOLDEN_T0 = Date.UTC(2026, 5, 15, 12, 0, 0);

export type MatrixArgs = {
	entityType: ReportEntityType;
	groupBy?: string;
	dateRange?: { start?: number; end?: number };
};

export const LEGACY_MATRIX: Record<string, MatrixArgs> = {
	"clients::__default__": { entityType: "clients" },
	"clients::status": { entityType: "clients", groupBy: "status" },
	"clients::leadSource": { entityType: "clients", groupBy: "leadSource" },
	"clients::creationDate_month": { entityType: "clients", groupBy: "creationDate_month" },
	"clients::creationDate_week": { entityType: "clients", groupBy: "creationDate_week" },
	"clients::creationDate_day": { entityType: "clients", groupBy: "creationDate_day" },
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

export async function seedCanonicalOrg(t: ReturnType<typeof setupConvexTest>) {
	let clock = GOLDEN_T0;
	const tick = () => {
		clock += 1000;
		vi.setSystemTime(clock);
	};

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

	const quoteIds: Id<"quotes">[] = [];
	const quotes = [
		{ quoteNumber: "Q-1001", status: "draft", total: 500 },
		{ quoteNumber: "Q-1002", status: "sent", total: 1000.5 },
		{ quoteNumber: "Q-1003", status: "sent", total: 250 },
		{ quoteNumber: "Q-1004", status: "approved", total: 2000 },
		{ quoteNumber: "Q-1005", status: "declined", total: 750 },
	] as const;
	for (const q of quotes) {
		tick();
		quoteIds.push(await t.run((ctx) => createTestQuote(ctx, org.orgId, clientIds[0], { ...q })));
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
	const invoiceIds: Id<"invoices">[] = [];
	for (const { client, ...inv } of invoices) {
		tick();
		invoiceIds.push(
			await t.run((ctx) => createTestInvoice(ctx, org.orgId, clientIds[client], { ...inv }))
		);
	}

	tick();
	const skuId = await t.run((ctx) =>
		ctx.db.insert("skus", {
			orgId: org.orgId,
			name: "Standard Mow",
			unit: "hour",
			rate: 60,
			isActive: true,
			createdAt: Date.UTC(2026, 0, 2, 15),
			updatedAt: Date.UTC(2026, 0, 2, 15),
		})
	);

	const payments = [
		{ invoice: 0, status: "pending", paymentAmount: 100, dueDate: Date.UTC(2026, 0, 20, 15) },
		{ invoice: 1, status: "sent", paymentAmount: 200, dueDate: Date.UTC(2026, 1, 10, 15) },
		{
			invoice: 2,
			status: "paid",
			paymentAmount: 1200,
			dueDate: Date.UTC(2026, 1, 1, 15),
			paidAt: Date.UTC(2026, 1, 1, 15),
		},
		{ invoice: 4, status: "overdue", paymentAmount: 300, dueDate: Date.UTC(2026, 2, 15, 15) },
	] as const;
	for (const [i, { invoice, ...p }] of payments.entries()) {
		tick();
		await t.run((ctx) =>
			ctx.db.insert("payments", { orgId: org.orgId, invoiceId: invoiceIds[invoice], sortOrder: i, ...p })
		);
	}

	const quoteLineItems = [
		{ description: "Weekly mowing", quantity: 4, unit: "hour", rate: 60, amount: 240, cost: 25, sku: true },
		{ description: "Edging", quantity: 2, unit: "hour", rate: 55, amount: 110, sku: false },
	] as const;
	for (const [i, { sku, ...li }] of quoteLineItems.entries()) {
		tick();
		await t.run((ctx) =>
			ctx.db.insert("quoteLineItems", {
				orgId: org.orgId,
				quoteId: quoteIds[0],
				sortOrder: i,
				...(sku ? { skuId } : {}),
				...li,
			})
		);
	}

	const invoiceLineItems = [
		{ description: "Deep clean", quantity: 3, unitPrice: 300, total: 900, cost: 120, sku: true },
		{ description: "Supplies", quantity: 1, unitPrice: 300, total: 300, sku: false },
	] as const;
	for (const [i, { sku, ...li }] of invoiceLineItems.entries()) {
		tick();
		await t.run((ctx) =>
			ctx.db.insert("invoiceLineItems", {
				orgId: org.orgId,
				invoiceId: invoiceIds[2],
				sortOrder: i,
				...(sku ? { skuId } : {}),
				...li,
			})
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
