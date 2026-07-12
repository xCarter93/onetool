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
import { DEFAULT_MEMBER_PERMISSIONS } from "./lib/permissionKeys";

/**
 * Phase-3 grant management plane (convex/permissions.ts). Deliberately NOT
 * behind PERMISSIONS_ENFORCE — all tests run with the flag unset to prove the
 * admin plane enforces regardless of shadow mode.
 */
describe("permissions grant management", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		delete process.env.PERMISSIONS_ENFORCE;
	});

	function parseConvexErrorData(caught: unknown): Record<string, unknown> {
		let data: unknown = (caught as ConvexError<string>).data;
		while (typeof data === "string") {
			data = JSON.parse(data);
		}
		return data as Record<string, unknown>;
	}

	async function expectConvexError(
		fn: () => Promise<unknown>,
		match: Record<string, unknown>
	) {
		let caught: unknown;
		try {
			await fn();
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ConvexError);
		expect(parseConvexErrorData(caught)).toMatchObject(match);
	}

	async function seedOrgWithMembers(tag: string) {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `${tag}_owner`,
				clerkOrgId: `${tag}_org`,
			})
		);
		const member = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: `${tag}_member` })
		);
		const secondMember = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, { clerkUserId: `${tag}_member2` })
		);
		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, org.clerkOrgId)
		);
		return { org, member, secondMember, asOwner, asMember };
	}

	// ── setMemberPermissions ─────────────────────────────────────────────

	it("rejects a non-admin caller even in shadow mode", async () => {
		const { secondMember, asMember } = await seedOrgWithMembers("set_caller");
		await expectConvexError(
			() =>
				asMember.mutation(api.permissions.setMemberPermissions, {
					userId: secondMember.userId,
					permissions: { clients: { level: "view" } },
				}),
			{ code: "FORBIDDEN" }
		);
	});

	it("rejects the owner as a target", async () => {
		const { org, asOwner } = await seedOrgWithMembers("set_owner");
		await expectConvexError(
			() =>
				asOwner.mutation(api.permissions.setMemberPermissions, {
					userId: org.userId,
					permissions: { clients: { level: "view" } },
				}),
			{ code: "FORBIDDEN", detail: "Owner permissions are immutable" }
		);
	});

	it("rejects unknown permission objects", async () => {
		const { member, asOwner } = await seedOrgWithMembers("set_unknown");
		await expectConvexError(
			() =>
				asOwner.mutation(api.permissions.setMemberPermissions, {
					userId: member.userId,
					permissions: { widgets: { level: "view" } },
				}),
			{ code: "BAD_REQUEST" }
		);
	});

	it("rejects a level above the object's maxLevel", async () => {
		const { member, asOwner } = await seedOrgWithMembers("set_maxlevel");
		// community caps at modify
		await expectConvexError(
			() =>
				asOwner.mutation(api.permissions.setMemberPermissions, {
					userId: member.userId,
					permissions: { community: { level: "delete" } },
				}),
			{ code: "BAD_REQUEST" }
		);
	});

	it("rejects allRecords on an unscopable object", async () => {
		const { member, asOwner } = await seedOrgWithMembers("set_scope");
		await expectConvexError(
			() =>
				asOwner.mutation(api.permissions.setMemberPermissions, {
					userId: member.userId,
					permissions: { skus: { level: "view", allRecords: true } },
				}),
			{ code: "BAD_REQUEST" }
		);
	});

	it("persists grants and round-trips through memberPermissions and myPermissions", async () => {
		const { member, asOwner, asMember } = await seedOrgWithMembers("set_ok");
		const grants = {
			clients: { level: "view" as const, allRecords: true },
			projects: { level: "delete" as const },
			tasks: { level: "none" as const },
		};
		await asOwner.mutation(api.permissions.setMemberPermissions, {
			userId: member.userId,
			permissions: grants,
		});

		const stored = await asOwner.query(api.permissions.memberPermissions, {
			userId: member.userId,
		});
		expect(stored?.permissions).toEqual(grants);
		expect(stored?.isOwner).toBe(false);
		expect(stored?.isAdmin).toBe(false);

		const mine = await asMember.query(api.permissions.myPermissions, {});
		expect(mine.all).toBe(false);
		// Stored entries replace defaults per object; tasks explicitly revoked.
		expect(mine.grants).toEqual(grants);
	});

	it("logs a member_permissions_updated activity", async () => {
		const { member, asOwner } = await seedOrgWithMembers("set_activity");
		await asOwner.mutation(api.permissions.setMemberPermissions, {
			userId: member.userId,
			permissions: { clients: { level: "view" } },
		});

		const activities = await t.run(async (ctx) => ctx.db.query("activities").collect());
		const activity = activities.find(
			(a) => a.activityType === "member_permissions_updated"
		);
		expect(activity).toMatchObject({
			activityType: "member_permissions_updated",
			entityType: "user",
			entityId: member.userId,
		});
	});

	// ── myPermissions ────────────────────────────────────────────────────

	it("returns all:true for owner and admin", async () => {
		const { org, asOwner } = await seedOrgWithMembers("my_admin");
		const admin = await t.run(async (ctx) =>
			addMemberToOrg(ctx, org.orgId, {
				clerkUserId: "my_admin_admin",
				role: "admin",
			})
		);
		const asAdmin = t.withIdentity(
			createTestIdentity(admin.clerkUserId, org.clerkOrgId)
		);

		expect(await asOwner.query(api.permissions.myPermissions, {})).toEqual({
			all: true,
			grants: {},
		});
		expect(await asAdmin.query(api.permissions.myPermissions, {})).toEqual({
			all: true,
			grants: {},
		});
	});

	it("returns member defaults when nothing is stored, and empty grants when unauthenticated", async () => {
		const { asMember } = await seedOrgWithMembers("my_member");
		const mine = await asMember.query(api.permissions.myPermissions, {});
		expect(mine.all).toBe(false);
		expect(mine.grants).toEqual(DEFAULT_MEMBER_PERMISSIONS);

		expect(await t.query(api.permissions.myPermissions, {})).toEqual({
			all: false,
			grants: {},
		});
	});

	// ── memberPermissions / orgMemberAccess gating ───────────────────────

	it("memberPermissions and orgMemberAccess reject non-admin callers", async () => {
		const { secondMember, asMember } = await seedOrgWithMembers("q_gate");
		await expectConvexError(
			() =>
				asMember.query(api.permissions.memberPermissions, {
					userId: secondMember.userId,
				}),
			{ code: "FORBIDDEN" }
		);
		await expectConvexError(
			() => asMember.query(api.permissions.orgMemberAccess, {}),
			{ code: "FORBIDDEN" }
		);
	});

	it("orgMemberAccess maps members with owner/admin flags and custom-permission detection", async () => {
		const { org, member, secondMember, asOwner } =
			await seedOrgWithMembers("q_access");

		let rows = await asOwner.query(api.permissions.orgMemberAccess, {});
		const ownerRow = rows.find((r) => r.userId === org.userId);
		const memberRow = rows.find((r) => r.userId === member.userId);
		expect(ownerRow).toMatchObject({
			isOwner: true,
			isAdmin: true,
			externalId: `${"q_access"}_owner`,
		});
		expect(memberRow).toMatchObject({
			isOwner: false,
			isAdmin: false,
			hasCustomPermissions: false,
		});

		// Storing exactly the defaults is still "Default", not "Custom".
		await asOwner.mutation(api.permissions.setMemberPermissions, {
			userId: member.userId,
			permissions: {
				projects: { level: "modify" },
				tasks: { level: "modify" },
			},
		});
		// A real deviation flips the chip.
		await asOwner.mutation(api.permissions.setMemberPermissions, {
			userId: secondMember.userId,
			permissions: {
				projects: { level: "modify" },
				tasks: { level: "modify" },
				clients: { level: "view" },
			},
		});

		rows = await asOwner.query(api.permissions.orgMemberAccess, {});
		expect(
			rows.find((r) => r.userId === member.userId)?.hasCustomPermissions
		).toBe(false);
		expect(
			rows.find((r) => r.userId === secondMember.userId)?.hasCustomPermissions
		).toBe(true);
	});
});
