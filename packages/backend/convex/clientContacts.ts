import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { ValidationPatterns } from "./lib/shared";
import {
	getEntityWithOrgValidation,
	getEntityOrThrow,
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { computeFieldChanges } from "./lib/changeTracking";

/**
 * Client Contact operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like isPrimary handling) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get a client contact with org validation (wrapper for shared utility)
 */
async function getContactWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clientContacts">
): Promise<Doc<"clientContacts"> | null> {
	return await getEntityWithOrgValidation(
		ctx,
		"clientContacts",
		id,
		"Contact"
	);
}

/**
 * Get a client contact, throwing if not found (wrapper for shared utility)
 */
async function getContactOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clientContacts">
): Promise<Doc<"clientContacts">> {
	return await getEntityOrThrow(ctx, "clientContacts", id, "Client contact");
}

/**
 * Validate client access (wrapper for shared utility)
 */
async function validateClientAccess(
	ctx: QueryCtx | MutationCtx,
	clientId: Id<"clients">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	await validateParentAccess(ctx, "clients", clientId, "Client", existingOrgId);
}

/**
 * Handle primary contact uniqueness constraint.
 * Unsets existing primary contact before setting a new one.
 */
async function handlePrimaryContact(
	ctx: MutationCtx,
	clientId: Id<"clients">,
	currentContactId?: Id<"clientContacts">
): Promise<void> {
	const existingPrimary = await ctx.db
		.query("clientContacts")
		.withIndex("by_primary", (q) =>
			q.eq("clientId", clientId).eq("isPrimary", true)
		)
		.unique();

	if (existingPrimary && existingPrimary._id !== currentContactId) {
		await ctx.db.patch(existingPrimary._id, { isPrimary: false });
	}
}

/**
 * Create a client contact with automatic orgId assignment
 */
async function createContactWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"clientContacts">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"clientContacts">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate client access
	await validateClientAccess(ctx, data.clientId);

	return await ctx.db.insert("clientContacts", {
		...data,
		orgId: userOrgId,
	});
}

// Define specific types for client contact operations
type ClientContactDocument = Doc<"clientContacts">;
type ClientContactId = Id<"clientContacts">;

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all contacts for a specific client
 */
export const listByClient = query({
	args: { clientId: v.id("clients") },
	handler: async (ctx, args): Promise<ClientContactDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		await validateClientAccess(ctx, args.clientId, orgId);

		return await ctx.db
			.query("clientContacts")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();
	},
});

/**
 * Get all contacts for the current user's organization
 */
export const list = query({
	args: {},
	handler: async (ctx): Promise<ClientContactDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		return await ctx.db
			.query("clientContacts")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
	},
});

/**
 * Get a specific client contact by ID
 */
export const get = query({
	args: { id: v.id("clientContacts") },
	handler: async (ctx, args): Promise<ClientContactDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		return await getContactWithValidation(ctx, args.id);
	},
});

/**
 * Get primary contact for a client
 */
