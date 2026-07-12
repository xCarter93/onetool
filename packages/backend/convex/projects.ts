import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { AggregateHelpers } from "./lib/aggregates";
import { DateUtils } from "./lib/shared";
import { requireMembership } from "./lib/memberships";
import {
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { emptyListResult } from "./lib/queries";
import {
	emitStatusChangeEvent,
	emitRecordCreatedEvent,
	emitRecordUpdatedEvent,
} from "./eventBus";
import { computeFieldChanges } from "./lib/changeTracking";
import {
	optionalUserQuery,
	userMutation,
	type UserMutationCtx,
} from "./lib/factories";
import { calculateQuoteTotals } from "./lib/quoteTotals";
import { permissionsEnforced } from "./lib/permissions";

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
	ctx: UserMutationCtx,
	data: Omit<Doc<"projects">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"projects">> {
	// Validate client access
	await validateClientAccess(ctx, data.clientId, ctx.orgId);

	// Validate assigned users if provided
	if (data.assignedUserIds && data.assignedUserIds.length > 0) {
		await validateUserAccess(ctx, data.assignedUserIds, ctx.orgId);
	}

	const projectData = {
		...data,
		orgId: ctx.orgId,
	};

	return await ctx.db.insert("projects", projectData);
}

/**
 * Resolve assignedUserIds for a new project: scoped users own what they create (PRD §3.2).
 */
async function resolveScopedCreateAssignees(
	ctx: UserMutationCtx,
	assignedUserIds: Id<"users">[] | undefined
): Promise<Id<"users">[] | undefined> {
	if (await ctx.hasAllRecords("projects")) return assignedUserIds;
	if (assignedUserIds?.includes(ctx.user._id)) return assignedUserIds;
	if (permissionsEnforced()) {
		// scoped users own what they create (PRD §3.2)
		return [...(assignedUserIds ?? []), ctx.user._id];
	}
	console.warn(
		`[permissions-shadow] would auto-assign project creator user=${ctx.user._id}`
	);
	return assignedUserIds;
}

/**
 * Update a project with validation
 */
async function updateProjectWithValidation(
	ctx: UserMutationCtx,
	id: Id<"projects">,
	updates: Partial<Doc<"projects">>
): Promise<void> {
	// Validate project exists and belongs to user's org
	await ctx.orgEntity("projects", id);

	// Validate new client if being updated
	if (updates.clientId) {
		await validateClientAccess(ctx, updates.clientId, ctx.orgId);
	}

	// Validate assigned users if being updated
	if (updates.assignedUserIds && updates.assignedUserIds.length > 0) {
		await validateUserAccess(ctx, updates.assignedUserIds, ctx.orgId);
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
export const list = optionalUserQuery({
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
	handler: async (ctx, args: any): Promise<ProjectDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("projects", "view");

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

		projects = await ctx.scopedToActor("projects", projects, (project) => project.assignedUserIds);

		return projects;
	},
});

/**
 * Get a specific project by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("projects") },
	handler: async (ctx, args: any): Promise<ProjectDocument | null> => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("projects", "view");
		let project: ProjectDocument;
		try {
			project = await ctx.orgEntity("projects", args.id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in projects:")) {
				return null;
			}
			throw error;
		}


		const visibleProjects = await ctx.scopedToActor("projects", 
			[project],
			(item) => item.assignedUserIds
		);
		if (visibleProjects.length === 0) return null;

		return project;
	},
});

// Self-contained payload for the list-page detail drawer: the project plus its
// resolved client (with primary address), assignee names, related
// quote/invoice/task rollups, and recent activity.
interface ProjectPreview {
	project: {
		_id: Id<"projects">;
		title: string;
		status: ProjectDocument["status"];
		projectType: ProjectDocument["projectType"];
		projectNumber: string | null;
		description: string | null;
		startDate: number | null;
		endDate: number | null;
		completedAt: number | null;
		createdAt: number;
	};
	client: {
		_id: Id<"clients">;
		companyName: string;
		address: string | null;
	} | null;
	assignees: Array<{ _id: Id<"users">; name: string }>;
	related: {
		quotes: { count: number; total: number };
		invoices: {
			count: number;
			total: number;
			outstanding: number;
			paid: number;
		};
		tasks: { count: number; open: number };
	};
	activities: Array<{
		_id: Id<"activities">;
		description: string;
		activityType: string;
		timestamp: number;
		userName: string;
	}>;
}

/**
 * Get a compact, self-contained preview of a project for the detail drawer.
 * Resolves the client (with primary address) + assignee names, rolls up related
 * quotes/invoices/tasks with ACCURATE totals recomputed from line items (stored
 * totals can be stale), and returns the project's activity from the last 7 days.
 */
export const getPreview = optionalUserQuery({
	args: { id: v.id("projects") },
	handler: async (ctx, args: any): Promise<ProjectPreview | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("projects", "view");

		let project: ProjectDocument;
		try {
			project = await ctx.orgEntity("projects", args.id);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Entity not found in projects:")
			) {
				return null;
			}
			throw error;
		}

		const visible = await ctx.scopedToActor("projects", 
			[project],
			(item) => item.assignedUserIds
		);
		if (visible.length === 0) return null;

		// Cross-cutting read: gate each child bucket independently — never
		// return an object type the caller can't view (PRD rule).
		const canViewClient = await ctx.gateRead("clients");
		const canViewQuotes = await ctx.gateRead("quotes");
		const canViewInvoices = await ctx.gateRead("invoices");
		const canViewTasks = await ctx.gateRead("tasks");

		// Resolve client + its primary address (one-line composed string)
		const clientDoc = canViewClient ? await ctx.db.get(project.clientId) : null;
		let clientAddress: string | null = null;
		if (clientDoc) {
			const primaryProperty = await ctx.db
				.query("clientProperties")
				.withIndex("by_primary", (q: any) =>
					q.eq("clientId", clientDoc._id).eq("isPrimary", true)
				)
				.first();
			if (primaryProperty) {
				clientAddress =
					[
						primaryProperty.streetAddress,
						primaryProperty.city,
						[primaryProperty.state, primaryProperty.zipCode]
							.filter(Boolean)
							.join(" "),
					]
						.filter(Boolean)
						.join(", ") || null;
			}
		}
		const client = clientDoc
			? {
					_id: clientDoc._id,
					companyName: clientDoc.companyName,
					address: clientAddress,
				}
			: null;

		// Resolve assignee names
		const assignees: Array<{ _id: Id<"users">; name: string }> = [];
		for (const userId of project.assignedUserIds ?? []) {
			const userDoc = await ctx.db.get(userId);
			if (userDoc) {
				assignees.push({
					_id: userDoc._id,
					name: userDoc.name || userDoc.email,
				});
			}
		}

		// Related records (project-scoped; the project itself is already org-scoped).
		// Each bucket is skipped entirely when the caller can't view that object type.
		const quotes = canViewQuotes
			? await ctx.db
					.query("quotes")
					.withIndex("by_project", (q: any) => q.eq("projectId", args.id))
					.collect()
			: [];
		const invoices = canViewInvoices
			? await ctx.db
					.query("invoices")
					.withIndex("by_project", (q: any) => q.eq("projectId", args.id))
					.collect()
			: [];
		const tasks = canViewTasks
			? await ctx.db
					.query("tasks")
					.withIndex("by_project", (q: any) => q.eq("projectId", args.id))
					.collect()
			: [];

		// Quote totals: recompute from line items (stored quote.total can be stale)
		// Recompute totals concurrently; each call reads its quote's line items,
		// so a sequential loop would serialize one DB round-trip per quote.
		const quoteTotals = await Promise.all(
			quotes.map((quote) =>
				calculateQuoteTotals(ctx, quote._id, {
					discountEnabled: quote.discountEnabled,
					discountAmount: quote.discountAmount,
					discountType: quote.discountType,
					taxEnabled: quote.taxEnabled,
					taxRate: quote.taxRate,
				})
			)
		);
		const quotesTotal = quoteTotals.reduce((sum, { total }) => sum + total, 0);

		// Invoice totals: recompute subtotal from line items, apply stored
		// discount/tax amounts (mirrors invoices.list / getWithPayments).
		// Fetch each invoice's line items concurrently to avoid a serial DB
		// waterfall (one round-trip per invoice).
		const invoiceTotals = await Promise.all(
			invoices.map(async (invoice) => {
				const lineItems = await ctx.db
					.query("invoiceLineItems")
					.withIndex("by_invoice", (q: any) => q.eq("invoiceId", invoice._id))
					.collect();
				const subtotal = lineItems.reduce(
					(sum: number, li: Doc<"invoiceLineItems">) => sum + li.total,
					0
				);
				let total = subtotal;
				if (invoice.discountAmount) total -= invoice.discountAmount;
				if (invoice.taxAmount) total += invoice.taxAmount;
				return { total, status: invoice.status };
			})
		);
		let invoicesTotal = 0;
		let invoicesOutstanding = 0;
		let invoicesPaid = 0;
		for (const { total, status } of invoiceTotals) {
			invoicesTotal += total;
			if (status === "paid") {
				invoicesPaid++;
			} else if (status !== "cancelled") {
				invoicesOutstanding += total;
			}
		}

		const tasksOpen = tasks.filter(
			(t: Doc<"tasks">) => t.status !== "completed" && t.status !== "cancelled"
		).length;

		// Recent activity for this project (last 7 days). Activities are keyed
		// generically by entityType/entityId, so query by_entity then filter.
		const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const activityRows = await ctx.db
			.query("activities")
			.withIndex("by_entity", (q: any) =>
				q.eq("entityType", "project").eq("entityId", args.id as string)
			)
			.filter((q: any) =>
				q.and(
					q.eq(q.field("orgId"), orgId),
					q.eq(q.field("isVisible"), true),
					q.gte(q.field("timestamp"), cutoff)
				)
			)
			.order("desc")
			.take(20);

		const userNameCache = new Map<string, string>();
		const activities: ProjectPreview["activities"] = [];
		for (const activity of activityRows) {
			let userName = userNameCache.get(activity.userId);
			if (userName === undefined) {
				const actor = await ctx.db.get(activity.userId);
				userName = actor ? actor.name || actor.email : "Someone";
				userNameCache.set(activity.userId, userName);
			}
			activities.push({
				_id: activity._id,
				description: activity.description,
				activityType: activity.activityType,
				timestamp: activity.timestamp,
				userName,
			});
		}

		return {
			project: {
				_id: project._id,
				title: project.title,
				status: project.status,
				projectType: project.projectType,
				projectNumber: project.projectNumber ?? null,
				description: project.description ?? null,
				startDate: project.startDate ?? null,
				endDate: project.endDate ?? null,
				completedAt: project.completedAt ?? null,
				createdAt: project._creationTime,
			},
			client,
			assignees,
			related: {
				quotes: { count: quotes.length, total: quotesTotal },
				invoices: {
					count: invoices.length,
					total: invoicesTotal,
					outstanding: invoicesOutstanding,
					paid: invoicesPaid,
				},
				tasks: { count: tasks.length, open: tasksOpen },
			},
			activities,
		};
	},
});

