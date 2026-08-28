import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Phase-2 granular RBAC: gating of domain functions (clients, projects,
 * tasks, automations, quotes). Companion to
 * lib/permissionsResolver.test.ts, which covers the resolver + factory
 * helpers directly; this file drives the same machinery through the real
 * api.* handlers.
 */
describe("granular RBAC domain-function gating", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// t.query/t.mutation re-throw ConvexError with `.data` either as a plain
	// object or JSON-stringified (observed in quotes.test.ts's FORBIDDEN
	// assertion); unwrap until we hit a plain object either way.
	function parseConvexErrorData(caught: unknown): Record<string, unknown> {
		let data: unknown = (caught as ConvexError<string>).data;
		while (typeof data === "string") {
			data = JSON.parse(data);
		}
		return data as Record<string, unknown>;
	}

	async function findMembership(
		ctx: { db: MutationCtx["db"] },
		orgId: Id<"organizations">,
		userId: Id<"users">
	) {
		const membership = await ctx.db
			.query("organizationMemberships")
			.withIndex("by_org_user", (q) =>
				q.eq("orgId", orgId).eq("userId", userId)
			)
			.unique();
		if (!membership) throw new Error("membership not found");
		return membership;
	}

	async function grantMemberPermissions(
		orgId: Id<"organizations">,
		userId: Id<"users">,
		permissions: Record<
			string,
			{ level: "none" | "view" | "modify" | "delete"; allRecords?: boolean }
		>
	) {
		await t.run(async (ctx) => {
			const membership = await findMembership(ctx, orgId, userId);
			await ctx.db.patch(membership._id, { permissions });
		});
	}

	async function seedOrgWithMember(orgClerkId: string, memberClerkId: string) {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `${orgClerkId}_owner`,
				clerkOrgId: orgClerkId,
			})
		);
		const member = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: memberClerkId })
		);
		const asAdmin = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);
		return { org, member, asAdmin, asMember };
	}

	// ── 1. Read gate: clients.list ───────────────────────────────────────

	it("member with default permissions is denied clients.list (FORBIDDEN view)", async () => {
		const { asMember } = await seedOrgWithMember("org_read_1", "user_read_1");

		let caught: unknown;
		try {
			await asMember.query(api.clients.list, {});
		} catch (e) {
			caught = e;
		}

		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "clients",
			level: "view",
		});
	});

	// ── 1b. SEC-6: reports:view must not escalate into raw entity reads ──

	// reports isn't in DEFAULT_MEMBER_PERMISSIONS, so this is grant escalation,
	// not a default-member leak: "let them see reports" silently also handed
	// over unscoped raw rows of every entity the admin had withheld.
	const reportArgs = (entityType: "clients" | "activities") => ({
		entityType,
		config: { version: 2 as const, entityType, metric: { op: "count" as const } },
	});

	it("reports:view alone does NOT grant a clients report (SEC-6)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec6_1",
			"user_sec6_1"
		);
		await grantMemberPermissions(org.orgId, member.userId, {
			reports: { level: "view" },
		});

		let caught: unknown;
		try {
			await asMember.query(api.reportData.executeReport, reportArgs("clients"));
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "clients",
		});
	});

	it("a record-scoped clients:view grant is still not enough (SEC-6)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec6_2",
			"user_sec6_2"
		);
		// The report scan pages by_org with no record filter, so a member who can
		// only see their own assignments must not be able to run one at all.
		await grantMemberPermissions(org.orgId, member.userId, {
			reports: { level: "view" },
			clients: { level: "view" },
		});

		let caught: unknown;
		try {
			await asMember.query(api.reportData.executeReport, reportArgs("clients"));
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "clients",
			scope: true,
		});
	});

	it("reports:view + clients:view with allRecords succeeds (SEC-6)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec6_3",
			"user_sec6_3"
		);
		await grantMemberPermissions(org.orgId, member.userId, {
			reports: { level: "view" },
			clients: { level: "view", allRecords: true },
		});

		const result = await asMember.query(
			api.reportData.executeReport,
			reportArgs("clients")
		);
		expect(result).toBeDefined();
	});

	it("an activities report is admin-only even with every entity grant (SEC-6)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec6_4",
			"user_sec6_4"
		);
		// Activity rows span every entity type and include the `user` rows
		// (member_permissions_updated) that activities.ts restricts to admins.
		await grantMemberPermissions(org.orgId, member.userId, {
			reports: { level: "view" },
			clients: { level: "view", allRecords: true },
			projects: { level: "view", allRecords: true },
			tasks: { level: "view", allRecords: true },
			quotes: { level: "view", allRecords: true },
			invoices: { level: "view", allRecords: true },
		});

		let caught: unknown;
		try {
			await asMember.query(
				api.reportData.executeReport,
				reportArgs("activities")
			);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({ code: "FORBIDDEN" });
	});

	it("an admin can still run both reports (SEC-6 does not break admins)", async () => {
		const { asAdmin } = await seedOrgWithMember("org_sec6_5", "user_sec6_5");
		expect(
			await asAdmin.query(api.reportData.executeReport, reportArgs("clients"))
		).toBeDefined();
		expect(
			await asAdmin.query(api.reportData.executeReport, reportArgs("activities"))
		).toBeDefined();
	});

	// ── 1c. SEC-7: dashboard totals are org-wide, so they need allRecords ──

	it("a record-scoped member is denied getHomeStats (SEC-7)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec7_1",
			"user_sec7_1"
		);
		// Every grant present, but assigned-records only. The figures are org
		// totals from org-keyed aggregates, so `view` alone must not suffice.
		await grantMemberPermissions(org.orgId, member.userId, {
			clients: { level: "view" },
			projects: { level: "view" },
			quotes: { level: "view" },
			invoices: { level: "view" },
			tasks: { level: "view" },
		});

		let caught: unknown;
		try {
			await asMember.query(api.homeStats.getHomeStats, {});
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			scope: true,
		});
	});

	it("the same member with allRecords gets the stats (SEC-7)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec7_2",
			"user_sec7_2"
		);
		await grantMemberPermissions(org.orgId, member.userId, {
			clients: { level: "view", allRecords: true },
			projects: { level: "view", allRecords: true },
			quotes: { level: "view", allRecords: true },
			invoices: { level: "view", allRecords: true },
			tasks: { level: "view", allRecords: true },
		});

		expect(await asMember.query(api.homeStats.getHomeStats, {})).toBeDefined();
	});

	it("a scoped member is denied getPendingTasksCount (SEC-7)", async () => {
		const { org, member, asMember } = await seedOrgWithMember(
			"org_sec7_3",
			"user_sec7_3"
		);
		// tasks:modify (assigned-only) is the DEFAULT member grant, so this is
		// the shape a plain member actually has.
		await grantMemberPermissions(org.orgId, member.userId, {
			tasks: { level: "modify" },
		});

		let caught: unknown;
		try {
			await asMember.query(api.homeStats.getPendingTasksCount, {});
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "tasks",
			scope: true,
		});
	});

	it("an admin still gets dashboard stats (SEC-7 does not break admins)", async () => {
		const { asAdmin } = await seedOrgWithMember("org_sec7_4", "user_sec7_4");
		expect(await asAdmin.query(api.homeStats.getHomeStats, {})).toBeDefined();
		expect(
			await asAdmin.query(api.homeStats.getPendingTasksCount, {})
		).toBeDefined();
	});

	// ── 2. Read grant + derived scope: clients.list ──────────────────────

	it("member with a clients view grant sees only derived-scope clients; allRecords sees all", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_read_3",
			"user_read_3"
		);

		const clientC = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Client C",
			status: "active",
		});
		const clientD = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Client D",
			status: "active",
		});
		// Project under C, assigned to the member — derives client C into scope.
		await asAdmin.mutation(api.projects.create, {
			clientId: clientC,
			title: "Assigned project",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [member.userId],
		});
		// Project under D, unassigned — D stays out of scope.
		await asAdmin.mutation(api.projects.create, {
			clientId: clientD,
			title: "Unassigned project",
			status: "planned",
			projectType: "one-off",
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			clients: { level: "view" },
		});

		const scoped = await asMember.query(api.clients.list, {});
		expect(scoped.map((c) => c._id)).toEqual([clientC]);

		await grantMemberPermissions(org.orgId, member.userId, {
			clients: { level: "view", allRecords: true },
		});

		const all = await asMember.query(api.clients.list, {});
		expect(all.map((c) => c._id).sort()).toEqual(
			[clientC, clientD].sort()
		);
	});

	// ── 3. Write scope: projects.update ──────────────────────────────────

	it("member (default projects modify) can update an assigned project but not an unassigned one; allRecords lifts the scope", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_write_4",
			"user_write_4"
		);

		const client = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Write Scope Client",
			status: "active",
		});
		const assignedProject = await asAdmin.mutation(api.projects.create, {
			clientId: client,
			title: "Assigned",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [member.userId],
		});
		const unassignedProject = await asAdmin.mutation(api.projects.create, {
			clientId: client,
			title: "Unassigned",
			status: "planned",
			projectType: "one-off",
		});

		await expect(
			asMember.mutation(api.projects.update, {
				id: assignedProject,
				title: "Assigned - updated",
			})
		).resolves.toBe(assignedProject);

		let caught: unknown;
		try {
			await asMember.mutation(api.projects.update, {
				id: unassignedProject,
				title: "Unassigned - updated",
			});
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "projects",
			scope: true,
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			projects: { level: "modify", allRecords: true },
		});

		await expect(
			asMember.mutation(api.projects.update, {
				id: unassignedProject,
				title: "Unassigned - updated via allRecords",
			})
		).resolves.toBe(unassignedProject);
	});

	// ── 4. Delete ladder: projects.remove ────────────────────────────────

	it("modify+allRecords is not enough to delete; delete+allRecords succeeds", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_delete_5",
			"user_delete_5"
		);

		const client = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Delete Ladder Client",
			status: "active",
		});
		const project = await asAdmin.mutation(api.projects.create, {
			clientId: client,
			title: "Unassigned, deletable only with the right level",
			status: "planned",
			projectType: "one-off",
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			projects: { level: "modify", allRecords: true },
		});

		let caught: unknown;
		try {
			await asMember.mutation(api.projects.remove, { id: project });
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "projects",
			level: "delete",
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			projects: { level: "delete", allRecords: true },
		});

		await expect(
			asMember.mutation(api.projects.remove, { id: project })
		).resolves.toBe(project);

		const stillThere = await asAdmin.query(api.projects.get, { id: project });
		expect(stillThere).toBeNull();
	});

	// ── 5. Scoped-create auto-assign: tasks.create ───────────────────────

	it("a scoped member creating a task without assigneeUserId is auto-assigned", async () => {
		const { asMember, member } = await seedOrgWithMember(
			"org_autoassign_6",
			"user_autoassign_6"
		);

		const taskId = await asMember.mutation(api.tasks.create, {
			title: "Unassigned on input",
			date: Date.now(),
			status: "pending",
			type: "internal",
		});

		const task = await asMember.query(api.tasks.get, { id: taskId });
		expect(task?.assigneeUserId).toBe(member.userId);
	});

	// ── 6. automations.create ────────────────────────────────────────────

	const automationTrigger = {
		type: "status_changed",
		objectType: "client",
		toStatus: "active",
	} as const;

	function automationActionNode(id: string) {
		return {
			id,
			type: "action" as const,
			config: {
				kind: "action" as const,
				action: {
					type: "update_field" as const,
					target: "self" as const,
					field: "status",
					value: { kind: "static" as const, value: "inactive" },
				},
			},
		};
	}

	it("member is denied automations.create by default; a modify grant allows it; admin always passes", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_automations_8",
			"user_automations_8"
		);

		let caught: unknown;
		try {
			await asMember.mutation(api.automations.create, {
				name: "Denied by default",
				trigger: automationTrigger,
				nodes: [automationActionNode("act-1")],
			});
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "automations",
			level: "modify",
		});

		// SEC-9: automations:modify alone is no longer enough. This definition
		// writes client.status, so authoring it also requires clients:modify —
		// otherwise "may edit automations" is a write primitive over every
		// record type the executor can reach.
		await grantMemberPermissions(org.orgId, member.userId, {
			automations: { level: "modify" },
		});

		let caughtWithoutClients: unknown;
		try {
			await asMember.mutation(api.automations.create, {
				name: "Writes clients without a clients grant",
				trigger: automationTrigger,
				nodes: [automationActionNode("act-1")],
			});
		} catch (e) {
			caughtWithoutClients = e;
		}
		expect(parseConvexErrorData(caughtWithoutClients)).toMatchObject({
			code: "FORBIDDEN",
			object: "clients",
			level: "modify",
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			automations: { level: "modify" },
			clients: { level: "modify", allRecords: true },
		});

		const memberCreated = await asMember.mutation(api.automations.create, {
			name: "Allowed by grant",
			trigger: automationTrigger,
			nodes: [automationActionNode("act-1")],
		});
		expect(memberCreated).toBeDefined();

		const adminCreated = await asAdmin.mutation(api.automations.create, {
			name: "Admin always allowed",
			trigger: automationTrigger,
			nodes: [automationActionNode("act-1")],
		});
		expect(adminCreated).toBeDefined();
	});

	// ── 7. Derived quotes: quotes.list ───────────────────────────────────

	it("member with a quotes view grant sees quotes derived from their assigned project's client only", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_quotes_9",
			"user_quotes_9"
		);

		const clientC = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Quotes Client C",
			status: "active",
		});
		const clientD = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Quotes Client D",
			status: "active",
		});
		const projectP = await asAdmin.mutation(api.projects.create, {
			clientId: clientC,
			title: "Assigned project",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [member.userId],
		});

		const quoteOnProject = await asAdmin.mutation(api.quotes.create, {
			clientId: clientC,
			projectId: projectP,
			title: "Quote linked to P",
			status: "draft",
			subtotal: 1000,
			total: 1000,
		});
		const quoteOnClientOnly = await asAdmin.mutation(api.quotes.create, {
			clientId: clientC,
			title: "Quote of client C, no project",
			status: "draft",
			subtotal: 500,
			total: 500,
		});
		const quoteOnOtherClient = await asAdmin.mutation(api.quotes.create, {
			clientId: clientD,
			title: "Quote of client D",
			status: "draft",
			subtotal: 250,
			total: 250,
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			quotes: { level: "view" },
		});

		const visible = await asMember.query(api.quotes.list, {});
		const visibleIds = visible.map((q) => q._id).sort();
		expect(visibleIds).toEqual([quoteOnClientOnly, quoteOnProject].sort());
		expect(visibleIds).not.toContain(quoteOnOtherClient);
	});

	// ── 8. Admin/owner spot-check ────────────────────────────────────────

	it("admin/owner passes every gate — clients.list unfiltered, projects.remove unscoped", async () => {
		const { asAdmin } = await seedOrgWithMember(
			"org_admin_10",
			"user_admin_10"
		);

		const client = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Admin Spot Check Client",
			status: "active",
		});
		const project = await asAdmin.mutation(api.projects.create, {
			clientId: client,
			title: "Unassigned project, owner-deletable",
			status: "planned",
			projectType: "one-off",
		});

		const clients = await asAdmin.query(api.clients.list, {});
		expect(clients.map((c) => c._id)).toContain(client);

		await expect(
			asAdmin.mutation(api.projects.remove, { id: project })
		).resolves.toBe(project);
	});

	// ── 10. Single-record read scope: clients.get ────────────────────────

	it("a scoped member reading an out-of-scope client by ID via clients.get is FORBIDDEN; allRecords lifts the scope", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_get_12",
			"user_get_12"
		);

		const clientC = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Get Client C",
			status: "active",
		});
		const clientD = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Get Client D",
			status: "active",
		});
		// Project under C, assigned to the member — derives client C into scope.
		await asAdmin.mutation(api.projects.create, {
			clientId: clientC,
			title: "Assigned project",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [member.userId],
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			clients: { level: "view" },
		});

		await expect(
			asMember.query(api.clients.get, { id: clientC })
		).resolves.toMatchObject({ _id: clientC });

		let caught: unknown;
		try {
			await asMember.query(api.clients.get, { id: clientD });
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "clients",
			scope: true,
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			clients: { level: "view", allRecords: true },
		});

		await expect(
			asMember.query(api.clients.get, { id: clientD })
		).resolves.toMatchObject({ _id: clientD });
	});

	// ── 11. Single-record read scope: quotes.get (projectId/clientId fallback) ──

	it("a scoped member reading an out-of-scope quote by ID via quotes.get is FORBIDDEN; allRecords lifts the scope", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_get_13",
			"user_get_13"
		);

		const clientC = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Get Quotes Client C",
			status: "active",
		});
		const clientD = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Get Quotes Client D",
			status: "active",
		});
		const projectP = await asAdmin.mutation(api.projects.create, {
			clientId: clientC,
			title: "Assigned project",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [member.userId],
		});

		const quoteOnProject = await asAdmin.mutation(api.quotes.create, {
			clientId: clientC,
			projectId: projectP,
			title: "Quote linked to P",
			status: "draft",
			subtotal: 1000,
			total: 1000,
		});
		const quoteOnOtherClient = await asAdmin.mutation(api.quotes.create, {
			clientId: clientD,
			title: "Quote of client D",
			status: "draft",
			subtotal: 250,
			total: 250,
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			quotes: { level: "view" },
		});

		// In scope via the assigned project's derived client.
		await expect(
			asMember.query(api.quotes.get, { id: quoteOnProject })
		).resolves.toMatchObject({ _id: quoteOnProject });

		let caught: unknown;
		try {
			await asMember.query(api.quotes.get, { id: quoteOnOtherClient });
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "quotes",
			scope: true,
		});

		await grantMemberPermissions(org.orgId, member.userId, {
			quotes: { level: "view", allRecords: true },
		});

		await expect(
			asMember.query(api.quotes.get, { id: quoteOnOtherClient })
		).resolves.toMatchObject({ _id: quoteOnOtherClient });
	});

	// ── 12. Single-record read scope: reports.get (direct createdBy scope) ──

	it("a member reading another user's report via reports.get is FORBIDDEN", async () => {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "org_get_14_owner",
				clerkOrgId: "org_get_14",
			})
		);
		const memberA = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: "user_get_14_a" })
		);
		const memberB = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: "user_get_14_b" })
		);
		const asMemberA = t.withIdentity(
			createTestIdentity(memberA.clerkUserId, org.clerkOrgId)
		);
		const asMemberB = t.withIdentity(
			createTestIdentity(memberB.clerkUserId, org.clerkOrgId)
		);

		await grantMemberPermissions(org.orgId, memberA.userId, {
			reports: { level: "modify" },
		});
		await grantMemberPermissions(org.orgId, memberB.userId, {
			reports: { level: "view" },
		});

		const reportId = await asMemberA.mutation(api.reports.create, {
			name: "Member A's report",
			config: { version: 2, entityType: "clients", metric: { op: "count" } },
			visualization: { type: "table" },
		});

		// Owner can read their own report.
		await expect(
			asMemberA.query(api.reports.get, { id: reportId })
		).resolves.toMatchObject({ _id: reportId });

		// Another member (view grant, no ownership) is denied.
		let caught: unknown;
		try {
			await asMemberB.query(api.reports.get, { id: reportId });
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject({
			code: "FORBIDDEN",
			object: "reports",
			scope: true,
		});
	});

	// ── homeStats.getJourneyProgress: cross-object read degrades to null ──
	// Regression for the mobile launch crash: shipped clients render the journey
	// checklist unconditionally, so missing view grants must yield null, never
	// FORBIDDEN.

	it("member with default permissions gets null from getJourneyProgress (no FORBIDDEN)", async () => {
		const { asMember } = await seedOrgWithMember(
			"org_journey_1",
			"user_journey_1"
		);

		await expect(
			asMember.query(api.homeStats.getJourneyProgress, {})
		).resolves.toBeNull();
	});

	it("admin still gets full journey progress", async () => {
		const { asAdmin } = await seedOrgWithMember(
			"org_journey_2",
			"user_journey_2"
		);

		await expect(
			asAdmin.query(api.homeStats.getJourneyProgress, {})
		).resolves.toMatchObject({ hasClient: false, hasOrganization: false });
	});

	// ── getSampleRelatedFields: record scope + registry-field filtering ──

	it("related-fields preview omits relations outside the member's record scope", async () => {
		const { org, member, asAdmin, asMember } = await seedOrgWithMember(
			"org_srf_1",
			"user_srf_1"
		);
		await grantMemberPermissions(org.orgId, member.userId, {
			automations: { level: "view" },
			tasks: { level: "view" },
			clients: { level: "view" },
		});

		const clientId = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Scoped Co",
			status: "active",
		});
		// Assigned to the member (source task in scope), but the client hangs
		// off no project the member is assigned to — outside their derived scope.
		const taskId = await asAdmin.mutation(api.tasks.create, {
			title: "External visit",
			type: "external",
			clientId,
			assigneeUserId: member.userId,
			date: Date.now(),
			status: "pending",
		});

		const result = await asMember.query(api.automations.getSampleRelatedFields, {
			entityType: "task",
			entityId: taskId,
		});
		expect(result.client).toBeUndefined();
	});

	it("related-fields preview returns registry fields only, not whole docs", async () => {
		const { asAdmin } = await seedOrgWithMember("org_srf_2", "user_srf_2");

		const clientId = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Registry Co",
			status: "active",
		});
		const taskId = await asAdmin.mutation(api.tasks.create, {
			title: "External visit",
			type: "external",
			clientId,
			date: Date.now(),
			status: "pending",
		});

		const result = await asAdmin.query(api.automations.getSampleRelatedFields, {
			entityType: "task",
			entityId: taskId,
		});
		expect(result.client?.companyName).toBe("Registry Co");
		// Non-registry columns must not leak into the preview payload.
		expect(result.client?.portalAccessId).toBeUndefined();
		expect(result.client?._id).toBeUndefined();
	});
});