export const getPrimaryContact = query({
	args: { clientId: v.id("clients") },
	handler: async (ctx, args): Promise<ClientContactDocument | null> => {
		const userOrgId = await getCurrentUserOrgId(ctx, { require: false });
		if (!userOrgId) {
			return null;
		}
		await validateClientAccess(ctx, args.clientId, userOrgId);

		return await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", args.clientId).eq("isPrimary", true)
			)
			.unique();
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new client contact
 */
export const create = mutation({
	args: {
		clientId: v.id("clients"),
		firstName: v.string(),
		lastName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		jobTitle: v.optional(v.string()),
		isPrimary: v.boolean(),
	},
	handler: async (ctx, args): Promise<ClientContactId> => {
		// Validate email format if provided
		if (args.email && !ValidationPatterns.isValidEmail(args.email)) {
			throw new Error("Invalid email format");
		}

		// Validate phone format if provided
		if (args.phone && !ValidationPatterns.isValidPhone(args.phone)) {
			throw new Error("Invalid phone format");
		}

		// Handle primary contact uniqueness
		if (args.isPrimary) {
			await handlePrimaryContact(ctx, args.clientId);
		}

		const contactId = await createContactWithOrg(ctx, args);

		// Log activity on the client
		const client = await ctx.db.get(args.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return contactId;
	},
});

/**
 * Update a client contact
 */
export const update = mutation({
	args: {
		id: v.id("clientContacts"),
		clientId: v.optional(v.id("clients")),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		jobTitle: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<ClientContactId> => {
		const { id, ...updates } = args;

		// Validate email format if provided
		if (updates.email && !ValidationPatterns.isValidEmail(updates.email)) {
			throw new Error("Invalid email format");
		}

		// Validate phone format if provided
		if (updates.phone && !ValidationPatterns.isValidPhone(updates.phone)) {
			throw new Error("Invalid phone format");
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Get current contact and determine clientId
		const currentContact = await getContactOrThrow(ctx, id);
		const clientId = filteredUpdates.clientId || currentContact.clientId;

		// Validate new clientId if changing
		if (filteredUpdates.clientId) {
			await validateClientAccess(ctx, filteredUpdates.clientId);
		}

		// Handle primary contact uniqueness
		if (filteredUpdates.isPrimary === true) {
			await handlePrimaryContact(ctx, clientId, id);
		}

		// Compute field-level changes before applying the update
		const changes = computeFieldChanges(
			"clientContact",
			currentContact as unknown as Record<string, unknown>,
			filteredUpdates as Record<string, unknown>
		);

		await ctx.db.patch(id, filteredUpdates);

		// Log activity on the client
		const client = await ctx.db.get(clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client, changes);
		}

		return id;
	},
});

/**
 * Delete a client contact
 */
export const remove = mutation({
	args: { id: v.id("clientContacts") },
	handler: async (ctx, args): Promise<ClientContactId> => {
		const contact = await getContactOrThrow(ctx, args.id);

		// Delete the contact
		await ctx.db.delete(args.id);

		// Log activity on the client
		const client = await ctx.db.get(contact.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return args.id;
	},
});

/**
 * Search contacts across the organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const search = query({
	args: {
		query: v.string(),
		clientId: v.optional(v.id("clients")),
	},
	handler: async (ctx, args): Promise<ClientContactDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx, { require: false });
		if (!userOrgId) {
			return [];
		}

		let contacts: ClientContactDocument[];

		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, userOrgId);
			contacts = await ctx.db
				.query("clientContacts")
				.withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
				.collect();
		} else {
			contacts = await ctx.db
				.query("clientContacts")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect();
		}

		// Search in first name, last name, email, and job title
		const searchQuery = args.query.toLowerCase();
		return contacts.filter(
			(contact: ClientContactDocument) =>
				contact.firstName.toLowerCase().includes(searchQuery) ||
				contact.lastName.toLowerCase().includes(searchQuery) ||
				(contact.email && contact.email.toLowerCase().includes(searchQuery)) ||
				(contact.jobTitle &&
					contact.jobTitle.toLowerCase().includes(searchQuery))
		);
	},
});

/**
 * Bulk create contacts for a client
 */
// TODO: Candidate for deletion if confirmed unused.
export const bulkCreate = mutation({
	args: {
		clientId: v.id("clients"),
		contacts: v.array(
			v.object({
				firstName: v.string(),
				lastName: v.string(),
				email: v.optional(v.string()),
				phone: v.optional(v.string()),
				jobTitle: v.optional(v.string()),
				isPrimary: v.boolean(),
			})
		),
	},
	handler: async (ctx, args): Promise<ClientContactId[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate client access
		await validateClientAccess(ctx, args.clientId);

		const contactIds: ClientContactId[] = [];
		let hasPrimary = false;

		// Check if any contact is marked as primary
		for (const contact of args.contacts) {
			if (contact.isPrimary) {
				if (hasPrimary) {
					throw new Error("Only one contact can be marked as primary");
				}
				hasPrimary = true;
			}
		}

		// If setting a primary contact, unset existing primary
		if (hasPrimary) {
			const existingPrimary = await ctx.db
				.query("clientContacts")
				.withIndex("by_primary", (q) =>
					q.eq("clientId", args.clientId).eq("isPrimary", true)
				)
				.unique();

			if (existingPrimary) {
				await ctx.db.patch(existingPrimary._id, { isPrimary: false });
			}
		}

		// Create all contacts
		for (const contactData of args.contacts) {
			// Validate email format if provided
			if (
				contactData.email &&
				!ValidationPatterns.isValidEmail(contactData.email)
			) {
				throw new Error("Invalid email format");
			}

			// Validate phone format if provided
			if (
				contactData.phone &&
				!ValidationPatterns.isValidPhone(contactData.phone)
			) {
				throw new Error("Invalid phone format");
			}

			const contactId = await ctx.db.insert("clientContacts", {
				...contactData,
				clientId: args.clientId,
				orgId: userOrgId,
			});

			contactIds.push(contactId);
		}

		// Log activity on the client
		const client = await ctx.db.get(args.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return contactIds;
	},
});

/**
 * Set a contact as primary (and unset others)
 */
// TODO: Candidate for deletion if confirmed unused.
export const setPrimary = mutation({
	args: { id: v.id("clientContacts") },
	handler: async (ctx, args): Promise<ClientContactId> => {
		const contact = await getContactOrThrow(ctx, args.id);

		// Unset any existing primary contact for this client
		const existingPrimary = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", contact.clientId).eq("isPrimary", true)
			)
			.unique();

		if (existingPrimary && existingPrimary._id !== args.id) {
			await ctx.db.patch(existingPrimary._id, { isPrimary: false });
		}

		// Set this contact as primary
		await ctx.db.patch(args.id, { isPrimary: true });

		// Log activity on the client
		const client = await ctx.db.get(contact.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return args.id;
	},
});
