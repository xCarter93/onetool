import { action, internalQuery } from "./_generated/server";
import { internalMutation, mutation } from "./lib/triggers";
import { createClerkClient, UserJSON } from "@clerk/backend";
import { v, Validator } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	getCurrentUser,
	getCurrentUserOrgId,
	getOrganizationByClerkId,
	userByExternalId,
} from "./lib/auth";
import { getOptionalOrgId } from "./lib/queries";
import { internal } from "./_generated/api";
import {
	ensureMembership,
	getMembership,
	listMembershipsByOrg,
	listMembershipsByUser,
	removeMembership,
} from "./lib/memberships";
import { optionalUserQuery, userMutation } from "./lib/factories";
import { readPremiumOverride } from "./lib/permissions";
import { rateLimiter } from "./rateLimits";

export const current = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});

/**
 * List all users in the current user's organization
 */
export const listByOrg = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}
		const memberships = await listMembershipsByOrg(ctx, userOrgId);
		const members = [];
		for (const membership of memberships) {
			const member = await ctx.db.get(membership.userId);
			if (member) {
				members.push(member);
			}
		}
		return members;
	},
});

/**
 * Get a user by ID (returns limited fields).
 *
 * The target must be a member of the caller's active org — without that check
 * this is a deployment-wide name/email lookup for any `Id<"users">`.
 */
export const get = optionalUserQuery({
	args: { id: v.id("users") },
	handler: async (ctx, args) => {
		const currentUser = await getCurrentUser(ctx);
		if (!currentUser) return null;

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		if (!(await getMembership(ctx, args.id, orgId))) return null;

		const user = await ctx.db.get(args.id);
		if (!user) return null;

		return {
			_id: user._id,
			_creationTime: user._creationTime,
			name: user.name,
			email: user.email,
			image: user.image,
		};
	},
});

export const upsertFromClerk = internalMutation({
	args: { data: v.any() as Validator<UserJSON> }, // no runtime validation, trust Clerk
	async handler(ctx, { data }) {
		const userAttributes = {
			name: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim(),
			email: data.email_addresses?.[0]?.email_address || "",
			image: data.image_url || "",
			lastSignedInDate: Date.now(),
			externalId: data.id,
			// Always written, so a revoke (metadata key set back to null) clears it.
			hasPremiumFeatureAccess: readPremiumOverride(data.public_metadata),
		};

		const user = await userByExternalId(ctx, data.id);
		if (user === null) {
			await ctx.db.insert("users", userAttributes);
			console.log(`Created new user: ${data.id}`);
		} else {
			await ctx.db.patch(user._id, userAttributes);
			console.log(`Updated existing user: ${data.id}`);
		}

		// After creating/updating a user, check if there are any pending organizations
		// that were waiting for this user to be created
		await ctx.runMutation(
			internal.organizations.retryPendingOrganizationCreation,
			{
				ownerClerkUserId: data.id,
			}
		);
	},
});

export const deleteFromClerk = internalMutation({
	args: { clerkUserId: v.string() },
	async handler(ctx, { clerkUserId }) {
		const user = await userByExternalId(ctx, clerkUserId);

		if (user === null) {
			console.warn(
				`Can't delete user, there is none for Clerk user ID: ${clerkUserId}`
			);
			return;
		}

		// Sole-owner policy: deleting a user who owns an org deletes that org now
		// + drains its data async (Apple 5.1.1(v) / GDPR erasure).
		const ownedOrgs = await ctx.db
			.query("organizations")
			.withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
			.collect();
		for (const org of ownedOrgs) {
			const orgMemberships = await listMembershipsByOrg(ctx, org._id);
			for (const membership of orgMemberships) {
				await ctx.db.delete(membership._id);
			}
			await ctx.db.delete(org._id);
			await ctx.scheduler.runAfter(
				0,
				internal.orgCascade.cascadeDeleteOrgDataChunk,
				{ orgId: org._id }
			);
		}

		// Delete the user's remaining memberships (re-listed after owned-org
		// deletes, guarded against rows already removed above).
		const remainingMemberships = await listMembershipsByUser(ctx, user._id);
		for (const membership of remainingMemberships) {
			if ((await ctx.db.get(membership._id)) !== null) {
				await ctx.db.delete(membership._id);
			}
		}

		// Delete the user's push tokens.
		const pushTokens = await ctx.db
			.query("pushTokens")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();
		for (const token of pushTokens) {
			await ctx.db.delete(token._id);
		}

		await ctx.db.delete(user._id);
	},
});

export const updateLastSignedInDate = internalMutation({
	args: { clerkUserId: v.string() },
	async handler(ctx, { clerkUserId }) {
		const user = await userByExternalId(ctx, clerkUserId);

		if (user !== null) {
			await ctx.db.patch(user._id, {
				lastSignedInDate: Date.now(),
			});
		} else {
			console.warn(
				`Can't update last signed in date, no user found for Clerk user ID: ${clerkUserId}`
			);
		}
	},
});

/**
 * Update user organization when they join via Clerk
 */
