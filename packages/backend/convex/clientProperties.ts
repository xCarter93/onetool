import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
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
 * Client Property operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like isPrimary handling) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get a client property with org validation (wrapper for shared utility)
 */
async function getPropertyWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clientProperties">
): Promise<Doc<"clientProperties"> | null> {
	return await getEntityWithOrgValidation(
		ctx,
		"clientProperties",
		id,
		"Property"
	);
}

/**
 * Get a client property, throwing if not found (wrapper for shared utility)
 */
async function getPropertyOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clientProperties">
): Promise<Doc<"clientProperties">> {
	return await getEntityOrThrow(ctx, "clientProperties", id, "Client property");
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
 * Handle primary property uniqueness constraint.
 * Unsets existing primary property before setting a new one.
 */
async function handlePrimaryProperty(
	ctx: MutationCtx,
	clientId: Id<"clients">,
	currentPropertyId?: Id<"clientProperties">
): Promise<void> {
	const existingPrimary = await ctx.db
		.query("clientProperties")
		.withIndex("by_primary", (q) =>
			q.eq("clientId", clientId).eq("isPrimary", true)
		)
		.unique();

	if (existingPrimary && existingPrimary._id !== currentPropertyId) {
		await ctx.db.patch(existingPrimary._id, { isPrimary: false });
	}
}

/**
 * Create a client property with automatic orgId assignment
 */
async function createPropertyWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"clientProperties">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"clientProperties">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate client access
	await validateClientAccess(ctx, data.clientId);

	return await ctx.db.insert("clientProperties", {
		...data,
		orgId: userOrgId,
	});
}

// Define specific types for client property operations
type ClientPropertyDocument = Doc<"clientProperties">;
type ClientPropertyId = Id<"clientProperties">;

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all properties for a specific client
 */
export const listByClient = query({
	args: { clientId: v.id("clients") },
	handler: async (ctx, args): Promise<ClientPropertyDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		await validateClientAccess(ctx, args.clientId, orgId);

		return await ctx.db
			.query("clientProperties")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();
	},
});

/**
 * Get all properties for the current user's organization
 */
export const list = query({
	args: {},
	handler: async (ctx): Promise<ClientPropertyDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		return await ctx.db
			.query("clientProperties")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
	},
});

/**
 * Get all geocoded properties for the organization with client info (for map display)
 */
export const listGeocodedWithClients = query({
	args: {},
	handler: async (ctx) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return { properties: [], totalCount: 0, geocodedCount: 0 };

		const allProperties = await ctx.db
			.query("clientProperties")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const totalCount = allProperties.length;

		// Filter to only geocoded properties
		const geocodedProperties = allProperties.filter(
			(p) => p.latitude !== undefined && p.longitude !== undefined
		);

		// Get unique client IDs
		const clientIds = [...new Set(geocodedProperties.map((p) => p.clientId))];

		// Fetch all clients in parallel
		const clients = await Promise.all(
			clientIds.map((id) => ctx.db.get(id))
		);

		// Create a map for quick lookup
		const clientMap = new Map(
			clients
				.filter((c): c is NonNullable<typeof c> => c !== null)
				.map((c) => [c._id, c])
		);

		// Enrich properties with client info
		const properties = geocodedProperties.map((p) => {
			const client = clientMap.get(p.clientId);
			return {
				_id: p._id,
				clientId: p.clientId,
				clientCompanyName: client?.companyName ?? "Unknown Client",
				propertyName: p.propertyName,
				streetAddress: p.streetAddress,
				city: p.city,
				state: p.state,
				zipCode: p.zipCode,
				formattedAddress: p.formattedAddress,
				latitude: p.latitude!,
				longitude: p.longitude!,
			};
		});

		return {
			properties,
			totalCount,
			geocodedCount: geocodedProperties.length,
		};
	},
});

/**
 * Get a specific client property by ID
 */
// TODO: Candidate for deletion if confirmed unused.
export const get = query({
	args: { id: v.id("clientProperties") },
	handler: async (ctx, args): Promise<ClientPropertyDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		return await getPropertyWithValidation(ctx, args.id);
	},
});

/**
 * Get primary property for a client
 */
