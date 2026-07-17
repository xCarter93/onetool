import type { QueryCtx, MutationCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { getCurrentUserOrgIdOrNull } from "./auth";

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

export const PREMIUM_PLAN_SLUG = "onetool_business_plan_org";

/** The Clerk public_metadata key carrying the manual premium override. */
export const PREMIUM_OVERRIDE_METADATA_KEY = "has_premium_feature_access";

/**
 * Read the premium override out of a Clerk public_metadata bag. Strict `=== true`
 * is load-bearing: the admin console revokes by writing the key back as `null`
 * (not by deleting it), so anything other than `true` must read as false or a
 * revoke would never propagate.
 */
export function readPremiumOverride(
	publicMetadata: unknown
): boolean {
	if (typeof publicMetadata !== "object" || publicMetadata === null) {
		return false;
	}
	return (
		(publicMetadata as Record<string, unknown>)[
			PREMIUM_OVERRIDE_METADATA_KEY
		] === true
	);
}

// Statuses under which a subscription grants access (free trials arrive as
// "active" with is_free_trial on the item, so "trialing" rarely appears).
const PREMIUM_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Plan check from the org doc alone, for system/cron contexts with no request
 * identity. Honors the ORG-level has_premium_feature_access override via the
 * webhook-synced `hasPremiumFeatureAccess` mirror. A USER-level override is not
 * visible here: callers that hold a specific user (e.g. cron dispatch, which has
 * the automation's creator) OR this with userHasPremiumOverride. Identity-scoped
 * callers should use hasPremiumAccess instead, which reads the live JWT.
 */
export function orgHasPremiumPlan(
	org: {
		clerkPlanSlug?: string;
		subscriptionStatus?: string;
		hasPremiumFeatureAccess?: boolean;
	} | null
): boolean {
	if (org?.hasPremiumFeatureAccess === true) {
		return true;
	}
	return (
		org?.clerkPlanSlug === PREMIUM_PLAN_SLUG &&
		PREMIUM_SUBSCRIPTION_STATUSES.has(org.subscriptionStatus ?? "")
	);
}

/**
 * User-level premium override, from the webhook-synced mirror. For identity-less
 * contexts that have a specific user in hand (e.g. a scheduled automation's
 * creator). Grants premium to that user only, never to the whole org.
 */
export function userHasPremiumOverride(
	user: { hasPremiumFeatureAccess?: boolean } | null
): boolean {
	return user?.hasPremiumFeatureAccess === true;
}

/**
 * Server-side mirror of the web app's useFeatureAccess() premium check
 * (apps/web/src/hooks/use-feature-access.ts): premium if the user OR org has
 * the has_premium_feature_access metadata flag (present in the "convex" JWT
 * template), or the org's billing-webhook-synced subscription is on the paid
 * plan. Clerk's `pla` billing claim is NOT in custom JWT templates and reading
 * plans from session claims is unsupported — the org doc (kept current by
 * billingWebhook.ts) is the plan source of truth here.
 * Secure-by-default: unauthenticated callers are not premium.
 */
export async function hasPremiumAccess(
	ctx: QueryCtx | MutationCtx
): Promise<boolean> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return false;
	}
	const token = identity as ClerkIdentityWithClaims;

	const userMetadata =
		token.publicMetadata ??
		(token.public_metadata as ClerkIdentityWithClaims["publicMetadata"]);
	if (userMetadata?.has_premium_feature_access === true) {
		return true;
	}

	const orgMetadata =
		token.orgPublicMetadata ??
		(token.org_public_metadata as ClerkIdentityWithClaims["orgPublicMetadata"]);
	if (orgMetadata?.has_premium_feature_access === true) {
		return true;
	}

	const orgId = await getCurrentUserOrgIdOrNull(ctx);
	if (!orgId) {
		return false;
	}
	const org = await ctx.db.get(orgId);
	return orgHasPremiumPlan(org);
}

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
 * Normalize a Clerk/stored role to its bare key: lowercase, "org:" prefix
 * stripped. "org:admin" → "admin", "admin" → "admin", nullish → null.
 */
function normalizeRoleKey(role: string | null | undefined): string | null {
	if (!role) return null;
	const normalized = role.trim().toLowerCase();
	return normalized.startsWith("org:")
		? normalized.slice("org:".length)
		: normalized;
}

/**
 * True only for the org admin role. Exact match (not substring) so values like
 * "org:administrator" or "not-an-admin" are rejected; accepts both Clerk's
 * "org:admin" and the bare "admin" (tests/legacy rows). Nullish → false.
 */