/**
 * Create a new project
 */
export const create = userMutation({
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
	handler: async (ctx, args: any): Promise<ProjectId> => {
		await ctx.requireLevel("projects", "modify");

		// Validate title is not empty
		if (!args.title.trim()) {
			throw new Error("Project title is required");
		}

		// Validate dates if provided
		if (args.startDate && args.endDate && args.startDate > args.endDate) {
			throw new Error("Start date cannot be after end date");
		}

		const assignedUserIds = await resolveScopedCreateAssignees(
			ctx,
			args.assignedUserIds
		);
		const projectId = await createProjectWithOrg(ctx, {
			...args,
			assignedUserIds,
		});

		// Get the created project for activity logging and aggregates
		const project = await ctx.db.get(projectId);
		if (project) {
			await ActivityHelpers.projectCreated(ctx, project as ProjectDocument);
			await AggregateHelpers.addProject(ctx, project as ProjectDocument);
			await emitRecordCreatedEvent(
				ctx,
				(project as ProjectDocument).orgId,
				"project",
				(project as ProjectDocument)._id,
				"projects.create"
			);
		}

		return projectId;
	},
});

/**
 * Bulk create projects from CSV import
 */
export const bulkCreate = userMutation({
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
		ctx: UserMutationCtx,
		args: any
	): Promise<Array<{ success: boolean; id?: ProjectId; error?: string }>> => {
		await ctx.requireLevel("projects", "modify");

		const results: Array<{
			success: boolean;
			id?: ProjectId;
			error?: string;
		}> = [];

		const userOrgId = ctx.orgId;

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
				const assignedUserIds = await resolveScopedCreateAssignees(
					ctx,
					projectCreateData.assignedUserIds
				);
				const projectId = await createProjectWithOrg(ctx, {
					...projectCreateData,
					clientId,
					assignedUserIds,
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
export const update = userMutation({
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
	handler: async (ctx, args: any): Promise<ProjectId> => {
		await ctx.requireLevel("projects", "modify");

		const { id, ...updates } = args;

		// Validate title is not empty if being updated
		if (updates.title !== undefined && !updates.title.trim()) {
			throw new Error("Project title cannot be empty");
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates) as Partial<ProjectDocument>;
		requireUpdates(filteredUpdates);

		// Get current project for date validation
		const currentProject = await ctx.orgEntity("projects", id);
		await ctx.requireRecordScope(
			"projects",
			() => currentProject.assignedUserIds?.includes(ctx.user._id) ?? false
		);
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

		// Compute field-level changes before applying the update
		const changes = computeFieldChanges(
			"project",
			currentProject as unknown as Record<string, unknown>,
			filteredUpdates as Record<string, unknown>
		);

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
				await ActivityHelpers.projectCompleted(
					ctx,
					project as ProjectDocument,
					changes
				);
			} else {
				await ActivityHelpers.projectUpdated(
					ctx,
					project as ProjectDocument,
					changes
				);
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

			await emitRecordUpdatedEvent(
				ctx,
				(project as ProjectDocument).orgId,
				"project",
				(project as ProjectDocument)._id,
				Object.keys(filteredUpdates).filter((key) => key !== "updatedAt"),
				"projects.update"
			);
		}

		return id;
	},
});

/**
 * Delete a project with cascading deletion of related entities
 */
export const remove = userMutation({
	args: { id: v.id("projects") },
	handler: async (ctx, args: any): Promise<ProjectId> => {
		await ctx.requireLevel("projects", "delete");

		const project = await ctx.orgEntity("projects", args.id); // Validate access
		await ctx.requireRecordScope(
			"projects",
			() => project.assignedUserIds?.includes(ctx.user._id) ?? false
		);

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
export const search = optionalUserQuery({
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
	handler: async (ctx, args: any): Promise<ProjectDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("projects", "view");

		let projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		projects = await ctx.scopedToActor("projects", projects, (project) => project.assignedUserIds);

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
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<ProjectStats> => {
		const orgId = ctx.orgId;
		if (!orgId) {
			return createEmptyProjectStats();
		}
		await ctx.requireLevel("projects", "view");

		let projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		projects = await ctx.scopedToActor("projects", projects, (project) => project.assignedUserIds);

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
export const getByAssignee = optionalUserQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, args: any): Promise<ProjectDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("projects", "view");

		// Validate user belongs to organization
		await validateUserAccess(ctx, [args.userId], orgId);


		const projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		// Filter projects where user is assigned
		let filteredProjects = projects.filter(
			(project: any) =>
				project.assignedUserIds && project.assignedUserIds.includes(args.userId)
		);

		filteredProjects = await ctx.scopedToActor("projects", filteredProjects, (project) => project.assignedUserIds);

		return filteredProjects;
	},
});

/**
 * Get projects with upcoming deadlines
 */
// TODO: Candidate for deletion if confirmed unused.
export const getUpcomingDeadlines = optionalUserQuery({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args: any): Promise<ProjectDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("projects", "view");

		const daysAhead = args.days || 7;

		let projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		projects = await ctx.scopedToActor("projects", projects, (project) => project.assignedUserIds);

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
export const getOverdue = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<ProjectDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("projects", "view");

		const projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q: any) => q.eq("orgId", orgId))
			.collect();

		const now = Date.now();

		const overdue = projects.filter(
			(project: any) =>
				project.endDate &&
				project.endDate < now &&
				project.status !== "completed" &&
				project.status !== "cancelled"
		);
		return ctx.scopedToActor("projects", overdue, (p) => p.assignedUserIds);
	},
});
