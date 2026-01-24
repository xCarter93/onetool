import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { AggregateHelpers } from "./lib/aggregates";
import { DateUtils } from "./lib/shared";
import { requireMembership } from "./lib/memberships";
import { isMember, getCurrentUserId } from "./lib/permissions";
import {
	getEntityWithOrgValidation,
	getEntityOrThrow,
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { emitStatusChangeEvent } from "./eventBus";

/**
 * Project operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like status transitions, aggregate updates) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get a project with org validation (wrapper for shared utility)
 */
async function getProjectWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"projects">
): Promise<Doc<"projects"> | null> {
	return await getEntityWithOrgValidation(ctx, "projects", id, "Project");
}

/**
 * Get a project, throwing if not found (wrapper for shared utility)
 */
async function getProjectOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"projects">
): Promise<Doc<"projects">> {
	return await getEntityOrThrow(ctx, "projects", id, "Project");
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
 * Validate users exist and belong to user's org
 */
async function validateUserAccess(
	ctx: QueryCtx | MutationCtx,
	userIds: Id<"users">[],
	existingOrgId?: Id<"organizations">
): Promise<void> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));

	for (const userId of userIds) {
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error(`User ${userId} not found`);
		}
		await requireMembership(ctx, userId, userOrgId);
	}
}

/**
 * Create a project with automatic orgId assignment
 */
async function createProjectWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"projects">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"projects">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate client access
	await validateClientAccess(ctx, data.clientId, userOrgId);

	// Validate assigned users if provided
	if (data.assignedUserIds && data.assignedUserIds.length > 0) {
		await validateUserAccess(ctx, data.assignedUserIds, userOrgId);
	}

	const projectData = {
		...data,
		orgId: userOrgId,
	};

	return await ctx.db.insert("projects", projectData);
}

/**
 * Update a project with validation
 */
async function updateProjectWithValidation(
	ctx: MutationCtx,
	id: Id<"projects">,
	updates: Partial<Doc<"projects">>
): Promise<void> {
	// Validate project exists and belongs to user's org
	await getProjectOrThrow(ctx, id);

	// Validate new client if being updated
	if (updates.clientId) {
		await validateClientAccess(ctx, updates.clientId);
	}

	// Validate assigned users if being updated
	if (updates.assignedUserIds && updates.assignedUserIds.length > 0) {
		await validateUserAccess(ctx, updates.assignedUserIds);
	}

	// Update the project
	await ctx.db.patch(id, updates);
}

// Define specific types for project operations
type ProjectDocument = Doc<"projects">;
type ProjectId = Id<"projects">;

// Interface for project statistics
interface ProjectStats {
	total: number;
	byStatus: {
		planned: number;
		"in-progress": number;
		completed: number;
		cancelled: number;
	};
	byType: {
		"one-off": number;
		recurring: number;
	};
	upcomingDeadlines: number; // Projects with deadlines in next 7 days
	overdue: number; // Projects past due date
}

function createEmptyProjectStats(): ProjectStats {
	return {
		total: 0,
		byStatus: {
			planned: 0,
			"in-progress": 0,
			completed: 0,
			cancelled: 0,
		},
		byType: {
			"one-off": 0,
			recurring: 0,
		},
		upcomingDeadlines: 0,
		overdue: 0,
	};
}

/**
 * Get all projects for the current user's organization
 */
export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("planned"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		clientId: v.optional(v.id("clients")),
	},
	handler: async (ctx: QueryCtx, args: any): Promise<ProjectDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned projects
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		let projects: ProjectDocument[];

		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			projects = await ctx.db
				.query("projects")
				.withIndex("by_client", (q: any) => q.eq("clientId", args.clientId!))
				.collect();
		} else if (args.status) {
			projects = await ctx.db
				.query("projects")
				.withIndex("by_status", (q: any) =>
					q.eq("orgId", orgId).eq("status", args.status!)
				)
				.collect();
		} else {
			projects = await ctx.db
				.query("projects")
				.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
				.collect();
		}

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			projects = projects.filter(
				(project) =>
					project.assignedUserIds &&
					project.assignedUserIds.includes(currentUserId)
			);
		}

		return projects;
	},
});

/**
 * Get a specific project by ID
 */
export const get = query({
	args: { id: v.id("projects") },
	handler: async (
		ctx: QueryCtx,
		args: any
	): Promise<ProjectDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const project = await getProjectWithValidation(ctx, args.id);
		if (!project) {
			return null;
		}

		// Check if user is a member (non-admin) - members can only see their assigned projects
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		// If user is a member, verify they're assigned to this project
		if (isUserMember && currentUserId) {
			const isAssigned =
				project.assignedUserIds &&
				project.assignedUserIds.includes(currentUserId);

			if (!isAssigned) {
				// Return null if member is not assigned (same as project not found)
				return null;
			}
		}

		return project;
	},
});

