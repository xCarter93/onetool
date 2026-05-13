import {
	query,
	mutation,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	getCurrentUserOrThrow,
	getCurrentUser,
	getCurrentUserOrgId,
} from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import {
	ensureMembership,
	listMembershipsByOrg,
	removeMembership,
	requireMembership,
} from "./lib/memberships";

/**
 * Get the current user's organization
 */
export const get = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return null;
		}

		try {
			const userOrgId = await getCurrentUserOrgId(ctx);
			return await ctx.db.get(userOrgId);
		} catch {
			// User might not have an active organization
			return null;
		}
	},
});

/**
 * Check if the current user needs to complete organization metadata
 */
export const needsMetadataCompletion = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return false;
		}

		try {
			const userOrgId = await getCurrentUserOrgId(ctx);
			const organization = await ctx.db.get(userOrgId);
			if (!organization) {
				return false;
			}

			// Return true if metadata is not complete and user is the owner
			return (
				!organization.isMetadataComplete &&
				organization.ownerUserId === user._id
			);
		} catch {
			// User might not have an active organization
			return false;
		}
	},
});

/**
 * Create organization metadata from Clerk webhook
 * This is called when Clerk creates an organization
 */
export const createFromClerk = internalMutation({
	args: {
		clerkOrganizationId: v.string(),
		name: v.string(),
		ownerClerkUserId: v.string(),
		logoUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Find the owner user by Clerk ID
		const ownerUser = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) =>
				q.eq("externalId", args.ownerClerkUserId)
			)
			.first();

		if (!ownerUser) {
			console.warn(
				`Owner user not found for organization creation. User ID: ${args.ownerClerkUserId}. This might be a timing issue with webhooks.`
			);
			throw new Error(`Owner user not found: ${args.ownerClerkUserId}`);
		}

		// Check if organization already exists
		const existingOrg = await ctx.db
			.query("organizations")
			.withIndex("by_clerk_org", (q) =>
				q.eq("clerkOrganizationId", args.clerkOrganizationId)
			)
			.first();

		if (existingOrg) {
			return existingOrg._id;
		}

		// Create minimal organization metadata (just sync from Clerk)
		// Full setup will happen when user completes onboarding
		const orgId = await ctx.db.insert("organizations", {
			clerkOrganizationId: args.clerkOrganizationId,
			name: args.name,
			ownerUserId: ownerUser._id,
			logoUrl: args.logoUrl,
			isMetadataComplete: false, // User needs to complete additional setup
			// Generate unique receiving address for this organization
			receivingAddress: `org-${crypto
				.randomUUID()
				.slice(0, 8)}@inbound.onetool.biz`,
			// Initialize usage tracking
			usageTracking: {
				clientsCount: 0,
				esignaturesSentThisMonth: 0,
				lastEsignatureReset: Date.now(),
			},
		});

		await ensureMembership(ctx, ownerUser._id, orgId, "owner");

		console.log(
			`Created minimal organization record for Clerk org: ${args.clerkOrganizationId}`
		);

		// NOTE: We don't create activities here because webhooks don't have user auth context
		// Activities will be created when the user completes the onboarding flow

		return orgId;
	},
});

/**
 * Complete organization metadata after Clerk creation
 * This replaces the original create function for the new flow
 */
