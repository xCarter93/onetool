import type { QueryCtx, MutationCtx } from "../_generated/server";
import { query } from "../_generated/server";

/**
 * Server-side permission checking utilities
 *
 * These functions check feature access using Clerk's auth context
 */

// Extended identity type that includes custom claims
interface ClerkIdentityWithClaims {
	tokenIdentifier: string;
	subject: string;
	issuer: string;
	email?: string;
	publicMetadata?: {
		has_premium_feature_access?: boolean;
		[key: string]: unknown;
	};
	orgPublicMetadata?: {
		has_premium_feature_access?: boolean;
		[key: string]: unknown;
	};
	// Plan claims (Clerk Billing)
	pla?: string; // Plan claim (Clerk convention)
	plan?: string; // Alternative plan location
	[key: string]: unknown;
}

/**
 * Debug query to inspect JWT token structure
 * Useful for troubleshooting plan and metadata detection
 */
export const debugAuthToken = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return { error: "Not authenticated" };
		}

		const tokenData = identity as ClerkIdentityWithClaims;

		return {
			// Safe to log these for debugging
			subject: tokenData.subject,
			issuer: tokenData.issuer,
			email: tokenData.email,
			// Full public metadata objects
			publicMetadata:
				tokenData.publicMetadata || tokenData.public_metadata || null,
			orgPublicMetadata:
				tokenData.orgPublicMetadata || tokenData.org_public_metadata || null,
			// Check various public metadata locations
			publicMetadataChecks: {
				"publicMetadata.has_premium_feature_access":
					tokenData.publicMetadata?.has_premium_feature_access,
			},
			// Check org public metadata locations
			orgPublicMetadataChecks: {
				"orgPublicMetadata.has_premium_feature_access":
					tokenData.orgPublicMetadata?.has_premium_feature_access,
			},
			// Check for plan in various locations
			planChecks: {
				pla: tokenData.pla,
				plan: tokenData.plan,
			},
			// List all top-level keys in the token (helps identify structure)
			availableKeys: Object.keys(tokenData),
			// Show the ENTIRE token (be careful - only use in development)
			fullTokenData: tokenData,
		};
	},
});

/**
 * Check if the current user has a specific feature
 */
export async function hasFeature(
	ctx: QueryCtx | MutationCtx,
	feature: string
): Promise<boolean> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return false;
	}

	const tokenData = identity as ClerkIdentityWithClaims;

	// Check for premium feature access at the USER or ORGANIZATION level
	// Backend checks public metadata since we can't use Clerk's has() method here
	// Frontend uses has({ plan: 'onetool_business_plan' }) and publicMetadata
	if (feature === "premium_feature_access") {
		// Check user public metadata for has_premium_feature_access flag
		const hasPremiumViaUserMetadata =
			tokenData.publicMetadata?.has_premium_feature_access === true;

		// Check organization public metadata for has_premium_feature_access flag
		const hasPremiumViaOrgMetadata =
			tokenData.orgPublicMetadata?.has_premium_feature_access === true;

		// User has premium if EITHER user or org has the flag set
		const hasPremiumAccess =
			hasPremiumViaUserMetadata || hasPremiumViaOrgMetadata;

		// Debug logging to help troubleshoot (remove after confirming it works)
		console.log("Backend premium access check:", {
			hasPremiumViaUserMetadata,
			hasPremiumViaOrgMetadata,
			hasPremiumAccess,
			userPublicMetadataExists:
				!!tokenData.publicMetadata || !!tokenData.public_metadata,
			orgPublicMetadataExists:
				!!tokenData.orgPublicMetadata || !!tokenData.org_public_metadata,
			userPublicMetadataValue:
				tokenData.publicMetadata || tokenData.public_metadata,
			orgPublicMetadataValue:
				tokenData.orgPublicMetadata || tokenData.org_public_metadata,
		});

		return hasPremiumAccess;
	}

	return false;
}

