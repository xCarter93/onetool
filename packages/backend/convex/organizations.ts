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
import { optionalUserQuery, userMutation, systemMutation } from "./lib/factories";
import { trackServerEvent, SERVER_EVENTS } from "./lib/posthog";

/**
 * Get the current user's organization
 */
export const get = optionalUserQuery({
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
export const needsMetadataCompletion = optionalUserQuery({
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
		hasPremiumFeatureAccess: v.optional(v.boolean()),
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
			hasPremiumFeatureAccess: args.hasPremiumFeatureAccess ?? false,
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
export const completeMetadata = userMutation({
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

		// Metadata can be re-saved from settings — only the first completion is
		// the onboarding event.
		if (!organization.isMetadataComplete) {
			await trackServerEvent(ctx, {
				event: SERVER_EVENTS.ONBOARDING_COMPLETED,
				orgId: userOrgId,
				actorUserId: user._id,
			});
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
		hasPremiumFeatureAccess: v.optional(v.boolean()),
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
		const updates: {
			name: string;
			logoUrl?: string;
			hasPremiumFeatureAccess?: boolean;
		} = {
			name: args.name,
		};

		// Only update logoUrl if provided (Clerk might not always include it)
		if (args.logoUrl !== undefined && args.logoUrl !== null) {
			updates.logoUrl = args.logoUrl;
		}

		// The webhook always resolves this to a concrete boolean, so a revoke lands
		// as false. Skipped only for legacy callers that omit it entirely.
		if (args.hasPremiumFeatureAccess !== undefined) {
			updates.hasPremiumFeatureAccess = args.hasPremiumFeatureAccess;
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

		// Org row + memberships deleted now; child data drains async via the
		// scheduled chunk worker (reconciliation cron backstops partial failures).
		await ctx.scheduler.runAfter(
			0,
			internal.orgCascade.cascadeDeleteOrgDataChunk,
			{ orgId: organization._id }
		);

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
export const update = userMutation({
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
export const regenerateReceivingAddress = userMutation({
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
			.slice(0, 8)}@inbound.onetool.biz`;

		await ctx.db.patch(userOrgId, {
			receivingAddress: newReceivingAddress,
		});

		return newReceivingAddress;
	},
});

/**
 * Return the caller's Connect context using only session-derived identity.
 */
export const getOrgForCallerInternal = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUserOrThrow(ctx);
		// Member-aware lookup keeps non-owner errors distinct from missing orgs.
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
 * Persist a Connect account id on the caller's org with owner and duplicate guards.
 */
export const setStripeConnectAccountIdInternal = userMutation({
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

		// Prevent one Stripe account from being mapped to multiple orgs.
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
export const getMembers = optionalUserQuery({
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
export const removeMember = userMutation({
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
 * Resolve a Stripe Connect account id to the owning org.
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
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
 * Refresh cached Connect onboarding status from a verified webhook.
 */
export const updateStripeConnectStatusInternal = systemMutation({
	args: {
		chargesEnabled: v.boolean(),
		payoutsEnabled: v.boolean(),
		detailsSubmitted: v.boolean(),
		requirementsCurrentlyDue: v.array(v.string()),
		requirementsDisabledReason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const org = await ctx.db.get(ctx.orgId);
		const wasChargesEnabled = org?.stripeChargesEnabled === true;
		await ctx.db.patch(ctx.orgId, {
			stripeChargesEnabled: args.chargesEnabled,
			stripePayoutsEnabled: args.payoutsEnabled,
			stripeDetailsSubmitted: args.detailsSubmitted,
			stripeRequirementsCurrentlyDue: args.requirementsCurrentlyDue,
			stripeRequirementsDisabledReason: args.requirementsDisabledReason,
			stripeStatusUpdatedAt: Date.now(),
		});
		// Fire once on the false->true charges_enabled edge (actor-less webhook).
		if (!wasChargesEnabled && args.chargesEnabled) {
			await trackServerEvent(ctx, {
				event: SERVER_EVENTS.STRIPE_CONNECTED,
				orgId: ctx.orgId,
				actorUserId: org?.ownerUserId,
			});
		}
		return null;
	},
});

/**
 * Self-heal cached Connect status + bank fingerprint from a live Stripe read.
 *
 * The cached fields gate the client portal (stripeChargesEnabled) and the
 * Payments-tab bank row (stripeExternalAccountLast4), but they are only ever
 * written by webhooks. Accounts onboarded before those handlers shipped never
 * received the events, so the fields stay empty forever. The owner-authenticated
 * /api/stripe-connect/status route now write-throughs here on every refresh.
 *
 * The stripeRequirements* fields are deliberately NOT written here. The webhook
 * path (updateStripeConnectStatusInternal) writes them as v1 machine codes; the
 * v2 status read this path is fed from only exposes human-readable descriptions
 * and has no single disabled_reason. Persisting that would put two formats in
 * one field depending on which path last wrote. Requirements stay webhook-owned.
 */
export const syncStripeConnectStatusFromLive = userMutation({
	args: {
		chargesEnabled: v.boolean(),
		payoutsEnabled: v.boolean(),
		detailsSubmitted: v.boolean(),
		bankLast4: v.optional(v.string()),
		bankName: v.optional(v.union(v.string(), v.null())),
		bankUpdatedAt: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const organization = await ctx.db.get(ctx.orgId);
		if (!organization) {
			throw new Error("Organization not found");
		}
		// Owner-only: mirrors the route guard, defense in depth.
		if (organization.ownerUserId !== ctx.user._id) {
			throw new Error("Only the organization owner can sync Stripe status");
		}

		const wasChargesEnabled = organization.stripeChargesEnabled === true;

		const patch: Record<string, unknown> = {
			stripeChargesEnabled: args.chargesEnabled,
			stripePayoutsEnabled: args.payoutsEnabled,
			stripeDetailsSubmitted: args.detailsSubmitted,
			stripeStatusUpdatedAt: Date.now(),
		};

		// Only touch bank fields when Stripe returned an external account, so a
		// transient external-account read miss never wipes a known bank.
		if (args.bankLast4) {
			patch.stripeExternalAccountLast4 = args.bankLast4;
			patch.stripeExternalAccountBankName = args.bankName ?? undefined;
			patch.stripeExternalAccountUpdatedAt = args.bankUpdatedAt ?? Date.now();
		}

		await ctx.db.patch(ctx.orgId, patch);
		// Fire once on the false->true charges_enabled edge (self-heal path).
		if (!wasChargesEnabled && args.chargesEnabled) {
			await trackServerEvent(ctx, {
				event: SERVER_EVENTS.STRIPE_CONNECTED,
				orgId: ctx.orgId,
				actorUserId: ctx.user._id,
			});
		}
		return null;
	},
});

/**
 * Delete organization (owner only) - careful operation!
 */
// TODO: Candidate for deletion if confirmed unused.
export const deleteOrganization = userMutation({
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

		// Org row + memberships deleted now; child data drains async via the
		// scheduled chunk worker (reconciliation cron backstops partial failures).
		await ctx.scheduler.runAfter(
			0,
			internal.orgCascade.cascadeDeleteOrgDataChunk,
			{ orgId: userOrgId }
		);

		return { success: true };
	},
});

/**
 * List orgs with Connect accounts for the read-only revalidation migration.
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
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

// Re-cache Connect capabilities and notify only on active -> inactive degradation.
export const updateStripeCapabilityInternal = systemMutation({
	args: {
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
		const org = await ctx.db.get(ctx.orgId);
		if (!org) return null;

		// Payout capability events still use the v1 "transfers" capability id.
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

		// Only patch requirement fields on degradation to avoid clobbering account.updated.
		const patch: Record<string, unknown> = {
			[fieldName]: newValue,
			stripeStatusUpdatedAt: Date.now(),
		};
		if (isDegradation) {
			patch.stripeRequirementsCurrentlyDue = args.requirementsCurrentlyDue;
			patch.stripeRequirementsDisabledReason = args.requirementsDisabledReason;
		}
		await ctx.db.patch(ctx.orgId, patch);

		// Notify only on active -> not-active transitions.
		if (isDegradation) {
			const label = isCharges ? "charges" : "payouts";
			await ctx.runMutation(
				internal.notifications.createWebhookNotificationInternal,
				{
					orgId: ctx.orgId,
					type: "capability_degraded",
					priority: "high",
					message: `Stripe ${label} have been disabled: ${args.requirementsDisabledReason ?? "reason unknown"}. Update onboarding to restore.`,
				}
			);
		}
		return null;
	},
});

// Persist bank-account fingerprint from external_account webhooks.
export const updateExternalAccountFingerprintInternal = systemMutation({
	args: {
		last4: v.string(),
		bankName: v.union(v.string(), v.null()),
		updatedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(ctx.orgId, {
			stripeExternalAccountLast4: args.last4,
			stripeExternalAccountBankName: args.bankName ?? undefined,
			stripeExternalAccountUpdatedAt: args.updatedAt,
		});
		return null;
	},
});

// Stays raw — preserves explicit UNAUTHORIZED/ORG_MISMATCH route contract.
export const clearStripeConnectStateInternal = mutation({
	args: { orgId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("UNAUTHORIZED");
		}
		const user = await getCurrentUserOrThrow(ctx);
		const userOrgId = await getCurrentUserOrgId(ctx);
		if (userOrgId !== args.orgId) {
			throw new Error("ORG_MISMATCH");
		}
		const organization = await ctx.db.get(userOrgId);
		if (!organization) {
			throw new Error("ORG_NOT_FOUND");
		}
		if (organization.ownerUserId !== user._id) {
			throw new Error("NOT_ORG_OWNER");
		}
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
