/**
 * Organization-related utility functions
 * Provides helpers for common organization data lookups
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { getCurrentUserOrgId } from "./auth";
import { getOptionalOrgId } from "./queries";

/**
 * Organization context with commonly needed fields
 */
export interface OrganizationContext {
	orgId: Id<"organizations">;
	timezone?: string;
	organization: Doc<"organizations">;
}

/**
 * Get organization timezone for the current user's organization
 * Returns undefined if no timezone is set (will fall back to UTC in date functions)
 *
 * @param ctx - Convex query or mutation context
 * @returns The organization's timezone string or undefined
 */
export async function getOrgTimezone(
	ctx: QueryCtx | MutationCtx
): Promise<string | undefined> {
	const userOrgId = await getOptionalOrgId(ctx);
	if (!userOrgId) {
		return undefined;
	}

	const org = await ctx.db.get(userOrgId);
	return org?.timezone;
}

/**
 * Get organization timezone by organization ID
 * Useful when you already have the orgId and don't want to re-fetch from auth
 *
 * @param ctx - Convex query or mutation context
 * @param orgId - The organization ID
 * @returns The organization's timezone string or undefined
 */
export async function getOrgTimezoneById(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">
): Promise<string | undefined> {
	const org = await ctx.db.get(orgId);
	return org?.timezone;
}

/**
 * Get organization context with timezone and other common fields
 * This is a convenience function that combines org lookup with timezone extraction
 *
 * @param ctx - Convex query or mutation context
 * @returns Organization context with orgId, timezone, and full organization doc
 */
export async function getOrgContext(
	ctx: QueryCtx | MutationCtx
): Promise<OrganizationContext | null> {
	const userOrgId = await getOptionalOrgId(ctx);
	if (!userOrgId) {
		return null;
	}

	const organization = await ctx.db.get(userOrgId);
	if (!organization) {
		return null;
	}

	return {
		orgId: userOrgId,
		timezone: organization.timezone,
		organization,
	};
}

/**
 * Get organization context, throwing if not found
 *
 * @param ctx - Convex query or mutation context
 * @returns Organization context with orgId, timezone, and full organization doc
 * @throws Error if user is not authenticated or organization not found
 */
export async function getOrgContextOrThrow(
	ctx: QueryCtx | MutationCtx
): Promise<OrganizationContext> {
	const context = await getOrgContext(ctx);
	if (!context) {
		throw new Error("Organization not found");
	}
	return context;
}
