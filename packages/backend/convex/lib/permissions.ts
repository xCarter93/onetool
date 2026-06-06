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
// INTENTIONAL: raw public query. Out of scope for Phase 18 (see ADR-0001 §debugAuthToken).
// Do NOT migrate to userQuery — its fate (delete vs gate) is a separate PR.
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
 * Role-based permission utilities
 */

import { getCurrentUser } from "./auth";
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
 * Get the current user's ID for filtering assigned items
 */
export async function getCurrentUserId(
	ctx: QueryCtx | MutationCtx
): Promise<Id<"users"> | null> {
	const user = await getCurrentUser(ctx);
	return user?._id ?? null;
}
