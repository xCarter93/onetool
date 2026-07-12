import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
	optionalUserQuery,
	userMutation,
	userQuery,
	type UserMutationCtx,
	type UserQueryCtx,
} from "./lib/factories";
import { getMembership, listMembershipsByOrg } from "./lib/memberships";
import {
	getEffectivePermissions,
	getEffectivePermissionsFor,
	isAdminRole,
	type EffectivePermissions,
} from "./lib/permissions";
import {
	DEFAULT_MEMBER_PERMISSIONS,
	isPermissionObject,
	isScopable,
	levelAtLeast,
	PERMISSION_OBJECTS,
	PERMISSIONS_VERSION,
	type ObjectGrant,
	type PermissionGrants,
} from "./lib/permissionKeys";

/**
 * Grant management (admin plane) for granular per-object permissions.
 *
 * Unlike the domain-function gating in lib/permissions.ts, this surface is NOT
 * behind the PERMISSIONS_ENFORCE shadow flag: it is new, has no legacy callers,
 * and mediates who may edit grants — always enforced.
 */

const grantValidator = v.record(
	v.string(),
	v.object({
		level: v.union(
			v.literal("none"),
			v.literal("view"),
			v.literal("modify"),
			v.literal("delete")
		),
		allRecords: v.optional(v.boolean()),
	})
);

type MemberAccessRow = {
	userId: Id<"users">;
	externalId: string;
	name?: string;
	email?: string;
	image?: string;
	role: string | null;
	isOwner: boolean;
	isAdmin: boolean;
	hasCustomPermissions: boolean;
};

function grantsEqual(a: ObjectGrant, b: ObjectGrant): boolean {
	return a.level === b.level && (a.allRecords === true) === (b.allRecords === true);
}

/** Stored grants differ from the role defaults (drives the Default/Custom chip). */
function isCustomized(stored: PermissionGrants | undefined): boolean {
	if (stored === undefined) return false;
	const keys = new Set([
		...Object.keys(stored),
		...Object.keys(DEFAULT_MEMBER_PERMISSIONS),
	]);
	for (const key of keys) {
		if (!isPermissionObject(key)) return true; // unknown stored key = not default
		const s = stored[key];
		const d = DEFAULT_MEMBER_PERMISSIONS[key];
		if (!s || !d) {
			// Present on one side only; a stored {level:"none"} with no default is a no-op.
			const present = s ?? d;
			if (present && (present.level !== "none" || present.allRecords)) return true;
			continue;
		}
		if (!grantsEqual(s, d)) return true;
	}
	return false;
}

async function requireGrantAdmin(
	ctx: UserQueryCtx | UserMutationCtx
): Promise<void> {
	// Admin-or-owner only (no grantable "manage team" permission in v1).
	const effective = await getEffectivePermissionsFor(ctx, ctx.user, ctx.orgId);
	if (effective !== "all") {
		throw new ConvexError({ code: "FORBIDDEN", detail: "Admin access required" });
	}
}

export const setMemberPermissions = userMutation({
	args: {
		userId: v.id("users"),
		permissions: grantValidator,
	},
	handler: async (ctx, { userId, permissions }): Promise<null> => {
		await requireGrantAdmin(ctx);

		const org = await ctx.db.get(ctx.orgId);
		if (org?.ownerUserId === userId) {
			throw new ConvexError({
				code: "FORBIDDEN",
				detail: "Owner permissions are immutable",
			});
		}

		const validated: PermissionGrants = {};
		for (const [obj, grant] of Object.entries(permissions)) {
			if (!isPermissionObject(obj)) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					detail: `Unknown permission object: ${obj}`,
				});
			}
			const def = PERMISSION_OBJECTS[obj];
			if (!levelAtLeast(def.maxLevel, grant.level)) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					detail: `${obj} does not support level ${grant.level}`,
				});
			}
			if (grant.allRecords && !isScopable(obj)) {
				throw new ConvexError({
					code: "BAD_REQUEST",
					detail: `${obj} does not support record scoping`,
				});
			}
			validated[obj] = grant.allRecords === undefined
				? { level: grant.level }
				: { level: grant.level, allRecords: grant.allRecords };
		}

		const membership = await getMembership(ctx, userId, ctx.orgId);
		if (!membership) {
			throw new ConvexError({
				code: "NOT_FOUND",
				detail: "User does not belong to this organization",
			});
		}
		await ctx.db.patch(membership._id, {
			permissions: validated,
			permissionsVersion: PERMISSIONS_VERSION,
		});
		// Follow-up (Phase 4): activities audit entry ("X changed Y's permissions").
		return null;
	},
});

/**
 * Current caller's effective grants for UX gating (sidebar, routes, actions).
 * Convex-side requireLevel remains the authoritative gate; a stale client can
 * only briefly render a link that errors on use.
 */
export const myPermissions = optionalUserQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{ all: boolean; grants: PermissionGrants }> => {
		const effective: EffectivePermissions = await getEffectivePermissions(ctx);
		return effective === "all"
			? { all: true, grants: {} }
			: { all: false, grants: effective };
	},
});

/** Target member's stored grants + identity for the admin permission editor. */
export const memberPermissions = userQuery({
	args: { userId: v.id("users") },
	handler: async (
		ctx,
		{ userId }
	): Promise<{
		userId: Id<"users">;
		externalId: string;
		name?: string;
		email?: string;
		image?: string;
		role: string | null;
		isOwner: boolean;
		isAdmin: boolean;
		permissions: PermissionGrants | null;
	} | null> => {
		await requireGrantAdmin(ctx);

		const membership = await getMembership(ctx, userId, ctx.orgId);
		const user = await ctx.db.get(userId);
		if (!membership || !user) return null;

		const org = await ctx.db.get(ctx.orgId);
		const isOwner = org?.ownerUserId === userId;
		const stored = membership.permissions as PermissionGrants | undefined;
		return {
			userId,
			externalId: user.externalId,
			name: user.name,
			email: user.email,
			image: user.image,
			role: membership.role ?? null,
			isOwner,
			isAdmin: isOwner || isAdminRole(membership.role),
			permissions: stored ?? null,
		};
	},
});

/**
 * Per-member access summary for the org member list, keyed by Clerk id
 * (`externalId`) so the Clerk-driven overview tab can link to the Convex-id
 * access page and render Full/Custom/Default chips.
 */
export const orgMemberAccess = userQuery({
	args: {},
	handler: async (ctx): Promise<MemberAccessRow[]> => {
		await requireGrantAdmin(ctx);

		const org = await ctx.db.get(ctx.orgId);
		const memberships = await listMembershipsByOrg(ctx, ctx.orgId);
		const rows: MemberAccessRow[] = [];
		for (const membership of memberships) {
			const user = await ctx.db.get(membership.userId);
			if (!user) continue;
			const isOwner = org?.ownerUserId === membership.userId;
			rows.push({
				userId: membership.userId,
				externalId: user.externalId,
				name: user.name,
				email: user.email,
				image: user.image,
				role: membership.role ?? null,
				isOwner,
				isAdmin: isOwner || isAdminRole(membership.role),
				hasCustomPermissions: isCustomized(
					membership.permissions as PermissionGrants | undefined
				),
			});
		}
		return rows;
	},
});
