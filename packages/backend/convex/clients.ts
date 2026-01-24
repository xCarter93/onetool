import {
	query,
	mutation,
	internalMutation,
	QueryCtx,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { AggregateHelpers } from "./lib/aggregates";
import {
	getEntityWithOrgValidation,
	getEntityOrThrow,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { emitStatusChangeEvent } from "./eventBus";

/**
 * Client operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like aggregates, archiving) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get a client by ID with organization validation (wrapper for shared utility)
 */
async function getClientWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clients">
): Promise<Doc<"clients"> | null> {
	return await getEntityWithOrgValidation(ctx, "clients", id, "Client");
}

/**
 * Get a client by ID, throwing if not found (wrapper for shared utility)
 */
async function getClientOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"clients">
): Promise<Doc<"clients">> {
	return await getEntityOrThrow(ctx, "clients", id, "Client");
}

/**
 * List all clients for the current user's organization
 */
async function listClientsForOrg(
	ctx: QueryCtx,
	indexName?: "by_org" | "by_status",
	includeArchived: boolean = false
): Promise<Doc<"clients">[]> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyListResult();

	if (indexName) {
		const clients = await ctx.db
			.query("clients")
			.withIndex(indexName, (q) => q.eq("orgId", orgId))
			.collect();

		// Filter out archived clients unless explicitly requested
		if (!includeArchived) {
			return clients.filter((client) => client.status !== "archived");
		}

		return clients;
	}

	const clients = await ctx.db
		.query("clients")
		.filter((q) => q.eq(q.field("orgId"), orgId))
		.collect();

	// Filter out archived clients unless explicitly requested
	if (!includeArchived) {
		return clients.filter((client) => client.status !== "archived");
	}

	return clients;
}

/**
 * Create a client with automatic orgId assignment
 */
async function createClientWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"clients">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"clients">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	const clientData = {
		...data,
		orgId: userOrgId,
	};

	return await ctx.db.insert("clients", clientData);
}

/**
 * Update a client with validation
 */
async function updateClientWithValidation(
	ctx: MutationCtx,
	id: Id<"clients">,
	updates: Partial<Doc<"clients">>
): Promise<void> {
	// Validate client exists and belongs to user's org
	await getClientOrThrow(ctx, id);

	// Update the client
	await ctx.db.patch(id, updates);
}

// Define specific types for client operations
type ClientDocument = Doc<"clients">;
type ClientId = Id<"clients">;

// Interface for client statistics
interface ClientStats {
	total: number;
	byStatus: {
		lead: number;
		active: number;
		inactive: number;
		archived: number;
	};
	groupedByStatus: {
		prospective: number;
		active: number;
		inactive: number;
	};
	recentlyCreated: number;
}

/**
 * Get all clients for the current user's organization
 */
export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("lead"),
				v.literal("active"),
				v.literal("inactive"),
				v.literal("archived")
			)
		),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<ClientDocument[]> => {
		const includeArchived = args.includeArchived || false;

		if (args.status) {
			return await listClientsForOrg(ctx, "by_status", includeArchived);
		}
		return await listClientsForOrg(ctx, "by_org", includeArchived);
	},
});

/**
 * Get only archived clients for the current user's organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const listArchived = query({
	args: {},
	handler: async (ctx): Promise<ClientDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		return await ctx.db
			.query("clients")
			.withIndex("by_status", (q) =>
				q.eq("orgId", orgId).eq("status", "archived")
			)
			.collect();
	},
});

/**
 * Get a specific client by ID
 */
export const get = query({
	args: { id: v.id("clients") },
	handler: async (ctx, args): Promise<ClientDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		return await getClientWithValidation(ctx, args.id);
	},
});

/**
 * Create a new client
 */
