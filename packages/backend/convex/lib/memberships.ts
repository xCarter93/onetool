import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
	DEFAULT_MEMBER_PERMISSIONS,
	PERMISSIONS_VERSION,
} from "./permissionKeys";

type Ctx = QueryCtx | MutationCtx;

export async function getMembership(
	ctx: Ctx,
	userId: Id<"users">,
	orgId: Id<"organizations">
): Promise<Doc<"organizationMemberships"> | null> {
	return await ctx.db
		.query("organizationMemberships")
		.withIndex("by_org_user", (q) =>
			q.eq("orgId", orgId).eq("userId", userId)
		)
		.unique();
}

export async function requireMembership(
	ctx: Ctx,
	userId: Id<"users">,
	orgId: Id<"organizations">
): Promise<Doc<"organizationMemberships">> {
	const membership = await getMembership(ctx, userId, orgId);
	if (!membership) {
		throw new Error("User does not belong to this organization");
	}
	return membership;
}

export async function ensureMembership(
	ctx: MutationCtx,
	userId: Id<"users">,
	orgId: Id<"organizations">,
	role?: string | null
): Promise<Id<"organizationMemberships">> {
	const existing = await getMembership(ctx, userId, orgId);
	if (existing) {
		if (role !== undefined && role !== null && existing.role !== role) {
			await ctx.db.patch(existing._id, { role });
		}
		return existing._id;
	}

	// Seed member defaults on every new membership. Grants are dormant while the
	// row is admin/owner (resolver short-circuits to "all") and reactivate on
	// demotion — so seeding regardless of role is correct (PRD §2, §4.5).
	return await ctx.db.insert("organizationMemberships", {
		orgId,
		userId,
		role: role ?? undefined,
		permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
		permissionsVersion: PERMISSIONS_VERSION,
	});
}

export async function removeMembership(
	ctx: MutationCtx,
	userId: Id<"users">,
	orgId: Id<"organizations">
): Promise<void> {
	const existing = await getMembership(ctx, userId, orgId);
	if (existing) {
		await ctx.db.delete(existing._id);
	}
}

export async function listMembershipsByOrg(
	ctx: Ctx,
	orgId: Id<"organizations">
): Promise<Doc<"organizationMemberships">[]> {
	return await ctx.db
		.query("organizationMemberships")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
}

export async function listMembershipsByUser(
	ctx: Ctx,
	userId: Id<"users">
): Promise<Doc<"organizationMemberships">[]> {
	return await ctx.db
		.query("organizationMemberships")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
}