/**
 * Create a new project
 */
export const create = mutation({
	args: {
		clientId: v.id("clients"),
		title: v.string(),
		description: v.optional(v.string()),
		projectNumber: v.optional(v.string()),
		status: v.union(
			v.literal("planned"),
			v.literal("in-progress"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		projectType: v.union(v.literal("one-off"), v.literal("recurring")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		assignedUserIds: v.optional(v.array(v.id("users"))),
	},
	handler: async (ctx: MutationCtx, args: any): Promise<ProjectId> => {
		// Validate title is not empty
		if (!args.title.trim()) {
			throw new Error("Project title is required");
		}

		// Validate dates if provided
		if (args.startDate && args.endDate && args.startDate > args.endDate) {
			throw new Error("Start date cannot be after end date");
		}

		const projectId = await createProjectWithOrg(ctx, args);

		// Get the created project for activity logging and aggregates
		const project = await ctx.db.get(projectId);
		if (project) {
			await ActivityHelpers.projectCreated(ctx, project as ProjectDocument);
			await AggregateHelpers.addProject(ctx, project as ProjectDocument);
		}

		return projectId;
	},
});

/**
 * Bulk create projects from CSV import
 */
export const bulkCreate = mutation({
	args: {
		projects: v.array(
			v.object({
				clientId: v.optional(v.id("clients")),
				clientName: v.optional(v.string()), // For lookup if clientId not provided
				title: v.string(),
				description: v.optional(v.string()),
				projectNumber: v.optional(v.string()),
				status: v.union(
					v.literal("planned"),
					v.literal("in-progress"),
					v.literal("completed"),
					v.literal("cancelled")
				),
				projectType: v.union(v.literal("one-off"), v.literal("recurring")),
				startDate: v.optional(v.number()),
				endDate: v.optional(v.number()),
				assignedUserIds: v.optional(v.array(v.id("users"))),
			})
		),
	},
	handler: async (
		ctx: MutationCtx,
		args: any
	): Promise<Array<{ success: boolean; id?: ProjectId; error?: string }>> => {
		const results: Array<{
			success: boolean;
			id?: ProjectId;
			error?: string;
		}> = [];

		const userOrgId = await getCurrentUserOrgId(ctx);

		for (const projectData of args.projects) {
			try {
				// Validate required fields
				if (!projectData.title || !projectData.title.trim()) {
					results.push({
						success: false,
						error: "Project title is required",
					});
					continue;
				}

				// Resolve clientId if clientName is provided instead
				let clientId = projectData.clientId;
				if (!clientId && projectData.clientName) {
					const clients = await ctx.db
						.query("clients")
						.withIndex("by_org", (q: any) => q.eq("orgId", userOrgId))
						.collect();

					const matchedClient = clients.find(
						(c: any) =>
							c.companyName.toLowerCase() ===
							projectData.clientName!.toLowerCase()
					);

					if (matchedClient) {
						clientId = matchedClient._id;
					} else {
						results.push({
							success: false,
							error: `Client "${projectData.clientName}" not found`,
						});
						continue;
					}
				}

				if (!clientId) {
					results.push({
						success: false,
						error: "Client ID or client name is required",
					});
					continue;
				}

				// Validate dates if provided
				if (
					projectData.startDate &&
					projectData.endDate &&
					projectData.startDate > projectData.endDate
				) {
					results.push({
						success: false,
						error: "Start date cannot be after end date",
					});
					continue;
				}

				// Create the project
				// Omit clientName as it's only used for lookup, not stored in the project
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { clientName, ...projectCreateData } = projectData;
				const projectId = await createProjectWithOrg(ctx, {
					...projectCreateData,
					clientId,
				});

				// Get the created project for activity logging and aggregate updates
				const project = await ctx.db.get(projectId);
				if (project) {
					await ActivityHelpers.projectCreated(ctx, project as ProjectDocument);
					await AggregateHelpers.addProject(ctx, project as ProjectDocument);
				}

				results.push({
					success: true,
					id: projectId,
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
 * Update a project
 */
export const update = mutation({
	args: {
		id: v.id("projects"),
		clientId: v.optional(v.id("clients")),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		projectNumber: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("planned"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		projectType: v.optional(
			v.union(v.literal("one-off"), v.literal("recurring"))
		),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		assignedUserIds: v.optional(v.array(v.id("users"))),
	},
	handler: async (ctx: MutationCtx, args: any): Promise<ProjectId> => {
		const { id, ...updates } = args;

		// Validate title is not empty if being updated
		if (updates.title !== undefined && !updates.title.trim()) {
			throw new Error("Project title cannot be empty");
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates) as Partial<ProjectDocument>;
		requireUpdates(filteredUpdates);

		// Get current project for date validation
		const currentProject = await getProjectOrThrow(ctx, id);
		const oldStatus = currentProject.status;
		const startDate = filteredUpdates.startDate ?? currentProject.startDate;
		const endDate = filteredUpdates.endDate ?? currentProject.endDate;

		// Validate dates
		if (startDate && endDate && startDate > endDate) {
			throw new Error("Start date cannot be after end date");
		}

		// Check if status is being changed to completed
		const wasCompleted = currentProject.status === "completed";
		const isBeingCompleted =
			filteredUpdates.status === "completed" && !wasCompleted;

		// If being completed, set completion time
		if (isBeingCompleted) {
			filteredUpdates.completedAt = Date.now();
		}

		await updateProjectWithValidation(ctx, id, filteredUpdates);

		// Get updated project for activity logging and aggregates
		const project = await ctx.db.get(id);
		if (project) {
			// Update aggregates if status or completedAt changed
			if (
				filteredUpdates.status !== undefined ||
				filteredUpdates.completedAt !== undefined
			) {
				await AggregateHelpers.updateProject(
					ctx,
					currentProject as ProjectDocument,
					project as ProjectDocument
				);
			}

			if (isBeingCompleted) {
				await ActivityHelpers.projectCompleted(ctx, project as ProjectDocument);
			} else {
				await ActivityHelpers.projectUpdated(ctx, project as ProjectDocument);
			}

			// Emit status change event if status changed
			if (args.status && args.status !== oldStatus) {
				await emitStatusChangeEvent(
					ctx,
					(project as ProjectDocument).orgId,
					"project",
					(project as ProjectDocument)._id,
					oldStatus,
					args.status,
					"projects.update"
				);
			}
		}

		return id;
	},
});

/**
 * Delete a project with cascading deletion of related entities
 */
export const remove = mutation({
	args: { id: v.id("projects") },
	handler: async (ctx: MutationCtx, args: any): Promise<ProjectId> => {
		const project = await getProjectOrThrow(ctx, args.id); // Validate access

		// 1. Delete all tasks associated with this project
		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_project", (q: any) => q.eq("projectId", args.id))
			.collect();

		for (const task of tasks) {
			await ctx.db.delete(task._id);
		}

		// 2. Delete all quotes and their line items
		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_project", (q: any) => q.eq("projectId", args.id))
			.collect();

		for (const quote of quotes) {
			// Delete quote line items first
			const quoteLineItems = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q: any) => q.eq("quoteId", quote._id))
				.collect();

			for (const lineItem of quoteLineItems) {
				await ctx.db.delete(lineItem._id);
			}

			// Delete documents (PDFs) associated with this quote
			const quoteDocuments = await ctx.db
				.query("documents")
				.withIndex("by_document", (q: any) =>
					q.eq("documentType", "quote").eq("documentId", quote._id)
				)
				.collect();

			for (const doc of quoteDocuments) {
				// Delete the stored files
				if (doc.storageId) {
					await ctx.storage.delete(doc.storageId);
				}
				if (doc.signedStorageId) {
					await ctx.storage.delete(doc.signedStorageId);
				}
				await ctx.db.delete(doc._id);
			}

			// Delete the quote itself
			await ctx.db.delete(quote._id);
		}

		// 3. Delete all invoices and their line items
		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_project", (q: any) => q.eq("projectId", args.id))
			.collect();

		for (const invoice of invoices) {
			// Delete invoice line items first
			const invoiceLineItems = await ctx.db
				.query("invoiceLineItems")
				.withIndex("by_invoice", (q: any) => q.eq("invoiceId", invoice._id))
				.collect();

			for (const lineItem of invoiceLineItems) {
				await ctx.db.delete(lineItem._id);
			}

			// Delete documents (PDFs) associated with this invoice
			const invoiceDocuments = await ctx.db
				.query("documents")
				.withIndex("by_document", (q: any) =>
					q.eq("documentType", "invoice").eq("documentId", invoice._id)
				)
				.collect();

			for (const doc of invoiceDocuments) {
				// Delete the stored files
				if (doc.storageId) {
					await ctx.storage.delete(doc.storageId);
				}
				if (doc.signedStorageId) {
					await ctx.storage.delete(doc.signedStorageId);
				}
				await ctx.db.delete(doc._id);
			}

			// Delete the invoice itself
			await ctx.db.delete(invoice._id);
		}

		// 4. Remove from aggregates before deleting the project
		await AggregateHelpers.removeProject(ctx, project as ProjectDocument);

		// 5. Finally, delete the project itself
		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Search projects with filtering
 */
// TODO: Candidate for deletion if confirmed unused.
export const search = query({
	args: {
		query: v.string(),
		status: v.optional(
			v.union(
				v.literal("planned"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		projectType: v.optional(
			v.union(v.literal("one-off"), v.literal("recurring"))
		),
		clientId: v.optional(v.id("clients")),
	},
	handler: async (ctx: QueryCtx, args: any): Promise<ProjectDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned projects
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		let projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			projects = projects.filter(
				(project: any) =>
					project.assignedUserIds &&
					project.assignedUserIds.includes(currentUserId)
			);
		}

		// Filter by client if specified
		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			projects = projects.filter(
				(project: ProjectDocument) => project.clientId === args.clientId
			);
		}

		// Filter by status if specified
		if (args.status) {
			projects = projects.filter(
				(project: ProjectDocument) => project.status === args.status
			);
		}

		// Filter by project type if specified
		if (args.projectType) {
			projects = projects.filter(
				(project: ProjectDocument) => project.projectType === args.projectType
			);
		}

		// Search in title, description, and project number
		const searchQuery = args.query.toLowerCase();
		return projects.filter(
			(project: ProjectDocument) =>
				project.title.toLowerCase().includes(searchQuery) ||
				(project.description &&
					project.description.toLowerCase().includes(searchQuery)) ||
				(project.projectNumber &&
					project.projectNumber.toLowerCase().includes(searchQuery))
		);
	},
});

/**
 * Get project statistics for dashboard
 */
export const getStats = query({
	args: {},
	handler: async (ctx: QueryCtx): Promise<ProjectStats> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return createEmptyProjectStats();
		}

		// Check if user is a member (non-admin) - members can only see their assigned projects
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		let projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			projects = projects.filter(
				(project: any) =>
					project.assignedUserIds &&
					project.assignedUserIds.includes(currentUserId)
			);
		}

		const stats: ProjectStats = {
			total: projects.length,
			byStatus: {
				planned: 0,
				"in-progress": 0,
				completed: 0,
				cancelled: 0,
			},
			byType: {
				"one-off": 0,
				recurring: 0,
			},
			upcomingDeadlines: 0,
			overdue: 0,
		};

		const now = Date.now();
		const nextWeek = DateUtils.addDays(now, 7);

		projects.forEach((project: any) => {
			// Count by status
			stats.byStatus[project.status as keyof typeof stats.byStatus]++;

			// Count by type
			stats.byType[project.projectType as keyof typeof stats.byType]++;

			// Count upcoming deadlines (next 7 days) - based on end date
			if (
				project.endDate &&
				project.endDate <= nextWeek &&
				project.endDate > now
			) {
				stats.upcomingDeadlines++;
			}

			// Count overdue projects - based on end date
			if (
				project.endDate &&
				project.endDate < now &&
				project.status !== "completed"
			) {
				stats.overdue++;
			}
		});

		return stats;
	},
});

/**
 * Get projects assigned to a specific user
 */
// TODO: Candidate for deletion if confirmed unused.
export const getByAssignee = query({
	args: { userId: v.id("users") },
	handler: async (ctx: QueryCtx, args: any): Promise<ProjectDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Validate user belongs to organization
		await validateUserAccess(ctx, [args.userId], orgId);

		// Check if user is a member (non-admin) - members can only see their assigned projects
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		const projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		// Filter projects where user is assigned
		let filteredProjects = projects.filter(
			(project: any) =>
				project.assignedUserIds && project.assignedUserIds.includes(args.userId)
		);

		// If requesting user is a member, further filter to only their assigned projects
		if (isUserMember && currentUserId) {
			filteredProjects = filteredProjects.filter(
				(project: any) =>
					project.assignedUserIds &&
					project.assignedUserIds.includes(currentUserId)
			);
		}

		return filteredProjects;
	},
});

/**
 * Get projects with upcoming deadlines
 */
// TODO: Candidate for deletion if confirmed unused.
export const getUpcomingDeadlines = query({
	args: { days: v.optional(v.number()) },
	handler: async (ctx: QueryCtx, args: any): Promise<ProjectDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned projects
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		const daysAhead = args.days || 7;

		let projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			projects = projects.filter(
				(project: any) =>
					project.assignedUserIds &&
					project.assignedUserIds.includes(currentUserId)
			);
		}

		const now = Date.now();
		const deadline = DateUtils.addDays(now, daysAhead);

		return projects.filter(
			(project: ProjectDocument) =>
				project.endDate &&
				project.endDate <= deadline &&
				project.endDate > now &&
				project.status !== "completed" &&
				project.status !== "cancelled"
		);
	},
});

/**
 * Get overdue projects
 */
// TODO: Candidate for deletion if confirmed unused.
export const getOverdue = query({
	args: {},
	handler: async (ctx: QueryCtx): Promise<ProjectDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		const projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		const now = Date.now();

		return projects.filter(
			(project: any) =>
				project.endDate &&
				project.endDate < now &&
				project.status !== "completed" &&
				project.status !== "cancelled"
		);
	},
});