export const create = mutation({
	args: {
		// Company Information
		companyName: v.string(),
		companyDescription: v.optional(v.string()),

		// Status and Classification
		status: v.union(
			v.literal("lead"),
			v.literal("active"),
			v.literal("inactive"),
			v.literal("archived")
		),
		leadSource: v.optional(
			v.union(
				v.literal("word-of-mouth"),
				v.literal("website"),
				v.literal("social-media"),
				v.literal("referral"),
				v.literal("advertising"),
				v.literal("trade-show"),
				v.literal("cold-outreach"),
				v.literal("other")
			)
		),

		// Classification
		isActive: v.optional(v.boolean()),

		// Communication preferences
		communicationPreference: v.optional(
			v.union(v.literal("email"), v.literal("phone"), v.literal("both"))
		),

		// Metadata
		tags: v.optional(v.array(v.string())),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<ClientId> => {
		// Type assertion needed because schema still has deprecated fields
		const clientId = await createClientWithOrg(ctx, args as any);

		// Get the created client for activity logging and aggregates
		const client = await ctx.db.get(clientId);
		if (client) {
			await ActivityHelpers.clientCreated(ctx, client as ClientDocument);
			await AggregateHelpers.addClient(ctx, client as ClientDocument);
		}

		return clientId;
	},
});

/**
 * Bulk create clients from CSV import
 */
export const bulkCreate = mutation({
	args: {
		clients: v.array(
			v.object({
				// Company Information
				companyName: v.string(),
				companyDescription: v.optional(v.string()),

				// Status and Classification
				status: v.union(
					v.literal("lead"),
					v.literal("active"),
					v.literal("inactive"),
					v.literal("archived")
				),
				leadSource: v.optional(
					v.union(
						v.literal("word-of-mouth"),
						v.literal("website"),
						v.literal("social-media"),
						v.literal("referral"),
						v.literal("advertising"),
						v.literal("trade-show"),
						v.literal("cold-outreach"),
						v.literal("other")
					)
				),

				// Classification
				isActive: v.optional(v.boolean()),

				// Communication preferences
				communicationPreference: v.optional(
					v.union(v.literal("email"), v.literal("phone"), v.literal("both"))
				),

				// Metadata
				tags: v.optional(v.array(v.string())),
				notes: v.optional(v.string()),
			})
		),
	},
	handler: async (
		ctx,
		args
	): Promise<Array<{ success: boolean; id?: ClientId; error?: string }>> => {
		const results: Array<{
			success: boolean;
			id?: ClientId;
			error?: string;
		}> = [];

		for (const clientData of args.clients) {
			try {
				// Validate required fields
				if (!clientData.companyName || !clientData.companyName.trim()) {
					results.push({
						success: false,
						error: "Company name is required",
					});
					continue;
				}

				// Type assertion needed because schema still has deprecated fields
				const clientId = await createClientWithOrg(ctx, clientData as any);

				// Get the created client for activity logging and aggregates
				const client = await ctx.db.get(clientId);
				if (client) {
					await ActivityHelpers.clientCreated(ctx, client as ClientDocument);
					await AggregateHelpers.addClient(ctx, client as ClientDocument);
				}

				results.push({
					success: true,
					id: clientId,
				});
			} catch (error) {
				results.push({
					success: false,
					error:
						error instanceof Error ? error.message : "Unknown error occurred",
				});
			}
		}

		return results;
	},
});

/**
 * Update a client with type-safe partial updates
 */
export const update = mutation({
	args: {
		id: v.id("clients"),
		// All fields are optional for updates
		companyName: v.optional(v.string()),
		companyDescription: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("lead"),
				v.literal("active"),
				v.literal("inactive"),
				v.literal("archived")
			)
		),
		leadSource: v.optional(
			v.union(
				v.literal("word-of-mouth"),
				v.literal("website"),
				v.literal("social-media"),
				v.literal("referral"),
				v.literal("advertising"),
				v.literal("trade-show"),
				v.literal("cold-outreach"),
				v.literal("other")
			)
		),
		isActive: v.optional(v.boolean()),
		communicationPreference: v.optional(
			v.union(v.literal("email"), v.literal("phone"), v.literal("both"))
		),
		tags: v.optional(v.array(v.string())),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<ClientId> => {
		const { id, ...updates } = args;

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Get existing client to track status changes
		const existingClient = await getClientOrThrow(ctx, id);
		const oldStatus = existingClient.status;

		await updateClientWithValidation(ctx, id, filteredUpdates);

		// Get the updated client for activity logging
		const client = await ctx.db.get(id);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client as ClientDocument);

			// Emit status change event if status changed
			if (args.status && args.status !== oldStatus) {
				await emitStatusChangeEvent(
					ctx,
					client.orgId,
					"client",
					client._id,
					oldStatus,
					args.status,
					"clients.update"
				);
			}
		}

		return id;
	},
});

/**
 * Archive a client (soft delete) - sets status to archived and archivedAt timestamp
 */