// TODO: Candidate for deletion if confirmed unused.
export const getPrimaryProperty = query({
	args: { clientId: v.id("clients") },
	handler: async (ctx, args): Promise<ClientPropertyDocument | null> => {
		const userOrgId = await getCurrentUserOrgId(ctx, { require: false });
		if (!userOrgId) {
			return null;
		}
		await validateClientAccess(ctx, args.clientId, userOrgId);

		return await ctx.db
			.query("clientProperties")
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
 * Create a new client property
 */
export const create = mutation({
	args: {
		clientId: v.id("clients"),
		propertyName: v.optional(v.string()),
		propertyType: v.optional(
			v.union(
				v.literal("residential"),
				v.literal("commercial"),
				v.literal("industrial"),
				v.literal("retail"),
				v.literal("office"),
				v.literal("mixed-use")
			)
		),
		streetAddress: v.string(),
		city: v.string(),
		state: v.string(),
		zipCode: v.string(),
		country: v.optional(v.string()),
		isPrimary: v.boolean(),
		// Geocoding fields (from Mapbox Address Autofill)
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
		formattedAddress: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<ClientPropertyId> => {
		// Validate required address fields are not empty
		if (!args.streetAddress.trim()) {
			throw new Error("Street address is required");
		}
		if (!args.city.trim()) {
			throw new Error("City is required");
		}
		if (!args.state.trim()) {
			throw new Error("State is required");
		}
		if (!args.zipCode.trim()) {
			throw new Error("ZIP code is required");
		}

		// Handle primary property uniqueness
		if (args.isPrimary) {
			await handlePrimaryProperty(ctx, args.clientId);
		}

		const propertyId = await createPropertyWithOrg(ctx, args);

		// Log activity on the client
		const client = await ctx.db.get(args.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return propertyId;
	},
});

/**
 * Update a client property
 */
export const update = mutation({
	args: {
		id: v.id("clientProperties"),
		clientId: v.optional(v.id("clients")),
		propertyName: v.optional(v.string()),
		propertyType: v.optional(
			v.union(
				v.literal("residential"),
				v.literal("commercial"),
				v.literal("industrial"),
				v.literal("retail"),
				v.literal("office"),
				v.literal("mixed-use")
			)
		),
		streetAddress: v.optional(v.string()),
		city: v.optional(v.string()),
		state: v.optional(v.string()),
		zipCode: v.optional(v.string()),
		country: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
		// Geocoding fields (from Mapbox Address Autofill)
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
		formattedAddress: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<ClientPropertyId> => {
		const { id, ...updates } = args;

		// Validate required address fields are not empty if being updated
		if (updates.streetAddress !== undefined && !updates.streetAddress.trim()) {
			throw new Error("Street address cannot be empty");
		}
		if (updates.city !== undefined && !updates.city.trim()) {
			throw new Error("City cannot be empty");
		}
		if (updates.state !== undefined && !updates.state.trim()) {
			throw new Error("State cannot be empty");
		}
		if (updates.zipCode !== undefined && !updates.zipCode.trim()) {
			throw new Error("ZIP code cannot be empty");
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Get current property and determine clientId
		const currentProperty = await getPropertyOrThrow(ctx, id);
		const clientId = filteredUpdates.clientId || currentProperty.clientId;

		// Validate new clientId if changing
		if (filteredUpdates.clientId) {
			await validateClientAccess(ctx, filteredUpdates.clientId);
		}

		// Handle primary property uniqueness
		if (filteredUpdates.isPrimary === true) {
			await handlePrimaryProperty(ctx, clientId, id);
		}

		// Compute field-level changes before applying the update
		const changes = computeFieldChanges(
			"clientProperty",
			currentProperty as unknown as Record<string, unknown>,
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
 * Delete a client property
 */
export const remove = mutation({
	args: { id: v.id("clientProperties") },
	handler: async (ctx, args): Promise<ClientPropertyId> => {
		const property = await getPropertyOrThrow(ctx, args.id);

		// Delete the property
		await ctx.db.delete(args.id);

		// Log activity on the client
		const client = await ctx.db.get(property.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return args.id;
	},
});

/**
 * Search properties across the organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const search = query({
	args: {
		query: v.string(),
		clientId: v.optional(v.id("clients")),
		propertyType: v.optional(
			v.union(
				v.literal("residential"),
				v.literal("commercial"),
				v.literal("industrial"),
				v.literal("retail"),
				v.literal("office"),
				v.literal("mixed-use")
			)
		),
	},
	handler: async (ctx, args): Promise<ClientPropertyDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx, { require: false });
		if (!userOrgId) {
			return [];
		}

		let properties: ClientPropertyDocument[];

		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, userOrgId);
			properties = await ctx.db
				.query("clientProperties")
				.withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
				.collect();
		} else {
			properties = await ctx.db
				.query("clientProperties")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect();
		}

		// Filter by property type if specified
		if (args.propertyType) {
			properties = properties.filter(
				(property: ClientPropertyDocument) =>
					property.propertyType === args.propertyType
			);
		}

		// Search in property name, address, city, state, and zip code
		const searchQuery = args.query.toLowerCase();
		return properties.filter(
			(property: ClientPropertyDocument) =>
				(property.propertyName &&
					property.propertyName.toLowerCase().includes(searchQuery)) ||
				property.streetAddress.toLowerCase().includes(searchQuery) ||
				property.city.toLowerCase().includes(searchQuery) ||
				property.state.toLowerCase().includes(searchQuery) ||
				property.zipCode.toLowerCase().includes(searchQuery)
		);
	},
});

/**
 * Set a property as primary (and unset others)
 */
// TODO: Candidate for deletion if confirmed unused.
export const setPrimary = mutation({
	args: { id: v.id("clientProperties") },
	handler: async (ctx, args): Promise<ClientPropertyId> => {
		const property = await getPropertyOrThrow(ctx, args.id);

		// Unset any existing primary property for this client
		await handlePrimaryProperty(ctx, property.clientId, args.id);

		// Set this property as primary
		await ctx.db.patch(args.id, { isPrimary: true });

		// Log activity on the client
		const client = await ctx.db.get(property.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return args.id;
	},
});

/**
 * Bulk create properties for a client
 */
// TODO: Candidate for deletion if confirmed unused.
export const bulkCreate = mutation({
	args: {
		clientId: v.id("clients"),
		properties: v.array(
			v.object({
				propertyName: v.optional(v.string()),
				propertyType: v.optional(
					v.union(
						v.literal("residential"),
						v.literal("commercial"),
						v.literal("industrial"),
						v.literal("retail"),
						v.literal("office"),
						v.literal("mixed-use")
					)
				),
				streetAddress: v.string(),
				city: v.string(),
				state: v.string(),
				zipCode: v.string(),
				country: v.optional(v.string()),
				isPrimary: v.boolean(),
				// Geocoding fields (from Mapbox Address Autofill)
				latitude: v.optional(v.number()),
				longitude: v.optional(v.number()),
				formattedAddress: v.optional(v.string()),
			})
		),
	},
	handler: async (ctx, args): Promise<ClientPropertyId[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate client access
		await validateClientAccess(ctx, args.clientId);

		const propertyIds: ClientPropertyId[] = [];
		let hasPrimary = false;

		// Check if any property is marked as primary
		for (const property of args.properties) {
			if (property.isPrimary) {
				if (hasPrimary) {
					throw new Error("Only one property can be marked as primary");
				}
				hasPrimary = true;
			}
		}

		// If setting a primary property, unset existing primary
		if (hasPrimary) {
			await handlePrimaryProperty(ctx, args.clientId);
		}

		// Create all properties
		for (const propertyData of args.properties) {
			// Validate required address fields
			if (!propertyData.streetAddress.trim()) {
				throw new Error("Street address is required for all properties");
			}
			if (!propertyData.city.trim()) {
				throw new Error("City is required for all properties");
			}
			if (!propertyData.state.trim()) {
				throw new Error("State is required for all properties");
			}
			if (!propertyData.zipCode.trim()) {
				throw new Error("ZIP code is required for all properties");
			}

			const propertyId = await ctx.db.insert("clientProperties", {
				...propertyData,
				clientId: args.clientId,
				orgId: userOrgId,
			});

			propertyIds.push(propertyId);
		}

		// Log activity on the client
		const client = await ctx.db.get(args.clientId);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client);
		}

		return propertyIds;
	},
});

/**
 * Get property statistics for the organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return {
				total: 0,
				byType: {
					residential: 0,
					commercial: 0,
					industrial: 0,
					retail: 0,
					office: 0,
					"mixed-use": 0,
					unspecified: 0,
				},
			};
		}

		const properties = await ctx.db
			.query("clientProperties")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const stats = {
			total: properties.length,
			byType: {
				residential: 0,
				commercial: 0,
				industrial: 0,
				retail: 0,
				office: 0,
				"mixed-use": 0,
				unspecified: 0,
			},
		};

		properties.forEach((property: ClientPropertyDocument) => {
			// Count by type
			if (property.propertyType) {
				stats.byType[property.propertyType]++;
			} else {
				stats.byType.unspecified++;
			}
		});

		return stats;
	},
});