export const completeMetadata = mutation({
	args: {
		email: v.optional(v.string()),
		website: v.optional(v.string()),
		address: v.optional(v.string()), // DEPRECATED: Use structured address fields
		phone: v.optional(v.string()),
		companySize: v.optional(
			v.union(v.literal("1-10"), v.literal("10-100"), v.literal("100+"))
		),
		monthlyRevenueTarget: v.optional(v.number()),
		logoUrl: v.optional(v.string()),
		logoInvertInDarkMode: v.optional(v.boolean()),
		// Structured address fields (replaces legacy `address` string)
		addressStreet: v.optional(v.string()),
		addressCity: v.optional(v.string()),
		addressState: v.optional(v.string()),
		addressZip: v.optional(v.string()),
		addressCountry: v.optional(v.string()),
		// Geocoding fields (from Mapbox Address Autofill)
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Only organization owner can complete metadata
		if (organization.ownerUserId !== user._id) {
			throw new Error("Only organization owner can complete metadata");
		}

		// Build legacy address string from structured fields for backward compatibility
		const legacyAddress = args.addressStreet
			? [args.addressStreet, args.addressCity, args.addressState, args.addressZip]
					.filter(Boolean)
					.join(", ")
			: args.address;

		// Update the organization with metadata
		await ctx.db.patch(userOrgId, {
			email: args.email,
			website: args.website,
			address: legacyAddress,
			phone: args.phone,
			companySize: args.companySize,
			monthlyRevenueTarget: args.monthlyRevenueTarget,
			logoUrl: args.logoUrl,
			logoInvertInDarkMode:
				args.logoInvertInDarkMode ?? organization.logoInvertInDarkMode ?? true,
			isMetadataComplete: true,
			// Structured address fields
			addressStreet: args.addressStreet,
			addressCity: args.addressCity,
			addressState: args.addressState,
			addressZip: args.addressZip,
			addressCountry: args.addressCountry,
			// Geocoding
			latitude: args.latitude,
			longitude: args.longitude,
		});

		// Log activity
		const updatedOrganization = await ctx.db.get(userOrgId);
		if (updatedOrganization) {
			await ActivityHelpers.organizationUpdated(ctx, updatedOrganization);
		}

		return userOrgId;
	},
});

/**
 * Update organization from Clerk webhook
 */
export const updateFromClerk = internalMutation({
	args: {
		clerkOrganizationId: v.string(),
		name: v.string(),
		logoUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_clerk_org", (q) =>
				q.eq("clerkOrganizationId", args.clerkOrganizationId)
			)
			.first();

		if (!organization) {
			console.error(
				`Organization not found for Clerk ID: ${args.clerkOrganizationId}`
			);
			return;
		}

		// Update the organization name and logo URL
		const updates: { name: string; logoUrl?: string } = {
			name: args.name,
		};

		// Only update logoUrl if provided (Clerk might not always include it)
		if (args.logoUrl !== undefined && args.logoUrl !== null) {
			updates.logoUrl = args.logoUrl;
		}

		await ctx.db.patch(organization._id, updates);

		console.log(
			`Updated organization name for Clerk org: ${args.clerkOrganizationId}`
		);

		// NOTE: We don't create activities here because webhooks don't have user auth context
		// Activities for name changes will be logged when users interact with the organization directly

		return organization._id;
	},
});

/**
 * Handle organization deletion from Clerk webhook
 */
export const deleteFromClerk = internalMutation({
	args: {
		clerkOrganizationId: v.string(),
	},
	handler: async (ctx, args) => {
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_clerk_org", (q) =>
				q.eq("clerkOrganizationId", args.clerkOrganizationId)
			)
			.first();

		if (!organization) {
			console.warn(
				`Organization not found for Clerk ID: ${args.clerkOrganizationId}`
			);
			return;
		}

		// Remove all memberships for the organization
		const memberships = await listMembershipsByOrg(ctx, organization._id);
		for (const membership of memberships) {
			await ctx.db.delete(membership._id);
		}

		// Delete the organization
		await ctx.db.delete(organization._id);

		console.log(
			`Successfully deleted organization: ${args.clerkOrganizationId}`
		);
		return { success: true };
	},
});

/**
 * Retry pending organization creation when user becomes available
 * This helps handle webhook timing issues
 */
export const retryPendingOrganizationCreation = internalMutation({
	args: {
		ownerClerkUserId: v.string(),
	},
	handler: async (_ctx, args) => {
		// This is a placeholder for now - in a production system, you might want to
		// store pending organization creation requests and retry them here
		console.log(
			`Checking for pending organization creation for user: ${args.ownerClerkUserId}`
		);

		// For now, just log that the user is available for organization creation
		// In the future, you could implement a pending_organizations table to track these
		return { success: true };
	},
});