export function isAdminRole(role: string | null | undefined): boolean {
	return normalizeRoleKey(role) === "admin";
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

	// Exact match on the normalized role key (not substring collisions).
	return normalizeRoleKey(role) === "member";
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

/**
 * Granular per-object permissions (PRD §4.1)
 */

import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
	DEFAULT_MEMBER_PERMISSIONS,
	PERMISSION_OBJECTS,
	isPermissionObject,
	levelAtLeast,
	type AccessLevel,
	type ObjectGrant,
	type PermissionGrants,
	type PermissionObject,
} from "./permissionKeys";
import { getMembership } from "./memberships";

export type EffectivePermissions = PermissionGrants | "all";
export type RequiredLevel = Exclude<AccessLevel, "none">;

/**
 * Shadow-mode switch. While unset/false, permission verdicts are computed and
 * would-denies logged (`[permissions-shadow]`), but nothing throws and no rows
 * are hidden. Read at call time so tests can toggle process.env.
 */
export function permissionsEnforced(): boolean {
	return process.env.PERMISSIONS_ENFORCE === "true";
}

/** Pure verdict on an already-resolved grant set. */
export function checkLevel(
	grants: EffectivePermissions,
	object: PermissionObject,
	level: RequiredLevel
): boolean {
	if (grants === "all") return true;
	const grant = grants[object];
	return !!grant && levelAtLeast(grant.level, level);
}

/** Pure verdict: does the grant set cover all records of `object`? */
export function checkAllRecords(
	grants: EffectivePermissions,
	object: PermissionObject
): boolean {
	if (grants === "all") return true;
	if (PERMISSION_OBJECTS[object].scope === null) return true; // unscoped = org-wide
	return grants[object]?.allRecords === true;
}

/**
 * Throw FORBIDDEN when enforcing; console.warn the would-deny in shadow mode.
 * `extra` lands in the ConvexError data and the log line.
 */
export function denyPermission(extra: {
	object: PermissionObject;
	level?: RequiredLevel;
	scope?: true;
	userId?: Id<"users">;
	orgId?: Id<"organizations">;
	detail?: string;
}): void {
	if (permissionsEnforced()) {
		const { userId: _u, orgId: _o, detail: _d, ...data } = extra;
		throw new ConvexError({ code: "FORBIDDEN", ...data });
	}
	console.warn(
		`[permissions-shadow] would deny ${extra.level ?? (extra.scope ? "record-scope" : "?")} on ${extra.object}` +
			(extra.userId ? ` user=${extra.userId}` : "") +
			(extra.orgId ? ` org=${extra.orgId}` : "") +
			(extra.detail ? ` (${extra.detail})` : "")
	);
}

/**
 * Effective grants for a known user+org (factories pass their resolved pair to
 * skip re-deriving identity). "all" = owner/admin short-circuit.
 */
export async function getEffectivePermissionsFor(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">,
	orgId: Id<"organizations">
): Promise<EffectivePermissions> {
	const org = await ctx.db.get(orgId);
	if (org?.ownerUserId === user._id) return "all"; // owner: immutable full access

	const membership = await getMembership(ctx, user._id, orgId);
	// Prefer the webhook-synced role column (fresh within seconds); the JWT
	// orgRole claim can lag ~60s and is only the fallback for legacy rows.
	const role = membership?.role ?? (await getCurrentUserRole(ctx));
	if (isAdminRole(role)) return "all";

	const stored = (membership?.permissions ?? {}) as PermissionGrants;
	// Stored entry replaces the default per object; {level:"none"} explicitly revokes.
	const effective: PermissionGrants = { ...DEFAULT_MEMBER_PERMISSIONS };
	for (const [obj, grant] of Object.entries(stored)) {
		if (isPermissionObject(obj)) effective[obj] = grant as ObjectGrant;
	}
	return effective;
}

/** Effective grants for the current caller. Secure-by-default: no identity/org ⇒ {}. */
export async function getEffectivePermissions(
	ctx: QueryCtx | MutationCtx
): Promise<EffectivePermissions> {
	const user = await getCurrentUser(ctx);
	const orgId = await getCurrentUserOrgIdOrNull(ctx);
	if (!user || !orgId) return {};
	return getEffectivePermissionsFor(ctx, user, orgId);
}

export async function can(
	ctx: QueryCtx | MutationCtx,
	object: PermissionObject,
	level: RequiredLevel
): Promise<boolean> {
	return checkLevel(await getEffectivePermissions(ctx), object, level);
}

export async function hasAllRecords(
	ctx: QueryCtx | MutationCtx,
	object: PermissionObject
): Promise<boolean> {
	return checkAllRecords(await getEffectivePermissions(ctx), object);
}

/** Shadow-aware level gate for non-factory call sites (assistant tools etc.). */
export async function requireLevel(
	ctx: QueryCtx | MutationCtx,
	object: PermissionObject,
	level: RequiredLevel
): Promise<void> {
	if (!(await can(ctx, object, level))) {
		denyPermission({ object, level });
	}
}