export const archive = mutation({
	args: { id: v.id("clients") },
	handler: async (ctx, args): Promise<ClientId> => {
		// Validate client exists and belongs to user's org
		await getClientOrThrow(ctx, args.id);

		// Archive the client by setting status to archived and adding archivedAt timestamp
		await ctx.db.patch(args.id, {
			status: "archived",
			archivedAt: Date.now(),
		});

		// Get the updated client for activity logging
		const client = await ctx.db.get(args.id);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client as ClientDocument);
		}

		return args.id;
	},
});

/**
 * Restore an archived client back to active status
 */
export const restore = mutation({
	args: { id: v.id("clients") },
	handler: async (ctx, args): Promise<ClientId> => {
		// Validate client exists and belongs to user's org
		const client = await getClientOrThrow(ctx, args.id);

		if (client.status !== "archived") {
			throw new Error("Only archived clients can be restored");
		}

		// Restore the client by setting status back to active and removing archivedAt
		await ctx.db.patch(args.id, {
			status: "active",
			archivedAt: undefined,
		});

		// Get the updated client for activity logging
		const updatedClient = await ctx.db.get(args.id);
		if (updatedClient) {
			await ActivityHelpers.clientUpdated(ctx, updatedClient as ClientDocument);
		}

		return args.id;
	},
});

/**
 * Helper function to permanently delete a client and all related data
 */
async function permanentlyDeleteHandler(
	ctx: MutationCtx,
	args: { id: Id<"clients"> }
): Promise<ClientId> {
	// Validate client exists and belongs to user's org
	const client = await getClientOrThrow(ctx, args.id);

	if (client.status !== "archived") {
		throw new Error("Only archived clients can be permanently deleted");
	}

	return await permanentlyDeleteSystemHandler(ctx, args);
}

/**
 * System-level helper function to permanently delete a client and all related data
 * This version doesn't require user authentication and is used by system operations
 */
async function permanentlyDeleteSystemHandler(
	ctx: MutationCtx,
	args: { id: Id<"clients"> }
): Promise<ClientId> {
	// Get client directly without user validation (system operation)
	const client = await ctx.db.get(args.id);

	if (!client) {
		throw new Error("Client not found");
	}

	if (client.status !== "archived") {
		throw new Error("Only archived clients can be permanently deleted");
	}

	// Delete all related data first
	const contacts = await ctx.db
		.query("clientContacts")
		.withIndex("by_client", (q) => q.eq("clientId", args.id))
		.collect();

	const properties = await ctx.db
		.query("clientProperties")
		.withIndex("by_client", (q) => q.eq("clientId", args.id))
		.collect();

	const projects = await ctx.db
		.query("projects")
		.withIndex("by_client", (q) => q.eq("clientId", args.id))
		.collect();

	const quotes = await ctx.db
		.query("quotes")
		.withIndex("by_client", (q) => q.eq("clientId", args.id))
		.collect();

	const invoices = await ctx.db
		.query("invoices")
		.withIndex("by_client", (q) => q.eq("clientId", args.id))
		.collect();

	const tasks = await ctx.db
		.query("tasks")
		.withIndex("by_client", (q) => q.eq("clientId", args.id))
		.collect();

	// Delete all related records
	for (const contact of contacts) {
		await ctx.db.delete(contact._id);
	}

	for (const property of properties) {
		await ctx.db.delete(property._id);
	}

	for (const project of projects) {
		await ctx.db.delete(project._id);
	}

	for (const quote of quotes) {
		// Also delete quote line items
		const quoteLineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
			.collect();

		for (const lineItem of quoteLineItems) {
			await ctx.db.delete(lineItem._id);
		}

		// Delete associated documents
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_document", (q) =>
				q.eq("documentType", "quote").eq("documentId", quote._id)
			)
			.collect();

		for (const document of documents) {
			await ctx.db.delete(document._id);
		}

		await ctx.db.delete(quote._id);
	}

	for (const invoice of invoices) {
		// Also delete invoice line items
		const invoiceLineItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
			.collect();

		for (const lineItem of invoiceLineItems) {
			await ctx.db.delete(lineItem._id);
		}

		// Delete associated documents
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_document", (q) =>
				q.eq("documentType", "invoice").eq("documentId", invoice._id)
			)
			.collect();

		for (const document of documents) {
			await ctx.db.delete(document._id);
		}

		await ctx.db.delete(invoice._id);
	}

	for (const task of tasks) {
		await ctx.db.delete(task._id);
	}

	// Remove from aggregates before deleting
	await AggregateHelpers.removeClient(ctx, client);

	// Finally delete the client itself
	await ctx.db.delete(args.id);
	return args.id;
}

