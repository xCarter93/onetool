import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
 * tasks, automations, quotes) in shadow vs. enforced mode. Companion to
 * lib/permissionsResolver.test.ts, which covers the resolver + factory
 * helpers directly; this file drives the same machinery through the real
 * api.* handlers.
 */
describe("granular RBAC domain-function gating", () => {
	let t: ReturnType<typeof convexTest>;
	let originalEnforce: string | undefined;

	beforeEach(() => {
		t = setupConvexTest();
		originalEnforce = process.env.PERMISSIONS_ENFORCE;
		delete process.env.PERMISSIONS_ENFORCE; // default = shadow mode
	});

	afterEach(() => {
		if (originalEnforce === undefined) {
			delete process.env.PERMISSIONS_ENFORCE;
		} else {
			process.env.PERMISSIONS_ENFORCE = originalEnforce;
		}
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

	it("enforced: member with default permissions is denied clients.list (FORBIDDEN view)", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	it("shadow: the same call succeeds and returns rows", async () => {
		const { asAdmin, asMember } = await seedOrgWithMember(
			"org_read_2",
			"user_read_2"
		);
		await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Shadow Client",
			status: "active",
		});

		const rows = await asMember.query(api.clients.list, {});
		expect(rows).toHaveLength(1);
	});

	// ── 2. Read grant + derived scope: clients.list ──────────────────────

	it("enforced: member with a clients view grant sees only derived-scope clients; allRecords sees all", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	it("enforced: member (default projects modify) can update an assigned project but not an unassigned one; allRecords lifts the scope", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	it("enforced: modify+allRecords is not enough to delete; delete+allRecords succeeds", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	it("enforced: a scoped member creating a task without assigneeUserId is auto-assigned; shadow leaves it undefined", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	it("shadow: the same create leaves assigneeUserId undefined (would-auto-assign only warns)", async () => {
		const { asMember } = await seedOrgWithMember(
			"org_autoassign_7",
			"user_autoassign_7"
		);

		const taskId = await asMember.mutation(api.tasks.create, {
			title: "Unassigned on input",
			date: Date.now(),
			status: "pending",
			type: "internal",
		});

		const task = await asMember.query(api.tasks.get, { id: taskId });
		expect(task?.assigneeUserId).toBeUndefined();
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

	it("enforced: member is denied automations.create by default; a modify grant allows it; admin always passes", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

		await grantMemberPermissions(org.orgId, member.userId, {
			automations: { level: "modify" },
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

	it("enforced: member with a quotes view grant sees quotes derived from their assigned project's client only", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	it("enforced: admin/owner passes every gate — clients.list unfiltered, projects.remove unscoped", async () => {
		process.env.PERMISSIONS_ENFORCE = "true";
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

	// ── 9. Shadow no-op spot-check: quotes.list ──────────────────────────

	it("shadow: default member permissions still see ALL org quotes on quotes.list (no filtering, no throw)", async () => {
		const { asAdmin, asMember } = await seedOrgWithMember(
			"org_shadow_11",
			"user_shadow_11"
		);

		const clientC = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Shadow Quotes Client C",
			status: "active",
		});
		const clientD = await asAdmin.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Shadow Quotes Client D",
			status: "active",
		});
		await asAdmin.mutation(api.quotes.create, {
			clientId: clientC,
			title: "Quote C",
			status: "draft",
			subtotal: 100,
			total: 100,
		});
		await asAdmin.mutation(api.quotes.create, {
			clientId: clientD,
			title: "Quote D",
			status: "draft",
			subtotal: 200,
			total: 200,
		});

		// Default member grants have no `quotes` key at all — still no throw,
		// and applyReadScope's shadow branch returns every row unfiltered.
		const rows = await asMember.query(api.quotes.list, {});
		expect(rows).toHaveLength(2);
	});
});