/**
 * Require that the user has a specific feature, throw if not
 */
export async function requireFeature(
	ctx: QueryCtx | MutationCtx,
	feature: string
): Promise<void> {
	const hasAccess = await hasFeature(ctx, feature);
	if (!hasAccess) {
		throw new Error(
			`Access denied: This feature requires ${feature}. Please upgrade your plan.`
		);
	}
}

/**
 * Check if user has premium access
 */
export async function hasPremiumAccess(
	ctx: QueryCtx | MutationCtx
): Promise<boolean> {
	return hasFeature(ctx, "premium_feature_access");
}

/**
 * Require premium access, throw if not available
 */
export async function requirePremiumAccess(
	ctx: QueryCtx | MutationCtx
): Promise<void> {
	await requireFeature(ctx, "premium_feature_access");
}

/**
 * Check feature access and return result
 */
export async function checkFeatureAccess(
	ctx: QueryCtx | MutationCtx,
	feature: string
): Promise<{ hasAccess: boolean; reason?: string }> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return {
			hasAccess: false,
			reason: "Not authenticated",
		};
	}

	const hasAccess = await hasFeature(ctx, feature);
	if (!hasAccess) {
		return {
			hasAccess: false,
			reason: `Feature ${feature} not available on your current plan`,
		};
	}

	return { hasAccess: true };
}

/**
 * Role-based permission utilities
 */

import { getCurrentUser, getCurrentUserOrgId } from "./auth";
import { getMembership } from "./memberships";
import type { Id } from "../_generated/dataModel";

// Extended identity type that includes organization role from Clerk JWT
interface ClerkIdentityWithOrgRole {
	tokenIdentifier: string;
	subject: string;
	orgRole?: string; // From Clerk JWT: "org:admin", "org:member", etc.
	org_role?: string; // Alternative location
	[key: string]: unknown;
}

/**
 * Get the current user's role in their active organization from Clerk JWT
 * This reads directly from the Clerk authentication token, not from the database
 */
export async function getCurrentUserRole(
	ctx: QueryCtx | MutationCtx
): Promise<string | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	// Get role from Clerk JWT token (same as frontend useAuth().orgRole)
	const clerkIdentity = identity as ClerkIdentityWithOrgRole;
	const orgRole = clerkIdentity.orgRole ?? clerkIdentity.org_role ?? null;

	return orgRole;
}

/**
 * Check if the current user is an admin in their organization
 * Uses explicit role comparison to prevent substring matching attacks
 */
export async function isAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
	const role = await getCurrentUserRole(ctx);
	if (!role) {
		return false;
	}

	const normalized = role.toLowerCase().trim();
	return normalized === "org:admin" || normalized === "admin" || normalized === "owner";
}

/**
 * Check if the current user is a member (non-admin) in their organization
 * Member is defined as a role that explicitly includes "member" and does not include "admin"
 * Secure-by-default: denies access if role is missing or lookup fails
 */
export async function isMember(ctx: QueryCtx | MutationCtx): Promise<boolean> {
	const role = await getCurrentUserRole(ctx);

	// Secure-by-default: deny if role is missing or lookup fails
	if (!role) {
		return false;
	}

	// Normalize role string
	const normalizedRole = role.trim().toLowerCase();

	// Only return true for explicit member roles
	// Must include/equal "member" and must NOT include "admin"
	return normalizedRole.includes("member") && !normalizedRole.includes("admin");
}

/**
 * Require that the current user is an admin, throw if not
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<void> {
	const isAdminUser = await isAdmin(ctx);
	if (!isAdminUser) {
		throw new Error(
			"Access denied: This action requires administrator privileges."
		);
	}
}

/**
 * Get the current user's ID for filtering assigned items
 */
export async function getCurrentUserId(
	ctx: QueryCtx | MutationCtx
): Promise<Id<"users"> | null> {
	const user = await getCurrentUser(ctx);
	return user?._id ?? null;
}
