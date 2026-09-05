import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestOrg,
	createTestProject,
	createTestTask,
} from "./test.helpers";
import { DateUtils } from "./lib/shared";

/**
 * Behavior lock for the always-on read paths that moved onto bounded index
 * ranges (notifications.listForCurrentUser, tasks.getStats/getOverdue,
 * homeStats journey + date ranges). Element order, limit semantics and the
 * shape mobile pins are the parts that must not move; every case here is
 * written against the behavior the pre-index versions produced.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 20, 15, 0, 0);
const TODAY = Date.UTC(2026, 4, 20);

describe("notifications.listForCurrentUser", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed() {
		const orgA = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_nlc", clerkOrgId: "org_nlc_a" })
		);
		const orgB = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_nlc_b",
				clerkOrgId: "org_nlc_b",
				userEmail: "b@example.com",
			})
		);
		// Same person in both orgs, so an unscoped userId bind would leak.
		await t.run((ctx) =>
			ctx.db.insert("organizationMemberships", {
				orgId: orgB.orgId,
				userId: orgA.userId,
				role: "admin",
			})
		);

		const asA = t.withIdentity(createTestIdentity(orgA.clerkUserId, "org_nlc_a"));
		const asB = t.withIdentity(createTestIdentity(orgA.clerkUserId, "org_nlc_b"));

		const titles = ["first", "second", "third", "fourth"];
		for (const title of titles) {
			await asA.mutation(api.notifications.create, {
				userId: orgA.userId,
				notificationType: "task_reminder",
				title,
				message: `msg ${title}`,
			});
		}
		await asB.mutation(api.notifications.create, {
			userId: orgA.userId,
			notificationType: "task_reminder",
			title: "other org",
			message: "should never appear for org A",
		});
		return { orgA, asA, asB, titles };
	}

	it("returns the current org's notifications newest-first with an exact unread count", async () => {
		const { asA, titles } = await seed();

		const all = await asA.query(api.notifications.listForCurrentUser, {});
		expect(all.notifications.map((n) => n.title)).toEqual(
			[...titles].reverse()
		);
		expect(all.unreadCount).toBe(4);
	});

	it("honours limit 1 and 50 (the two shapes shipped mobile builds send)", async () => {
		const { asA } = await seed();

		const one = await asA.query(api.notifications.listForCurrentUser, {
			limit: 1,
		});
		expect(one.notifications).toHaveLength(1);
		expect(one.notifications[0].title).toBe("fourth");
		expect(one.unreadCount).toBe(4);

		const fifty = await asA.query(api.notifications.listForCurrentUser, {
			limit: 50,
		});
		expect(fifty.notifications).toHaveLength(4);
		expect(fifty.unreadCount).toBe(4);
	});

	it("treats limit 0 as no limit, as it always has", async () => {
		const { asA } = await seed();
		const zero = await asA.query(api.notifications.listForCurrentUser, {
			limit: 0,
		});
		expect(zero.notifications).toHaveLength(4);
	});

	it("filters by isRead within the org and leaves unreadCount org-exact", async () => {
		const { asA } = await seed();
		const before = await asA.query(api.notifications.listForCurrentUser, {});
		await asA.mutation(api.notifications.markRead, {
			id: before.notifications[0]._id,
		});

		const unread = await asA.query(api.notifications.listForCurrentUser, {
			isRead: false,
		});
		expect(unread.notifications.map((n) => n.title)).toEqual([
			"third",
			"second",
			"first",
		]);
		expect(unread.unreadCount).toBe(3);

		const read = await asA.query(api.notifications.listForCurrentUser, {
			isRead: true,
		});
		expect(read.notifications.map((n) => n.title)).toEqual(["fourth"]);
		expect(read.unreadCount).toBe(3);
	});

	it("markAllRead only clears the active org", async () => {
		const { asA, asB } = await seed();

		expect(await asA.mutation(api.notifications.markAllRead, {})).toEqual({
			updated: 4,
		});
		expect(
			(await asA.query(api.notifications.listForCurrentUser, {})).unreadCount
		).toBe(0);
		expect(
			(await asB.query(api.notifications.listForCurrentUser, {})).unreadCount
		).toBe(1);
	});
});

describe("tasks.getStats / tasks.getOverdue", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seedTasks() {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, { clerkUserId: "user_tsk", clerkOrgId: "org_tsk" })
		);
		const other = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_tsk_o",
				clerkOrgId: "org_tsk_o",
				userEmail: "o@example.com",
			})
		);
		await t.run(async (ctx) => {
			// Two overdue tasks sharing a date, created in the order below: the
			// in-progress one first, so a status-major merge would reorder them.
			await createTestTask(ctx, org.orgId, {
				title: "overdue-inprogress",
				date: TODAY - 2 * DAY_MS,
				status: "in-progress",
			});
			await createTestTask(ctx, org.orgId, {
				title: "overdue-pending",
				date: TODAY - 2 * DAY_MS,
				status: "pending",
			});
			await createTestTask(ctx, org.orgId, {
				title: "overdue-older",
				date: TODAY - 9 * DAY_MS,
				status: "pending",
			});
			await createTestTask(ctx, org.orgId, {
				title: "overdue-but-done",
				date: TODAY - 3 * DAY_MS,
				status: "completed",
			});
			await createTestTask(ctx, org.orgId, {
				title: "today",
				date: TODAY,
				status: "pending",
			});
			await createTestTask(ctx, org.orgId, {
				title: "this-week",
				date: TODAY + 3 * DAY_MS,
				status: "in-progress",
			});
			await createTestTask(ctx, org.orgId, {
				title: "next-month",
				date: TODAY + 40 * DAY_MS,
				status: "cancelled",
			});
			// Different tenant: must never appear in either result.
			await createTestTask(ctx, other.orgId, {
				title: "other-org-overdue",
				date: TODAY - DAY_MS,
				status: "pending",
			});
		});
		return {
			asUser: t.withIdentity(createTestIdentity(org.clerkUserId, "org_tsk")),
		};
	}

	it("counts every status while bucketing only actionable work by date", async () => {
		const { asUser } = await seedTasks();
		const stats = await asUser.query(api.tasks.getStats, { today: TODAY });

		expect(stats).toEqual({
			total: 7,
			byStatus: { pending: 3, inProgress: 2, completed: 1, cancelled: 1 },
			todayTasks: 1,
			overdue: 3,
			thisWeek: 2,
			recurring: 0,
		});
	});

	it("defaults today to the server's start-of-day", async () => {
		const { asUser } = await seedTasks();
		expect(await asUser.query(api.tasks.getStats, {})).toEqual(
			await asUser.query(api.tasks.getStats, {
				today: DateUtils.startOfDay(Date.now()),
			})
		);
	});

	it("returns overdue tasks newest date first, creation order within a date", async () => {
		const { asUser } = await seedTasks();
		const overdue = await asUser.query(api.tasks.getOverdue, { today: TODAY });

		expect(overdue.map((task) => task.title)).toEqual([
			"overdue-inprogress",
			"overdue-pending",
			"overdue-older",
		]);
	});

	it("getOverdue defaults today to the server's start-of-day", async () => {
		const { asUser } = await seedTasks();
		expect(await asUser.query(api.tasks.getOverdue, {})).toEqual(
			await asUser.query(api.tasks.getOverdue, {
				today: DateUtils.startOfDay(Date.now()),
			})
		);
	});
});

describe("homeStats.getJourneyProgress", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg(suffix: string) {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_jp_${suffix}`,
				clerkOrgId: `org_jp_${suffix}`,
			})
		);
		return {
			orgId: org.orgId,
			asUser: t.withIdentity(
				createTestIdentity(org.clerkUserId, `org_jp_${suffix}`)
			),
		};
	}

	it("reports nothing done for an empty organization", async () => {
		const { asUser } = await seedOrg("empty");
		expect(await asUser.query(api.homeStats.getJourneyProgress, {})).toEqual({
			hasOrganization: false,
			hasClient: false,
			hasProject: false,
			hasQuote: false,
			hasESignature: false,
			hasInvoice: false,
			hasStripeConnect: false,
			hasPayment: false,
		});
	});

	it("ignores documents with no BoldSign id and invoices that are not paid", async () => {
		const { orgId, asUser } = await seedOrg("partial");
		const clientId = await t.run((ctx) => createTestClient(ctx, orgId));
		await t.run(async (ctx) => {
			await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: "doc-1",
				version: 1,
				storageId: await ctx.storage.store(new Blob(["pdf"])),
				generatedAt: Date.now(),
			});
		});
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-JP-1",
			status: "sent",
			subtotal: 100,
			taxAmount: 0,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + DAY_MS,
		});

		const progress = await asUser.query(api.homeStats.getJourneyProgress, {});
		expect(progress?.hasESignature).toBe(false);
		expect(progress?.hasInvoice).toBe(true);
		expect(progress?.hasPayment).toBe(false);
	});

	it("detects an e-signed document and a paid invoice", async () => {
		const { orgId, asUser } = await seedOrg("done");
		const clientId = await t.run((ctx) => createTestClient(ctx, orgId));
		await t.run(async (ctx) => {
			await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: "doc-2",
				version: 1,
				storageId: await ctx.storage.store(new Blob(["pdf"])),
				generatedAt: Date.now(),
				boldsignDocumentId: "bs-123",
			});
		});
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-JP-2",
			status: "sent",
			subtotal: 100,
			taxAmount: 0,
			total: 100,
			issuedDate: Date.now(),
			dueDate: Date.now() + DAY_MS,
		});
		await asUser.mutation(api.invoices.update, {
			id: invoiceId,
			status: "paid",
		});

		const progress = await asUser.query(api.homeStats.getJourneyProgress, {});
		expect(progress?.hasESignature).toBe(true);
		expect(progress?.hasPayment).toBe(true);
	});
});

describe("homeStats date-range charts", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seedOrg(suffix: string) {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_dr_${suffix}`,
				clerkOrgId: `org_dr_${suffix}`,
			})
		);
		return {
			orgId: org.orgId,
			asUser: t.withIdentity(
				createTestIdentity(org.clerkUserId, `org_dr_${suffix}`)
			),
		};
	}

	/** Real create+update so the aggregate triggers seed the baseline btrees. */
	async function createClientAt(
		asUser: ReturnType<typeof t.withIdentity>,
		at: number,
		companyName: string
	) {
		vi.setSystemTime(at);
		const id = await asUser.mutation(api.clients.create, {
			companyName,
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});
		return id;
	}

	it("counts clients inside the window and reads the baseline off the aggregate", async () => {
		// convex-test only ever moves _creationTime forward, so the org and every
		// client have to be seeded in chronological order.
		vi.setSystemTime(NOW - 60 * DAY_MS);
		const { asUser } = await seedOrg("clients");
		await createClientAt(asUser, NOW - 40 * DAY_MS, "Old One");
		await createClientAt(asUser, NOW - 35 * DAY_MS, "Old Two");
		await createClientAt(asUser, NOW - 5 * DAY_MS, "Recent");
		vi.setSystemTime(NOW);

		const result = await asUser.query(
			api.homeStats.getClientsCreatedByDateRange,
			{ from: NOW - 10 * DAY_MS, to: NOW }
		);

		expect(result.baselineCount).toBe(2);
		expect(result.totalInRange).toBe(1);
		expect(result.totalThroughEnd).toBe(3);
		expect(result.data).toHaveLength(1);
	});

	it("counts projects completed in the window and baselines the earlier ones", async () => {
		const { orgId, asUser } = await seedOrg("projects");
		const clientId = await t.run((ctx) => createTestClient(ctx, orgId));

		const completeAt = async (at: number, title: string) => {
			vi.setSystemTime(at);
			const id = await asUser.mutation(api.projects.create, {
				clientId,
				title,
				status: "planned",
				projectType: "one-off",
			});
			await asUser.mutation(api.projects.update, { id, status: "completed" });
			vi.setSystemTime(NOW);
		};
		await completeAt(NOW - 40 * DAY_MS, "Old");
		await completeAt(NOW - 4 * DAY_MS, "Recent");
		// An open project must not land in either number.
		await asUser.mutation(api.projects.create, {
			clientId,
			title: "Open",
			status: "in-progress",
			projectType: "one-off",
		});

		const result = await asUser.query(
			api.homeStats.getProjectsCompletedByDateRange,
			{ from: NOW - 10 * DAY_MS, to: NOW }
		);

		expect(result.baselineCount).toBe(1);
		expect(result.totalInRange).toBe(1);
		expect(result.totalThroughEnd).toBe(2);
	});

	it("returns only invoices paid inside the window, oldest invoice first", async () => {
		const { orgId, asUser } = await seedOrg("revenue");
		const clientId = await t.run((ctx) => createTestClient(ctx, orgId));

		const payAt = async (at: number, number: string, total: number) => {
			const id = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: number,
				status: "sent",
				subtotal: total,
				taxAmount: 0,
				total,
				issuedDate: NOW - 50 * DAY_MS,
				dueDate: NOW,
			});
			vi.setSystemTime(at);
			await asUser.mutation(api.invoices.update, { id, status: "paid" });
			vi.setSystemTime(NOW);
		};
		await payAt(NOW - 6 * DAY_MS, "INV-R-1", 100);
		await payAt(NOW - 2 * DAY_MS, "INV-R-2", 250);
		await payAt(NOW - 40 * DAY_MS, "INV-R-3", 999);
		// Never paid: excluded by both the old filter and the by_status read.
		await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-R-4",
			status: "sent",
			subtotal: 500,
			taxAmount: 0,
			total: 500,
			issuedDate: NOW,
			dueDate: NOW + DAY_MS,
		});

		const rows = await asUser.query(api.homeStats.getRevenueByDateRange, {
			from: NOW - 10 * DAY_MS,
			to: NOW,
		});

		expect(rows.map((row) => row.count)).toEqual([100, 250]);
	});
});