/**
 * Permanently delete a client and all related data (used by cron job)
 * This is an internal function that should only be called by the cron job
 */
// TODO: Candidate for deletion if confirmed unused.
export const permanentlyDelete = mutation({
	args: { id: v.id("clients") },
	handler: async (ctx, args): Promise<ClientId> => {
		return await permanentlyDeleteHandler(ctx, args);
	},
});

/**
 * Legacy delete function - now redirects to archive for backward compatibility
 * @deprecated Use archive() instead
 */
// TODO: Candidate for deletion if confirmed unused.
export const remove = mutation({
	args: { id: v.id("clients") },
	handler: async (ctx, args): Promise<ClientId> => {
		// For backward compatibility, redirect to archive
		// Archive the client by setting status to archived and adding archivedAt timestamp
		await ctx.db.patch(args.id, {
			status: "archived",
			archivedAt: Date.now(),
		});

		// Get the updated client for activity logging
		const client = await ctx.db.get(args.id);
		if (client) {
			await ActivityHelpers.clientUpdated(ctx, client as ClientDocument);
		}

		return args.id;
	},
});

/**
 * Search clients with type-safe filtering
 */
// TODO: Candidate for deletion if confirmed unused.
export const search = query({
	args: {
		query: v.string(),
		status: v.optional(
			v.union(
				v.literal("lead"),
				v.literal("active"),
				v.literal("inactive"),
				v.literal("archived")
			)
		),
	},
	handler: async (ctx, args): Promise<ClientDocument[]> => {
		let clients = await listClientsForOrg(ctx, "by_org");

		// Type-safe filtering using proper type guards
		if (args.status) {
			clients = clients.filter(
				(client: ClientDocument) => client.status === args.status
			);
		}

		// Search in company name and notes
		const searchQuery = args.query.toLowerCase();
		return clients.filter(
			(client: ClientDocument) =>
				client.companyName.toLowerCase().includes(searchQuery) ||
				(client.notes && client.notes.toLowerCase().includes(searchQuery)) ||
				(client.tags &&
					client.tags.some((tag: string) =>
						tag.toLowerCase().includes(searchQuery)
					))
		);
	},
});

/**
 * Get client statistics for dashboard with proper typing
 */
export const getStats = query({
	args: {},
	handler: async (ctx): Promise<ClientStats> => {
		const clients = await listClientsForOrg(ctx, "by_org", true);

		const stats: ClientStats = {
			total: clients.length,
			byStatus: {
				lead: 0,
				active: 0,
				inactive: 0,
				archived: 0,
			},
			groupedByStatus: {
				prospective: 0,
				active: 0,
				inactive: 0,
			},
			recentlyCreated: 0, // Last 30 days
		};

		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

		clients.forEach((client: ClientDocument) => {
			// Type-safe status counting
			if (client.status in stats.byStatus) {
				stats.byStatus[client.status as keyof typeof stats.byStatus]++;
			}

			switch (client.status) {
				case "lead":
					stats.groupedByStatus.prospective++;
					break;
				case "active":
					stats.groupedByStatus.active++;
					break;
				case "inactive":
				case "archived":
					stats.groupedByStatus.inactive++;
					break;
				default:
					break;
			}

			// Count recently created
			if (client._creationTime > thirtyDaysAgo) {
				stats.recentlyCreated++;
			}
		});

		return stats;
	},
});

/**
 * Get clients with recent activity using proper types
 */
// TODO: Candidate for deletion if confirmed unused.
export const getRecentActivity = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args): Promise<ClientDocument[]> => {
		const limit = args.limit || 10;

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Get recent client-related activities
		const activities = await ctx.db
			.query("activities")
			.withIndex("by_type", (q) =>
				q.eq("orgId", orgId).eq("activityType", "client_created")
			)
			.order("desc")
			.take(limit);

		// Get the clients for these activities with proper typing
		const clientPromises = activities.map((activity) =>
			ctx.db.get(activity.entityId as ClientId)
		);

		const clients = await Promise.all(clientPromises);

		return clients.filter(
			(client): client is ClientDocument => client !== null
		);
	},
});

/**
 * Get clients with their active project counts for display in lists
 */
/**
 * Return type for client with project count
 */