/**
 * Update the current user's organization
 */
export const update = mutation({
	args: {
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		website: v.optional(v.string()),
		logoUrl: v.optional(v.string()),
		logoInvertInDarkMode: v.optional(v.boolean()),
		logoStorageId: v.optional(v.id("_storage")),
		address: v.optional(v.string()), // DEPRECATED: Use structured address fields
		phone: v.optional(v.string()),
		companySize: v.optional(
			v.union(v.literal("1-10"), v.literal("10-100"), v.literal("100+"))
		),
		monthlyRevenueTarget: v.optional(v.number()),
		timezone: v.optional(v.string()), // IANA timezone (e.g., "America/New_York")
		// Structured address fields (replaces legacy `address` string)
		addressStreet: v.optional(v.string()),
		addressCity: v.optional(v.string()),
		addressState: v.optional(v.string()),
		addressZip: v.optional(v.string()),
		addressCountry: v.optional(v.string()),
		// Geocoding fields (from Mapbox Address Autofill)
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Get the organization to ensure it exists and user is owner
		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Only organization owner can update organization details
		if (organization.ownerUserId !== user._id) {
			throw new Error(
				"Only organization owner can update organization details"
			);
		}

		// Build legacy address string from structured fields for backward compatibility
		const legacyAddress = args.addressStreet
			? [args.addressStreet, args.addressCity, args.addressState, args.addressZip]
					.filter(Boolean)
					.join(", ")
			: args.address;

		// Filter out undefined values, but always use computed legacyAddress if structured fields provided
		const updates = Object.fromEntries(
			Object.entries({
				...args,
				address: legacyAddress,
			}).filter(([, value]) => value !== undefined)
		);

		if (Object.keys(updates).length === 0) {
			throw new Error("No valid updates provided");
		}

		// Update the organization
		await ctx.db.patch(userOrgId, updates);

		// Log activity
		const updatedOrganization = await ctx.db.get(userOrgId);
		if (updatedOrganization) {
			await ActivityHelpers.organizationUpdated(ctx, updatedOrganization);
		}

		return userOrgId;
	},
});

/**
 * Regenerate the receiving email address for the organization
 * Only organization owner can perform this action
 */
export const regenerateReceivingAddress = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Only organization owner can regenerate receiving address
		if (organization.ownerUserId !== user._id) {
			throw new Error(
				"Only organization owner can regenerate receiving address"
			);
		}

		// Generate new receiving address
		const newReceivingAddress = `org-${crypto
			.randomUUID()
			.slice(0, 8)}@onetool.biz`;

		await ctx.db.patch(userOrgId, {
			receivingAddress: newReceivingAddress,
		});

		return newReceivingAddress;
	},
});

/**
 * Plan 14.2-02 — Connect cross-tenant lockdown.
 *
 * Returns the locked-down ConnectContext for the current caller. Used by
 * `apps/web/src/lib/stripeConnect.ts#getOrgConnectAccountForCaller()` to
 * derive every Stripe Connect identifier server-side — no client-supplied
 * accountId, country, email, or currency is ever read.
 *
 * Pivot note (Plan 14.2-02 Preflight / FINDINGS V-1): declared as a PUBLIC
 * `query` rather than `internalQuery` because Next.js `convex/nextjs`
 * helpers only call public function references. Auth is performed inside
 * the handler — clerkUserId and orgId are derived from the Clerk session,
 * never from client args. Safety properties are equivalent to an internal
 * query because no client input influences the lookup.
 *
 * Throws:
 *   - "User not authenticated" / "No active organization" — surfaces as
 *     ORG_NOT_FOUND in `getOrgConnectAccountForCaller` (which maps to 401).
 *   - "NOT_ORG_OWNER" — caller is a member but not the org owner (M-5).
 */
