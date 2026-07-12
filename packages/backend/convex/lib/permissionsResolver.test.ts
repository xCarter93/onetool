import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupConvexTest } from "../test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestOrg,
	createTestProject,
} from "../test.helpers";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DEFAULT_MEMBER_PERMISSIONS } from "./permissionKeys";
import {
	checkLevel,
	getEffectivePermissions,
	getEffectivePermissionsFor,
} from "./permissions";
import { userQuery, type ActorScope } from "./factories";

/**
 * Resolver + shadow-mode factory-helper coverage for granular RBAC
 * (permissionKeys.ts / permissions.ts / factories.ts makeOrgExtras).
 */
describe("granular RBAC resolver + shadow mode", () => {
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
		vi.restoreAllMocks();
	});

	async function invokeRegisteredFunction<T>(
		fn: unknown,
		ctx: unknown,
		args: Record<string, unknown> = {}
	): Promise<T> {
		return await (fn as { _handler: (ctx: unknown, args: unknown) => Promise<T> })
			._handler(ctx, args);
	}

	// t.run re-throws errors that cross its transaction boundary with `.data`
	// JSON-stringified — sometimes doubly, since ConvexError's own constructor
	// JSON.stringifies non-string data for `.message`, and convex-test's
	// re-throw appears to serialize again. Unwrap until we hit a plain object.
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

	// ── Resolver: getEffectivePermissionsFor / getEffectivePermissions ──────

	it("owner (org.ownerUserId) resolves to \"all\", independent of membership role", async () => {
		const { userId, orgId } = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx, {
				clerkUserId: "user_owner_all",
				clerkOrgId: "org_owner_all",
			});
			// Isolate the owner short-circuit from the admin-role short-circuit.
			const membership = await findMembership(ctx, setup.orgId, setup.userId);
			await ctx.db.patch(membership._id, { role: "member" });
			return setup;
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(userId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(result).toBe("all");
	});

	it("admin membership role resolves to \"all\" for a non-owner user", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_2",
				clerkOrgId: "org_admin_role",
			});
		});
		const { userId: adminUserId } = await t.run(async (ctx) => {
			return await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_admin_member",
				role: "admin",
			});
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(adminUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(result).toBe("all");
	});

	it("member with no stored permissions gets exactly DEFAULT_MEMBER_PERMISSIONS", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_3",
				clerkOrgId: "org_member_default",
			});
		});
		const { userId: memberUserId } = await t.run(async (ctx) => {
			return await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_member_default",
			});
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(memberUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(result).toEqual(DEFAULT_MEMBER_PERMISSIONS);
		expect(result).not.toBe("all");
		if (result !== "all") {
			expect(result.clients).toBeUndefined();
		}
	});

	it("a stored grant overrides the default for that object only", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_4",
				clerkOrgId: "org_member_override",
			});
		});
		const { userId: memberUserId } = await t.run(async (ctx) => {
			const { userId } = await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_member_override",
			});
			const membership = await findMembership(ctx, orgId, userId);
			await ctx.db.patch(membership._id, {
				permissions: { projects: { level: "view" } },
			});
			return { userId };
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(memberUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(result).not.toBe("all");
		if (result === "all") throw new Error("unreachable");
		expect(result.projects).toEqual({ level: "view" });
		expect(result.tasks).toEqual({ level: "modify" }); // untouched default
	});

	it("an explicit {level: none} revoke fails the view check", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_5",
				clerkOrgId: "org_member_revoke",
			});
		});
		const { userId: memberUserId } = await t.run(async (ctx) => {
			const { userId } = await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_member_revoke",
			});
			const membership = await findMembership(ctx, orgId, userId);
			await ctx.db.patch(membership._id, {
				permissions: { tasks: { level: "none" } },
			});
			return { userId };
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(memberUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(checkLevel(result, "tasks", "view")).toBe(false);
	});

	it("ladder: a modify grant passes the view check but fails the delete check", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_6",
				clerkOrgId: "org_member_ladder",
			});
		});
		const { userId: memberUserId } = await t.run(async (ctx) => {
			return await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_member_ladder",
			});
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(memberUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(checkLevel(result, "tasks", "view")).toBe(true);
		expect(checkLevel(result, "tasks", "delete")).toBe(false);
	});

	it("an unknown stored object key is dropped by the resolver", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_7",
				clerkOrgId: "org_member_bogus",
			});
		});
		const { userId: memberUserId } = await t.run(async (ctx) => {
			const { userId } = await addMemberToOrg(ctx, orgId, {
				clerkUserId: "user_member_bogus",
			});
			const membership = await findMembership(ctx, orgId, userId);
			// Bogus key that isn't a real PermissionObject; schema allows any
			// string key so this simulates a stale/corrupt row.
			await ctx.db.patch(membership._id, {
				permissions: { bogusKey: { level: "delete" } },
			});
			return { userId };
		});

		const result = await t.run(async (ctx) => {
			const user = await ctx.db.get(memberUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(result).not.toBe("all");
		if (result === "all") throw new Error("unreachable");
		expect(result).not.toHaveProperty("bogusKey");
		expect(result).toEqual(DEFAULT_MEMBER_PERMISSIONS);
	});

	it("unauthenticated callers get {} from getEffectivePermissions and fail every check", async () => {
		const result = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () => null;
			return await getEffectivePermissions(ctx);
		});

		expect(result).toEqual({});
		expect(checkLevel(result, "projects", "view")).toBe(false);
		expect(checkLevel(result, "tasks", "view")).toBe(false);
		expect(checkLevel(result, "clients", "view")).toBe(false);
	});

	it("falls back to the JWT orgRole claim when the membership row has no role", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_owner_8",
				clerkOrgId: "org_role_fallback",
			});
		});
		const { userId: memberUserId, clerkUserId: memberClerkUserId } =
			await t.run(async (ctx) => {
				const { userId, clerkUserId } = await addMemberToOrg(ctx, orgId, {
					clerkUserId: "user_member_fallback",
				});
				const membership = await findMembership(ctx, orgId, userId);
				await ctx.db.patch(membership._id, { role: undefined });
				return { userId, clerkUserId };
			});

		const result = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () => ({
				...createTestIdentity(memberClerkUserId, "org_role_fallback"),
				orgRole: "org:admin",
			});
			const user = await ctx.db.get(memberUserId);
			return await getEffectivePermissionsFor(ctx, user!, orgId);
		});

		expect(result).toBe("all");
	});

	// ── Shadow vs. enforced: ctx helpers via userQuery-wrapped handlers ─────

	describe("shadow vs. enforced ctx helpers", () => {
		async function seedOrgWithMember(orgClerkId: string, memberClerkId: string) {
			const org = await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: `${orgClerkId}_owner`,
					clerkOrgId: orgClerkId,
				});
			});
			const member = await t.run(async (ctx) => {
				return await addMemberToOrg(ctx, org.orgId, {
					clerkUserId: memberClerkId,
				});
			});
			return { org, member };
		}

		it("shadow mode: requireLevel does not throw and warns [permissions-shadow]", async () => {
			const { org, member } = await seedOrgWithMember(
				"org_shadow_10",
				"user_shadow_10"
			);
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const result = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(member.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) => {
						await factoryCtx.requireLevel("clients", "view");
						return "ok";
					},
				});
				return await invokeRegisteredFunction<string>(fn, ctx);
			});

			expect(result).toBe("ok");
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[permissions-shadow]")
			);
		});

		it("enforced mode: requireLevel throws FORBIDDEN with object + level", async () => {
			process.env.PERMISSIONS_ENFORCE = "true";
			const { org, member } = await seedOrgWithMember(
				"org_enforced_11",
				"user_enforced_11"
			);

			let caught: unknown;
			try {
				await t.run(async (ctx) => {
					(ctx.auth as any).getUserIdentity = async () =>
						createTestIdentity(member.clerkUserId, org.clerkOrgId);
					const fn = userQuery({
						args: {},
						handler: async (factoryCtx) => {
							await factoryCtx.requireLevel("clients", "view");
							return "should not resolve";
						},
					});
					return await invokeRegisteredFunction(fn, ctx);
				});
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

		it("applyReadScope: shadow returns all rows + warns; enforced returns only in-scope rows", async () => {
			const { org, member } = await seedOrgWithMember(
				"org_scope_12",
				"user_scope_12"
			);
			const { clientAId, clientBId } = await t.run(async (ctx) => {
				const clientAId = await createTestClient(ctx, org.orgId, {
					companyName: "Client A",
				});
				const clientBId = await createTestClient(ctx, org.orgId, {
					companyName: "Client B",
				});
				const projectId = await createTestProject(ctx, org.orgId, clientAId, {
					title: "Assigned project",
				});
				await ctx.db.patch(projectId, { assignedUserIds: [member.userId] });
				return { clientAId, clientBId };
			});

			const rows: { id: string; clientId: Id<"clients"> }[] = [
				{ id: "in-scope", clientId: clientAId },
				{ id: "out-of-scope", clientId: clientBId },
			];
			const keep = (
				row: { clientId: Id<"clients"> },
				scope: ActorScope
			) => scope.clientIds.has(row.clientId);

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const shadowRows = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(member.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) =>
						await factoryCtx.applyReadScope("clients", rows, keep),
				});
				return await invokeRegisteredFunction<typeof rows>(fn, ctx);
			});

			expect(shadowRows).toHaveLength(2);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[permissions-shadow] would hide")
			);
			warnSpy.mockRestore();

			process.env.PERMISSIONS_ENFORCE = "true";
			const enforcedRows = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(member.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) =>
						await factoryCtx.applyReadScope("clients", rows, keep),
				});
				return await invokeRegisteredFunction<typeof rows>(fn, ctx);
			});

			expect(enforcedRows.map((r) => r.id)).toEqual(["in-scope"]);
		});

		it("enforced requireRecordScope throws FORBIDDEN(scope) for scoped members but skips the predicate for hasAllRecords callers", async () => {
			process.env.PERMISSIONS_ENFORCE = "true";
			const { org, member } = await seedOrgWithMember(
				"org_recordscope_13",
				"user_recordscope_13"
			);

			let caught: unknown;
			try {
				await t.run(async (ctx) => {
					(ctx.auth as any).getUserIdentity = async () =>
						createTestIdentity(member.clerkUserId, org.clerkOrgId);
					const fn = userQuery({
						args: {},
						handler: async (factoryCtx) => {
							await factoryCtx.requireRecordScope("projects", () => false);
							return "should not resolve";
						},
					});
					return await invokeRegisteredFunction(fn, ctx);
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

			// Admin (owner) has "all" grants → hasAllRecords short-circuits before
			// the predicate ever runs, so a throwing predicate must not blow up.
			const adminResult = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(org.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) => {
						await factoryCtx.requireRecordScope("projects", () => {
							throw new Error("predicate should not run for hasAllRecords");
						});
						return "ok";
					},
				});
				return await invokeRegisteredFunction<string>(fn, ctx);
			});

			expect(adminResult).toBe("ok");
		});

		it("gateRead: shadow allows-with-warn / enforced excludes for scoped members; admins always pass silently", async () => {
			const { org, member } = await seedOrgWithMember(
				"org_gateread_14",
				"user_gateread_14"
			);

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const shadowIncluded = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(member.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) => await factoryCtx.gateRead("clients"),
				});
				return await invokeRegisteredFunction<boolean>(fn, ctx);
			});
			expect(shadowIncluded).toBe(true);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[permissions-shadow] would exclude")
			);
			warnSpy.mockRestore();

			process.env.PERMISSIONS_ENFORCE = "true";
			const enforcedIncluded = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(member.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) => await factoryCtx.gateRead("clients"),
				});
				return await invokeRegisteredFunction<boolean>(fn, ctx);
			});
			expect(enforcedIncluded).toBe(false);

			// Admin (owner): true in both modes.
			const adminShadow = await t.run(async (ctx) => {
				delete process.env.PERMISSIONS_ENFORCE;
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(org.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) => await factoryCtx.gateRead("clients"),
				});
				return await invokeRegisteredFunction<boolean>(fn, ctx);
			});
			expect(adminShadow).toBe(true);

			process.env.PERMISSIONS_ENFORCE = "true";
			const adminEnforced = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () =>
					createTestIdentity(org.clerkUserId, org.clerkOrgId);
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) => await factoryCtx.gateRead("clients"),
				});
				return await invokeRegisteredFunction<boolean>(fn, ctx);
			});
			expect(adminEnforced).toBe(true);
		});

		it("scopedToActor: grant-based allRecords diverges from legacy role scoping; shadow keeps legacy, enforced switches to grants", async () => {
			const { org, member } = await seedOrgWithMember(
				"org_diverge_15",
				"user_diverge_15"
			);
			const other = await t.run(async (ctx) => {
				return await addMemberToOrg(ctx, org.orgId, {
					clerkUserId: "user_diverge_15_other",
				});
			});

			await t.run(async (ctx) => {
				const membership = await findMembership(
					ctx,
					org.orgId,
					member.userId
				);
				// Grant-based verdict now says "all records" for tasks, while the
				// legacy role-based verdict (JWT orgRole="org:member") still says
				// "scoped to me" — this is the intentional divergence window.
				await ctx.db.patch(membership._id, {
					permissions: { tasks: { level: "modify", allRecords: true } },
				});
			});

			const rows = [
				{ id: "mine", assigneeUserId: member.userId },
				{ id: "other", assigneeUserId: other.userId },
			];

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const shadowRows = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () => ({
					...createTestIdentity(member.clerkUserId, org.clerkOrgId),
					orgRole: "org:member",
				});
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) =>
						await factoryCtx.scopedToActor(
							"tasks",
							rows,
							(row) => row.assigneeUserId
						),
				});
				return await invokeRegisteredFunction<typeof rows>(fn, ctx);
			});

			expect(shadowRows.map((r) => r.id)).toEqual(["mine"]);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("scopedToActor(tasks) divergence")
			);
			warnSpy.mockRestore();

			process.env.PERMISSIONS_ENFORCE = "true";
			const enforcedRows = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () => ({
					...createTestIdentity(member.clerkUserId, org.clerkOrgId),
					orgRole: "org:member",
				});
				const fn = userQuery({
					args: {},
					handler: async (factoryCtx) =>
						await factoryCtx.scopedToActor(
							"tasks",
							rows,
							(row) => row.assigneeUserId
						),
				});
				return await invokeRegisteredFunction<typeof rows>(fn, ctx);
			});

			expect(enforcedRows.map((r) => r.id)).toEqual(["mine", "other"]);
		});
	});
});