describe("pinned list contracts (shipped mobile builds call these with the args below)", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	function creationTimes(rows: { _creationTime: number }[]) {
		return rows.map((row) => row._creationTime);
	}

	function expectStrictlyDescending(times: number[]) {
		expect(times.length).toBeGreaterThan(1);
		for (let i = 1; i < times.length; i++) {
			expect(times[i]).toBeLessThan(times[i - 1]);
		}
	}

	async function seedOrg(suffix: string) {
		const org = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_pl_${suffix}`,
				clerkOrgId: `org_pl_${suffix}`,
			})
		);
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		const projectId = await t.run((ctx) =>
			createTestProject(ctx, org.orgId, clientId)
		);
		return {
			...org,
			clientId,
			projectId,
			asUser: t.withIdentity(
				createTestIdentity(org.clerkUserId, `org_pl_${suffix}`)
			),
		};
	}

	it("quotes.list {} and {status:'sent'} return newest-first", async () => {
		const { asUser, clientId } = await seedOrg("quotes");
		for (const [title, status] of [
			["q-1", "sent"],
			["q-2", "draft"],
			["q-3", "sent"],
		] as const) {
			await asUser.mutation(api.quotes.create, {
				clientId,
				title,
				status,
				subtotal: 100,
				total: 100,
			});
		}

		const all = await asUser.query(api.quotes.list, {});
		expect(all.map((q) => q.title)).toEqual(["q-3", "q-2", "q-1"]);
		expectStrictlyDescending(creationTimes(all));

		const sent = await asUser.query(api.quotes.list, { status: "sent" });
		expect(sent.map((q) => q.title)).toEqual(["q-3", "q-1"]);
		expectStrictlyDescending(creationTimes(sent));
	});

	it("invoices.list returns newest-first on every filter branch and never leaks across orgs", async () => {
		const a = await seedOrg("inv_a");
		const b = await seedOrg("inv_b");
		const create = async (
			org: typeof a,
			invoiceNumber: string,
			projectId?: Id<"projects">
		) =>
			org.asUser.mutation(api.invoices.create, {
				clientId: org.clientId,
				projectId,
				invoiceNumber,
				status: "sent",
				subtotal: 100,
				total: 100,
				issuedDate: NOW,
				dueDate: NOW + DAY_MS,
			});
		await create(a, "A-1", a.projectId);
		await create(a, "A-2");
		await create(a, "A-3", a.projectId);
		await create(b, "B-1", b.projectId);

		const numbers = (rows: { invoiceNumber: string }[]) =>
			rows.map((row) => row.invoiceNumber);

		const all = await a.asUser.query(api.invoices.list, {});
		expect(numbers(all)).toEqual(["A-3", "A-2", "A-1"]);
		expectStrictlyDescending(creationTimes(all));

		const byProject = await a.asUser.query(api.invoices.list, {
			projectId: a.projectId,
		});
		expect(numbers(byProject)).toEqual(["A-3", "A-1"]);
		expectStrictlyDescending(creationTimes(byProject));

		const byClient = await a.asUser.query(api.invoices.list, {
			clientId: a.clientId,
		});
		expect(numbers(byClient)).toEqual(["A-3", "A-2", "A-1"]);

		const byStatusAndClient = await a.asUser.query(api.invoices.list, {
			status: "sent",
			clientId: a.clientId,
		});
		expect(numbers(byStatusAndClient)).toEqual(["A-3", "A-2", "A-1"]);

		// by_project is not org-scoped; a foreign projectId used to yield [].
		expect(
			await a.asUser.query(api.invoices.list, { projectId: b.projectId })
		).toEqual([]);
	});

	it("tasks.list {} sorts by date ascending", async () => {
		const { asUser, clientId } = await seedOrg("tasks");
		for (const [title, offset] of [
			["t-later", 5],
			["t-soon", 1],
			["t-mid", 3],
		] as const) {
			await asUser.mutation(api.tasks.create, {
				title,
				date: TODAY + offset * DAY_MS,
				status: "pending",
				clientId,
			});
		}
		const tasks = await asUser.query(api.tasks.list, {});
		expect(tasks.map((task) => task.title)).toEqual([
			"t-soon",
			"t-mid",
			"t-later",
		]);
	});

	it("clients.listNamesForOrg returns only {_id, companyName} for non-archived clients", async () => {
		const { asUser, orgId, clientId } = await seedOrg("names");
		await t.run((ctx) =>
			createTestClient(ctx, orgId, {
				companyName: "Archived Co",
				status: "archived",
			})
		);
		const names = await asUser.query(api.clients.listNamesForOrg, {});
		expect(names).toEqual([{ _id: clientId, companyName: "Test Client" }]);
	});

	it("notifications.listByEntity returns mention rows newest-first with the author split out", async () => {
		const { asUser, orgId, clientId } = await seedOrg("mentions");
		const member = await t.run((ctx) => addMemberToOrg(ctx, orgId));
		for (const message of ["hello", "again"]) {
			await asUser.mutation(api.notifications.createMention, {
				mentionedUserIds: [member.userId],
				message,
				entityType: "client",
				entityId: clientId,
				entityName: "Test Company",
			});
		}

		const rows = await asUser.query(api.notifications.listByEntity, {
			entityType: "client",
			entityId: clientId,
		});
		expect(rows.map((row) => row.message)).toEqual(["again", "hello"]);
		expectStrictlyDescending(creationTimes(rows));
		expect(rows[0]).toMatchObject({
			notificationType: "client_mention",
			entityId: clientId,
			author: { name: expect.any(String), email: expect.any(String) },
		});
	});
});