export const getOrgForCallerInternal = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrThrow(ctx);
		// Member-aware lookup (mirrors lib/auth.ts) — surfaces NOT_ORG_OWNER
		// rather than ORG_NOT_FOUND for non-owner members per FINDINGS M-5.
		const userOrgId = await getCurrentUserOrgId(ctx);
		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("ORG_NOT_FOUND");
		}
		if (organization.ownerUserId !== user._id) {
			throw new Error("NOT_ORG_OWNER");
		}
		return {
			userId: user._id,
			orgId: organization._id,
			stripeConnectAccountId: organization.stripeConnectAccountId ?? null,
			organization: {
				_id: organization._id,
				name: organization.name,
				email: organization.email,
				addressCountry: organization.addressCountry,
				stripeConnectAccountId: organization.stripeConnectAccountId,
				ownerUserId: organization.ownerUserId,
			},
		};
	},
});

/**
 * Plan 14.2-02 — replaces the prior PUBLIC `setStripeConnectAccountId` (now
 * deleted). The handler derives `orgId` from the Clerk session (NOT from
 * args) and enforces owner-only access plus the FINDINGS M-2 duplicate-
 * account guard before patching.
 *
 * Pivot note (Plan 14.2-02 Preflight / FINDINGS V-1): declared as a PUBLIC
 * `mutation` rather than `internalMutation` because Next.js calls public
 * function references via `convex/nextjs`. The `Internal` suffix preserves
 * the Plan 02 export-name contract; the security properties match an
 * internal mutation because the client cannot influence which org gets
 * patched.
 *
 * Throws:
 *   - "NOT_ORG_OWNER" when caller is not the org owner.
 *   - "DUPLICATE_CONNECT_ACCOUNT" when accountId already maps to another
 *     org (FINDINGS M-2 — prevents webhook mis-routing).
 */
export const setStripeConnectAccountIdInternal = mutation({
	args: { accountId: v.string() },
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);
		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("ORG_NOT_FOUND");
		}
		if (organization.ownerUserId !== user._id) {
			throw new Error("NOT_ORG_OWNER");
		}

		// FINDINGS M-2 — duplicate-account guard.
		const existing = await ctx.db
			.query("organizations")
			.withIndex("by_stripe_connect_account_id", (q) =>
				q.eq("stripeConnectAccountId", args.accountId)
			)
			.first();
		if (existing && existing._id !== userOrgId) {
			throw new Error(
				`DUPLICATE_CONNECT_ACCOUNT: account ${args.accountId} already mapped to org ${existing._id}`
			);
		}

		await ctx.db.patch(userOrgId, {
			stripeConnectAccountId: args.accountId,
		});
		return null;
	},
});

/**
 * Update organization plan (DEPRECATED - now handled by Clerk billing webhooks)
 * This mutation is kept for backwards compatibility but should not be used
 */

/**
 * Get organization members (users in the organization)
 */
// TODO: Candidate for deletion if confirmed unused.
export const getMembers = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return [];
		}

		try {
			const userOrgId = await getCurrentUserOrgId(ctx);
			const memberships = await listMembershipsByOrg(ctx, userOrgId);
			const users = [];
			for (const membership of memberships) {
				const member = await ctx.db.get(membership.userId);
				if (member) {
					users.push(member);
				}
			}
			return users;
		} catch {
			// User might not have an active organization
			return [];
		}
	},
});

/**
 * Remove user from organization (owner only)
 */
// TODO: Candidate for deletion if confirmed unused.
export const removeMember = mutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const currentUser = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		const organization = await ctx.db.get(orgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Only organization owner can remove members
		if (organization.ownerUserId !== currentUser._id) {
			throw new Error("Only organization owner can remove members");
		}

		// Cannot remove the owner
		if (args.userId === currentUser._id) {
			throw new Error("Organization owner cannot be removed");
		}

		const userToRemove = await ctx.db.get(args.userId);
		if (!userToRemove) {
			throw new Error("User not found");
		}
		if (userToRemove._id === organization.ownerUserId) {
			throw new Error("Cannot remove the organization owner");
		}

		await requireMembership(ctx, args.userId, orgId);
		await removeMembership(ctx, args.userId, orgId);

		return args.userId;
	},
});

