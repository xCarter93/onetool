import { convexTest } from "convex-test";
import { v } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import { setupConvexTest } from "../test.setup";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "../test.helpers";

describe("org-scoped function factories", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function invokeRegisteredFunction<T>(
		fn: unknown,
		ctx: unknown,
		args: Record<string, unknown> = {}
	): Promise<T> {
		return await (fn as { _handler: (ctx: unknown, args: unknown) => Promise<T> })
			._handler(ctx, args);
	}

	it("userQuery injects the authenticated user, active org, orgEntity, and scopedToActor", async () => {
		const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				return await createTestOrg(ctx, {
					clerkUserId: "user_factory_admin",
					clerkOrgId: "org_factory_admin",
				});
			}
		);

		const result = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () =>
				createTestIdentity(clerkUserId, clerkOrgId);

			const { userQuery } = await import("./factories");
			const fn = userQuery({
				args: {},
				handler: async (factoryCtx) => {
					return {
						userId: factoryCtx.user._id,
						orgId: factoryCtx.orgId,
						hasOrgEntity: typeof factoryCtx.orgEntity === "function",
						hasScopedToActor: typeof factoryCtx.scopedToActor === "function",
					};
				},
			});

			return await invokeRegisteredFunction<{
				userId: unknown;
				orgId: unknown;
				hasOrgEntity: boolean;
				hasScopedToActor: boolean;
			}>(fn, ctx);
		});

		expect(result).toEqual({
			userId,
			orgId,
			hasOrgEntity: true,
			hasScopedToActor: true,
		});
	});

	it("userMutation throws before the handler when identity is missing", async () => {
		await expect(
			t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () => null;

				const { userMutation } = await import("./factories");
				const fn = userMutation({
					args: {},
					handler: async () => "handler should not run",
				});

				return await invokeRegisteredFunction(fn, ctx);
			})
		).rejects.toThrow("User not authenticated");
	});

	it("optionalUserQuery omits org helpers on the missing-identity branch", async () => {
		const result = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () => null;

			const { optionalUserQuery } = await import("./factories");
			const fn = optionalUserQuery({
				args: {},
				handler: async (factoryCtx) => {
					return {
						user: factoryCtx.user,
						orgId: factoryCtx.orgId,
						hasOrgEntity: "orgEntity" in factoryCtx,
						hasScopedToActor: "scopedToActor" in factoryCtx,
					};
				},
			});

			return await invokeRegisteredFunction(fn, ctx);
		});

		expect(result).toEqual({
			user: null,
			orgId: null,
			hasOrgEntity: false,
			hasScopedToActor: false,
		});
	});

	it("systemMutation consumes orgId from args and validates the organization exists", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx, {
				clerkUserId: "user_system_factory",
				clerkOrgId: "org_system_factory",
			});
		});

		const result = await t.run(async (ctx) => {
			const { systemMutation } = await import("./factories");
			const fn = systemMutation({
				args: { message: v.string() },
				handler: async (factoryCtx, args) => {
					return {
						orgId: factoryCtx.orgId,
						message: args.message,
						handlerSeesOrgIdArg: "orgId" in args,
					};
				},
			});

			return await invokeRegisteredFunction(fn, ctx, {
				orgId,
				message: "ok",
			});
		});

		expect(result).toEqual({
			orgId,
			message: "ok",
			handlerSeesOrgIdArg: false,
		});

		await expect(
			t.run(async (ctx) => {
				const { systemMutation } = await import("./factories");
				const fn = systemMutation({
					args: {},
					handler: async () => "handler should not run",
				});

				return await invokeRegisteredFunction(fn, ctx, {
					orgId: "missing" as unknown,
				});
			})
		).rejects.toThrow("Organization not found");
	});

	it("orgEntity enforces not-found, non-org-scoped, and cross-org policies", async () => {
		const setup = await t.run(async (ctx) => {
			const orgA = await createTestOrg(ctx, {
				clerkUserId: "user_org_entity_a",
				clerkOrgId: "org_entity_a",
			});
			const orgB = await createTestOrg(ctx, {
				clerkUserId: "user_org_entity_b",
				clerkOrgId: "org_entity_b",
			});
			const clientA = await createTestClient(ctx, orgA.orgId, {
				companyName: "Client A",
			});
			const clientB = await createTestClient(ctx, orgB.orgId, {
				companyName: "Client B",
			});

			return { orgA, orgB, clientA, clientB };
		});

		const result = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () =>
				createTestIdentity(setup.orgA.clerkUserId, setup.orgA.clerkOrgId);

			const { userQuery } = await import("./factories");
			const fn = userQuery({
				args: {},
				handler: async (factoryCtx) => {
					const client = await factoryCtx.orgEntity(
						"clients",
						setup.clientA
					);
					const skipped = await factoryCtx.orgEntity(
						"clients",
						setup.clientB,
						{ onMismatch: "skip" }
					);

					await expect(
						factoryCtx.orgEntity("clients", "missing" as never, {
							onMismatch: "skip",
						})
					).rejects.toThrow("Entity not found in clients");

					await expect(
						factoryCtx.orgEntity("users", setup.orgA.userId)
					).rejects.toThrow(
						"users is not org-scoped - cannot use ctx.orgEntity"
					);

					await expect(
						factoryCtx.orgEntity("clients", setup.clientB)
					).rejects.toThrow("does not belong to your organization");

					return {
						companyName: client?.companyName,
						skipped,
					};
				},
			});

			return await invokeRegisteredFunction(fn, ctx);
		});

		expect(result).toEqual({
			companyName: "Client A",
			skipped: null,
		});
	});

	it("scopedToActor preserves all rows for admins and filters scalar or array assignees for members", async () => {
		const setup = await t.run(async (ctx) => {
			const adminOrg = await createTestOrg({
				db: ctx.db,
			});
			const { userId: memberUserId, clerkUserId: memberClerkUserId } =
				await addMemberToOrg(ctx, adminOrg.orgId, {
					clerkUserId: "user_factory_member",
				});
			const otherMember = await addMemberToOrg(ctx, adminOrg.orgId, {
				clerkUserId: "user_factory_other_member",
			});

			return {
				orgId: adminOrg.orgId,
				clerkOrgId: adminOrg.clerkOrgId,
				adminClerkUserId: adminOrg.clerkUserId,
				memberUserId,
				memberClerkUserId,
				otherMemberUserId: otherMember.userId,
			};
		});

		const makeRows = () => [
			{ id: "scalar-match", assigneeUserId: setup.memberUserId },
			{ id: "scalar-miss", assigneeUserId: setup.otherMemberUserId },
			{ id: "array-match", assignedUserIds: [setup.memberUserId] },
			{ id: "array-miss", assignedUserIds: [setup.otherMemberUserId] },
			{ id: "none", assigneeUserId: null },
		];

		const adminRows = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () => ({
				...createTestIdentity(setup.adminClerkUserId, setup.clerkOrgId),
				orgRole: "org:admin",
			});

			const { userQuery } = await import("./factories");
			const fn = userQuery({
				args: {},
				handler: async (factoryCtx) => {
					return await factoryCtx.scopedToActor(
						"tasks",
						makeRows(),
						(row) => row.assigneeUserId ?? row.assignedUserIds
					);
				},
			});

			return await invokeRegisteredFunction<ReturnType<typeof makeRows>>(fn, ctx);
		});

		expect(adminRows).toHaveLength(5);

		const memberRows = await t.run(async (ctx) => {
			(ctx.auth as any).getUserIdentity = async () => ({
				...createTestIdentity(setup.memberClerkUserId, setup.clerkOrgId),
				orgRole: "org:member",
			});

			const { userQuery } = await import("./factories");
			const fn = userQuery({
				args: {},
				handler: async (factoryCtx) => {
					return await factoryCtx.scopedToActor(
						"tasks",
						makeRows(),
						(row) => row.assigneeUserId ?? row.assignedUserIds
					);
				},
			});

			return await invokeRegisteredFunction<ReturnType<typeof makeRows>>(fn, ctx);
		});

		expect(memberRows.map((row) => row.id)).toEqual([
			"scalar-match",
			"array-match",
		]);
	});
});