type ClientWithProjectCount = {
	id: string;
	name: string;
	location: string;
	activeProjects: number;
	lastActivity: string;
	status: "Active" | "Prospect" | "Paused" | "Archived";
	primaryContact: {
		name: string;
		email: string;
		jobTitle: string;
	} | null;
};

export const listWithProjectCounts = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("lead"),
				v.literal("active"),
				v.literal("inactive"),
				v.literal("archived")
			)
		),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<ClientWithProjectCount[]> => {
		const includeArchived = args.includeArchived || false;

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult<ClientWithProjectCount>();

		// Get clients based on status filter
		let clients: Doc<"clients">[];

		if (args.status) {
			// Use the by_status index to get clients with specific status
			clients = await ctx.db
				.query("clients")
				.withIndex("by_status", (q) =>
					q.eq("orgId", orgId).eq("status", args.status!)
				)
				.collect();
		} else {
			// For all clients, filter out archived unless explicitly requested
			clients = await ctx.db
				.query("clients")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();

			if (!includeArchived) {
				clients = clients.filter((client) => client.status !== "archived");
			}
		}

		// For each client, get their active project count
		const clientsWithProjectCounts = await Promise.all(
			clients.map(async (client) => {
				const activeProjects = await ctx.db
					.query("projects")
					.withIndex("by_client", (q) => q.eq("clientId", client._id))
					.filter((q) =>
						q.or(
							q.eq(q.field("status"), "planned"),
							q.eq(q.field("status"), "in-progress")
						)
					)
					.collect();

				// Get the primary contact for this client
				const primaryContact = await ctx.db
					.query("clientContacts")
					.withIndex("by_primary", (q) =>
						q.eq("clientId", client._id).eq("isPrimary", true)
					)
					.first();

				// Get the most recent activity timestamp for this client
				const recentActivities = await ctx.db
					.query("activities")
					.withIndex("by_type", (q) => q.eq("orgId", client.orgId))
					.filter((q) => q.eq(q.field("entityId"), client._id))
					.order("desc")
					.take(1);

				const lastActivityTime =
					recentActivities.length > 0
						? recentActivities[0].timestamp
						: client._creationTime;

				return {
					id: client._id,
					name: client.companyName,
					// For location, we'll need to check if there's a primary contact with address
					location: "Not specified", // This could be enhanced with contact data
					activeProjects: activeProjects.length,
					lastActivity: new Date(lastActivityTime).toISOString(),
					status:
						client.status === "active"
							? ("Active" as const)
							: client.status === "lead"
								? ("Prospect" as const)
								: client.status === "inactive"
									? ("Paused" as const)
									: client.status === "archived"
										? ("Archived" as const)
										: ("Paused" as const),
					primaryContact: primaryContact
						? {
								name: `${primaryContact.firstName} ${primaryContact.lastName}`,
								email: primaryContact.email || "No email",
								jobTitle: primaryContact.jobTitle || "No title",
							}
						: null,
				};
			})
		);

		return clientsWithProjectCounts;
	},
});

/**
 * Internal function to cleanup archived clients that have been archived for 7+ days
 * This is called by the cron job and should not be called directly
 */
/**
 * System-level cleanup function that doesn't require user authentication
 * This is used by cron jobs and can be run manually from the dashboard
 */
export const cleanupArchivedClients = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ deleted: number; errors: string[] }> => {
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const errors: string[] = [];
		let deletedCount = 0;

		try {
			// Find all archived clients that were archived 7+ days ago
			const archivedClients = await ctx.db
				.query("clients")
				.filter((q) =>
					q.and(
						q.eq(q.field("status"), "archived"),
						q.lt(q.field("archivedAt"), sevenDaysAgo)
					)
				)
				.collect();

			console.log(
				`Found ${archivedClients.length} archived clients to cleanup`
			);

			// Permanently delete each archived client using system-level deletion
			for (const client of archivedClients) {
				try {
					await permanentlyDeleteSystemHandler(ctx, { id: client._id });
					deletedCount++;
					console.log(
						`Deleted archived client: ${client.companyName} (${client._id})`
					);
				} catch (error) {
					const errorMsg = `Failed to delete client ${client.companyName} (${client._id}): ${error}`;
					console.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			console.log(
				`Cleanup completed: ${deletedCount} clients deleted, ${errors.length} errors`
			);
		} catch (error) {
			const errorMsg = `Failed to run archived clients cleanup: ${error}`;
			console.error(errorMsg);
			errors.push(errorMsg);
		}

		return { deleted: deletedCount, errors };
	},
});