/**
 * Plan 14.2-03 — webhook-side org lookup by Stripe Connect account id.
 *
 * Resolves `event.account` (and the L-3 fallback `data.object.id`) to the
 * org row that owns the connected account. Called from
 * `stripeWebhookActions.handleEvent` after Stripe signature verification.
 */
export const getByStripeConnectAccountIdInternal = internalQuery({
	args: { accountId: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id("organizations"),
			stripeConnectAccountId: v.optional(v.string()),
		})
	),
	handler: async (ctx, args) => {
		const org = await ctx.db
			.query("organizations")
			.withIndex("by_stripe_connect_account_id", (q) =>
				q.eq("stripeConnectAccountId", args.accountId)
			)
			.first();
		if (!org) return null;
		return {
			_id: org._id,
			stripeConnectAccountId: org.stripeConnectAccountId,
		};
	},
});

/**
 * Plan 14.2-03 — refresh the cached Connect onboarding status from an
 * `account.updated` webhook. Pure write — auth happens at the route layer
 * via Stripe signature verification before this mutation runs.
 */
export const updateStripeConnectStatusInternal = internalMutation({
	args: {
		orgId: v.id("organizations"),
		chargesEnabled: v.boolean(),
		payoutsEnabled: v.boolean(),
		detailsSubmitted: v.boolean(),
		requirementsCurrentlyDue: v.array(v.string()),
		requirementsDisabledReason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.orgId, {
			stripeChargesEnabled: args.chargesEnabled,
			stripePayoutsEnabled: args.payoutsEnabled,
			stripeDetailsSubmitted: args.detailsSubmitted,
			stripeRequirementsCurrentlyDue: args.requirementsCurrentlyDue,
			stripeRequirementsDisabledReason: args.requirementsDisabledReason,
			stripeStatusUpdatedAt: Date.now(),
		});
		return null;
	},
});

/**
 * Delete organization (owner only) - careful operation!
 */
// TODO: Candidate for deletion if confirmed unused.
export const deleteOrganization = mutation({
	args: {
		confirmationText: v.string(), // Require typing organization name for confirmation
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);

		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Only organization owner can delete
		if (organization.ownerUserId !== user._id) {
			throw new Error("Only organization owner can delete organization");
		}

		// Require exact organization name for confirmation
		if (args.confirmationText !== organization.name) {
			throw new Error("Confirmation text must match organization name exactly");
		}

		// Remove all memberships for the organization
		const memberships = await listMembershipsByOrg(ctx, userOrgId);
		for (const membership of memberships) {
			await ctx.db.delete(membership._id);
		}

		// Delete the organization
		await ctx.db.delete(userOrgId);

		return { success: true };
	},
});

/**
 * Plan 14.2-05 — list every organization with a non-null
 * `stripeConnectAccountId`. Used by the read-only revalidation migration
 * (`migrations/revalidateStripeConnectAccounts:run`) so the operator can
 * cross-check org-side state against Stripe-side state after Wave 3 deploys.
 * Full table scan is acceptable for a one-time manual run.
 */
export const listAllWithConnectAccountInternal = internalQuery({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("organizations"),
			name: v.string(),
			email: v.optional(v.string()),
			stripeConnectAccountId: v.optional(v.string()),
		})
	),
	handler: async (ctx) => {
		const all = await ctx.db.query("organizations").collect();
		return all
			.filter((o) => o.stripeConnectAccountId)
			.map((o) => ({
				_id: o._id,
				name: o.name,
				email: o.email,
				stripeConnectAccountId: o.stripeConnectAccountId,
			}));
	},
});

