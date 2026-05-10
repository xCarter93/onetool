import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Extended identity type that includes Clerk's activeOrgId
interface ClerkIdentityWithActiveOrg {
	tokenIdentifier: string;
	subject: string;
	issuer: string;
	activeOrgId?: string;
	orgId?: string | null;
	org_id?: string | null;
	// ... other Clerk identity fields
}

/**
 * Get the current authenticated user, throwing an error if not found
 */
export async function getCurrentUserOrThrow(ctx: QueryCtx | MutationCtx) {
	const userRecord = await getCurrentUser(ctx);
	if (!userRecord) throw new Error("User not authenticated");
	return userRecord;
}

/**
 * Get the current authenticated user, returning null if not found
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (identity === null) {
		return null;
	}
	return await userByExternalId(ctx, identity.subject);
}

/**
 * Find a user by their external (Clerk) ID
 */
export async function userByExternalId(
	ctx: QueryCtx | MutationCtx,
	externalId: string
) {
	return await ctx.db
		.query("users")
		.withIndex("by_external_id", (q) => q.eq("externalId", externalId))
		.unique();
}

/**
 * Get an organization by its Clerk organization ID
 */
export async function getOrganizationByClerkId(
	ctx: QueryCtx | MutationCtx,
	clerkOrgId: string
) {
	return await ctx.db
		.query("organizations")
		.withIndex("by_clerk_org", (q) => q.eq("clerkOrganizationId", clerkOrgId))
		.unique();
}

/**
 * Get the current user's active organization ID from Clerk identity, throwing an error if not found
 * This uses the activeOrgId from the Clerk JWT token to ensure proper data isolation
 * when users are members of multiple organizations.
 */
export async function getCurrentUserOrgId(
	ctx: QueryCtx | MutationCtx
): Promise<Id<"organizations">>;
export async function getCurrentUserOrgId(
	ctx: QueryCtx | MutationCtx,
	options: { require: false }
): Promise<Id<"organizations"> | null>;
export async function getCurrentUserOrgId(
	ctx: QueryCtx | MutationCtx,
	options: { require?: boolean } = {}
): Promise<Id<"organizations"> | null> {
	const requireOrg = options.require !== false;
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		// require:false callers (~30 sites) already handle null by returning
		// empty data; throwing here surfaces during Clerk setActive() token
		// rotation when Convex briefly sees no identity.
		if (!requireOrg) {
			return null;
		}
		throw new Error("User not authenticated");
	}

	// Get the active organization ID from Clerk JWT token
	const clerkIdentity = identity as ClerkIdentityWithActiveOrg;
	const activeOrgId =
		clerkIdentity.activeOrgId ??
		clerkIdentity.orgId ??
		clerkIdentity.org_id ??
		undefined;
	if (!activeOrgId) {
		if (!requireOrg) {
			return null;
		}
		throw new Error("No active organization found in user session");
	}
	// Look up the organization by Clerk organization ID
	const organization = await getOrganizationByClerkId(ctx, activeOrgId);
	if (!organization) {
		if (!requireOrg) {
			return null;
		}
		throw new Error("Active organization not found in database");
	}

	return organization._id;
}

/**
 * Get the current user's organization ID, returning null if not found (new user-friendly version)
 */
export async function getCurrentUserOrgIdOptional(ctx: QueryCtx | MutationCtx) {
	return getCurrentUserOrgId(ctx, { require: false });
}

/**
 * Get the current user's organization ID, returning null if user is not authenticated or has no org
 */
export async function getCurrentUserOrgIdSafe(ctx: QueryCtx | MutationCtx) {
	try {
		return await getCurrentUserOrgId(ctx, { require: false });
	} catch {
		return null;
	}
}

/**
 * Ensure the current user has access to the specified organization
 */
export async function validateOrgAccess(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">
) {
	const userOrgId = await getCurrentUserOrgId(ctx);
	if (userOrgId !== orgId) {
		throw new Error("User does not have access to this organization");
	}
	return userOrgId;
}

/**
 * Validate organization access optionally - returns null if user has no org instead of throwing
 */
export async function validateOrgAccessOptional(
	ctx: QueryCtx | MutationCtx,
	orgId: string
) {
	const userOrgId = await getCurrentUserOrgIdOptional(ctx);
	if (!userOrgId) {
		return null;
	}
	if (userOrgId !== orgId) {
		throw new Error("User does not have access to this organization");
	}
	return userOrgId;
}
