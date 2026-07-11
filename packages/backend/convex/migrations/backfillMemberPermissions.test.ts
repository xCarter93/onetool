import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "../test.setup";
import {
	DEFAULT_MEMBER_PERMISSIONS,
	PERMISSIONS_VERSION,
} from "../lib/permissionKeys";

const backfill =
	internal.migrations.backfillMemberPermissions.backfillMemberPermissions;

describe("backfillMemberPermissions", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/**
	 * Seeds one org with: an owner (role "owner", also organizations.ownerUserId),
	 * an admin (Clerk's real "org:admin"), and two members ("org:member" + bare
	 * "member"). Returns the membership ids so tests can inspect them by role.
	 */
	async function seedFixture() {
		return await t.run(async (ctx) => {
			const mkUser = (name: string, externalId: string) =>
				ctx.db.insert("users", {
					name,
					email: `${externalId}@example.com`,
					image: "https://example.com/i.jpg",
					externalId,
				});

			const ownerUserId = await mkUser("Owner", "user_owner");
			const adminUserId = await mkUser("Admin", "user_admin");
			const memberAUserId = await mkUser("Member A", "user_member_a");
			const memberBUserId = await mkUser("Member B", "user_member_b");

			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "org_1",
				name: "Test Org",
				ownerUserId,
			});

			const ownerMembershipId = await ctx.db.insert(
				"organizationMemberships",
				{ orgId, userId: ownerUserId, role: "owner" }
			);
			const adminMembershipId = await ctx.db.insert(
				"organizationMemberships",
				{ orgId, userId: adminUserId, role: "org:admin" }
			);
			const memberAMembershipId = await ctx.db.insert(
				"organizationMemberships",
				{ orgId, userId: memberAUserId, role: "org:member" }
			);
			const memberBMembershipId = await ctx.db.insert(
				"organizationMemberships",
				{ orgId, userId: memberBUserId, role: "member" }
			);

			return {
				orgId,
				ownerMembershipId,
				adminMembershipId,
				memberAMembershipId,
				memberBMembershipId,
			};
		});
	}

	const getMembership = (id: Id<"organizationMemberships">) =>
		t.run((ctx) => ctx.db.get(id));

	it("seeds member rows and leaves owner/admin rows null", async () => {
		const ids = await seedFixture();

		const result = await t.mutation(backfill, {});

		expect(result.seeded).toBe(2);
		expect(result.skippedElevated).toBe(2);
		expect(result.alreadySet).toBe(0);
		expect(result.isDone).toBe(true);

		const owner = await getMembership(ids.ownerMembershipId);
		const admin = await getMembership(ids.adminMembershipId);
		expect(owner?.permissions).toBeUndefined();
		expect(owner?.permissionsVersion).toBeUndefined();
		expect(admin?.permissions).toBeUndefined();

		const memberA = await getMembership(ids.memberAMembershipId);
		const memberB = await getMembership(ids.memberBMembershipId);
		for (const m of [memberA, memberB]) {
			expect(m?.permissions).toEqual(DEFAULT_MEMBER_PERMISSIONS);
			expect(m?.permissionsVersion).toBe(PERMISSIONS_VERSION);
		}
	});

	it("is idempotent — a second run seeds nothing", async () => {
		await seedFixture();

		await t.mutation(backfill, {});
		const second = await t.mutation(backfill, {});

		expect(second.seeded).toBe(0);
		expect(second.alreadySet).toBe(2); // the two members from run 1
		expect(second.skippedElevated).toBe(2); // owner + admin still skipped
	});

	it("never overwrites an existing permissions field (incl. empty {})", async () => {
		const ids = await seedFixture();
		// Simulate a member whose grants were explicitly cleared to no-access.
		await t.run((ctx) =>
			ctx.db.patch(ids.memberAMembershipId, { permissions: {} })
		);

		const result = await t.mutation(backfill, {});

		expect(result.alreadySet).toBe(1); // memberA skipped as already-set
		expect(result.seeded).toBe(1); // only memberB seeded
		const memberA = await getMembership(ids.memberAMembershipId);
		expect(memberA?.permissions).toEqual({});
	});

	it("dryRun reports counts without writing", async () => {
		const ids = await seedFixture();

		const result = await t.mutation(backfill, { dryRun: true });

		expect(result.seeded).toBe(2);
		expect(result.alreadySet).toBe(0);
		expect(result.skippedElevated).toBe(2);
		expect(result.dryRun).toBe(true);
		expect(result.isDone).toBe(true);
		for (const id of [ids.memberAMembershipId, ids.memberBMembershipId]) {
			const member = await getMembership(id);
			expect(member?.permissions).toBeUndefined();
			expect(member?.permissionsVersion).toBeUndefined();
		}
	});
});