// Plan 14.2.1-02 (CONTEXT.md "capability.updated") — re-cache Connect
// capability flags on the org row, emit notification ONLY on active → not-active
// degradation. Requirement-field updates (currently_due, disabled_reason) also
// gated to the degradation branch so account.updated stays canonical.
// Workflow-automation parity via the event bus is DEFERRED (Option A from
// REVIEWS.md) — would require domainEvents.payload.entityType union extension
// + downstream consumer updates beyond this phase's scope.
export const updateStripeCapabilityInternal = internalMutation({
	args: {
		orgId: v.id("organizations"),
		capabilityId: v.string(),
		status: v.union(
			v.literal("active"),
			v.literal("inactive"),
			v.literal("pending"),
			v.literal("unrequested")
		),
		requirementsCurrentlyDue: v.array(v.string()),
		requirementsDisabledReason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return null;

		// RESEARCH Pitfall 3 — v1 capability id for the payouts side is
		// "transfers" even on v2-created accounts. Match the v1 name; log + skip
		// anything else.
		const isCharges = args.capabilityId === "card_payments";
		const isPayouts = args.capabilityId === "transfers";
		if (!isCharges && !isPayouts) {
			console.log(
				`capability.updated: unhandled capability ${args.capabilityId}`
			);
			return null;
		}

		const fieldName = isCharges
			? ("stripeChargesEnabled" as const)
			: ("stripePayoutsEnabled" as const);
		const priorValue = org[fieldName];
		const newValue = args.status === "active";
		const isDegradation = priorValue === true && newValue === false;

		// Always patch the boolean cache + status timestamp. Only patch
		// requirement fields on degradation to avoid clobbering the fuller
		// account.updated snapshot when capability events interleave.
		const patch: Record<string, unknown> = {
			[fieldName]: newValue,
			stripeStatusUpdatedAt: Date.now(),
		};
		if (isDegradation) {
			patch.stripeRequirementsCurrentlyDue = args.requirementsCurrentlyDue;
			patch.stripeRequirementsDisabledReason = args.requirementsDisabledReason;
		}
		await ctx.db.patch(args.orgId, patch);

		// Degradation gate: emit notification ONLY when transitioning
		// active → not-active. No event-bus emit (Option A deferral).
		if (isDegradation) {
			const label = isCharges ? "charges" : "payouts";
			await ctx.runMutation(
				internal.notifications.createWebhookNotificationInternal,
				{
					orgId: args.orgId,
					type: "capability_degraded",
					priority: "high",
					message: `Stripe ${label} have been disabled: ${args.requirementsDisabledReason ?? "reason unknown"}. Update onboarding to restore.`,
				}
			);
		}
		return null;
	},
});

// Plan 14.2.1-02 (CONTEXT.md "account.external_account.*") — persist
// bank-account fingerprint (last4 + bankName) on org row. Idempotent
// overwrite — same call shape for both created and updated events.
export const updateExternalAccountFingerprintInternal = internalMutation({
	args: {
		orgId: v.id("organizations"),
		last4: v.string(),
		bankName: v.union(v.string(), v.null()),
		updatedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.orgId, {
			stripeExternalAccountLast4: args.last4,
			stripeExternalAccountBankName: args.bankName ?? undefined,
			stripeExternalAccountUpdatedAt: args.updatedAt,
		});
		return null;
	},
});

// Plan 14.2.1-03 (REVIEWS.md HIGH — pre-cutover cleanup primitive). Nulls
// every Stripe-Connect state field on the org row. Called by the operator
// BEFORE deploying 14.2.1 for every test org whose Stripe-side test account
// they're about to delete in the Dashboard. Without this, the v1 acct ID
// remains in Convex, the retrieve branch of /api/stripe-connect/account
// 404s on the deleted Stripe account, and onboarding is stranded.
// Also called defensively from the route's 404 fallback as belt-and-suspenders.
export const clearStripeConnectStateInternal = internalMutation({
	args: { orgId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.orgId, {
			stripeConnectAccountId: undefined,
			stripeChargesEnabled: undefined,
			stripePayoutsEnabled: undefined,
			stripeDetailsSubmitted: undefined,
			stripeRequirementsCurrentlyDue: undefined,
			stripeRequirementsDisabledReason: undefined,
			stripeStatusUpdatedAt: undefined,
			stripeExternalAccountLast4: undefined,
			stripeExternalAccountBankName: undefined,
			stripeExternalAccountUpdatedAt: undefined,
		});
		return null;
	},
});