export const updateUserOrganization = internalMutation({
	args: {
		clerkUserId: v.string(),
		clerkOrganizationId: v.string(),
		role: v.optional(v.string()),
	},
	async handler(ctx, { clerkUserId, clerkOrganizationId, role }) {
		const user = await userByExternalId(ctx, clerkUserId);
		if (!user) {
			console.warn(`User not found for Clerk ID: ${clerkUserId}`);
			return;
		}

		// Find the organization by Clerk ID
		const organization = await getOrganizationByClerkId(ctx, clerkOrganizationId);

		if (!organization) {
			console.warn(
				`Organization not found for Clerk ID: ${clerkOrganizationId}`
			);
			return;
		}

		await ensureMembership(ctx, user._id, organization._id, role);
	},
});

/**
 * Remove user from organization when they leave via Clerk
 */
export const removeUserFromOrganization = internalMutation({
	args: {
		clerkUserId: v.string(),
		clerkOrganizationId: v.string(),
	},
	async handler(ctx, { clerkUserId, clerkOrganizationId }) {
		const user = await userByExternalId(ctx, clerkUserId);
		if (!user) {
			console.warn(`User not found for Clerk ID: ${clerkUserId}`);
			return;
		}

		const organization = await getOrganizationByClerkId(ctx, clerkOrganizationId);
		if (!organization) {
			console.warn(
				`Organization not found for Clerk ID: ${clerkOrganizationId}`
			);
			return;
		}

		await removeMembership(ctx, user._id, organization._id);
	},
});

/**
 * Resolve the caller's org and its Clerk organization id, for the mention-sync
 * action to verify membership against. Internal: the action supplies the auth.
 */
export const getMentionSyncContext = internalQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{
		orgId: Id<"organizations">;
		clerkOrganizationId: string;
	} | null> => {
		const user = await getCurrentUser(ctx);
		if (!user) return null;
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;
		const organization = await ctx.db.get(orgId);
		if (!organization) return null;
		return {
			orgId,
			clerkOrganizationId: organization.clerkOrganizationId,
		};
	},
});

/**
 * Create-or-find the Convex user for a Clerk member and bind them to the org.
 * Internal-only: the caller must already have proven, against Clerk, that
 * `clerkUserId` belongs to `orgId`'s Clerk organization.
 */
export const upsertVerifiedClerkUser = internalMutation({
	args: {
		clerkUserId: v.string(),
		orgId: v.id("organizations"),
		name: v.string(),
		email: v.string(),
		imageUrl: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"users">> => {
		const existingUser = await userByExternalId(ctx, args.clerkUserId);
		if (existingUser) {
			await ensureMembership(ctx, existingUser._id, args.orgId);
			return existingUser._id;
		}

		// No lastSignedInDate: this user hasn't signed in — the session webhook
		// stamps it when they actually do.
		const userId = await ctx.db.insert("users", {
			name: args.name,
			email: args.email,
			image: args.imageUrl,
			externalId: args.clerkUserId,
		});
		await ensureMembership(ctx, userId, args.orgId);
		return userId;
	},
});

/**
 * Look up a Clerk organization membership. Split out so tests can stub it.
 * Returns the member's Clerk profile, or null if they are not a member.
 */
export async function fetchClerkOrgMember(
	clerkOrganizationId: string,
	clerkUserId: string
): Promise<{ name: string; email: string; imageUrl: string } | null> {
	const secretKey = process.env.CLERK_SECRET_KEY;
	if (!secretKey) {
		throw new Error("CLERK_SECRET_KEY is not configured");
	}
	const clerk = createClerkClient({ secretKey });
	const { data } = await clerk.organizations.getOrganizationMembershipList({
		organizationId: clerkOrganizationId,
		userId: [clerkUserId],
	});
	const membership = data.find(
		(row) => row.publicUserData?.userId === clerkUserId
	);
	if (!membership?.publicUserData) return null;

	const profile = membership.publicUserData;
	const name = `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
	return {
		name: name || profile.identifier || "Unknown User",
		email: profile.identifier ?? "",
		imageUrl: profile.imageUrl ?? "",
	};
}

/**
 * Resolve a Clerk org member to a Convex user id, creating the row and the
 * membership if the webhooks have not landed yet. Backs the @mention picker,
 * which is its only caller (web + mobile).
 *
 * An action, not a mutation, because the Clerk id must be checked against
 * Clerk itself: as a plain mutation this bound any Clerk id the caller cared
 * to name into their own org, and pre-planted a `users` row carrying an
 * attacker-chosen `externalId` — the sole identity join key — which the
 * victim's real `user.created` webhook would later patch rather than replace.
 * The profile fields are taken from Clerk's response, not from the caller.
 */
export const syncUserFromClerk = action({
	args: {
		clerkUserId: v.string(),
		// Accepted for call-site compatibility and ignored: the stored profile
		// comes from Clerk.
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"users"> | null> => {
		const context = await ctx.runQuery(internal.users.getMentionSyncContext, {});
		if (!context) return null;

		await rateLimiter.limit(ctx, "mentionUserSync", {
			key: context.orgId,
			throws: true,
		});

		const member = await fetchClerkOrgMember(
			context.clerkOrganizationId,
			args.clerkUserId
		);
		if (!member) return null;

		return await ctx.runMutation(internal.users.upsertVerifiedClerkUser, {
			clerkUserId: args.clerkUserId,
			orgId: context.orgId,
			name: member.name,
			email: member.email,
			imageUrl: member.imageUrl,
		});
	},
});
