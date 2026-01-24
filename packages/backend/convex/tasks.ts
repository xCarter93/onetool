import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
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
 * Task/Schedule operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like scheduling, status transitions,
 * project associations, recurring tasks) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

// Define specific types for task operations
type TaskDocument = Doc<"tasks">;
type TaskId = Id<"tasks">;

/**
 * Get a task with org validation (wrapper for shared utility)
 */
async function getTaskWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"tasks">
): Promise<Doc<"tasks"> | null> {
	return await getEntityWithOrgValidation(ctx, "tasks", id, "Task");
}

/**
 * Get a task, throwing if not found (wrapper for shared utility)
 */
async function getTaskOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"tasks">
): Promise<Doc<"tasks">> {
	return await getEntityOrThrow(ctx, "tasks", id, "Task");
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
 * Validate project access (wrapper for shared utility)
 */
async function validateProjectAccess(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	await validateParentAccess(
		ctx,
		"projects",
		projectId,
		"Project",
		existingOrgId
	);
}

/**
 * Validate user exists and belongs to user's org (if provided)
 * Note: This validation is task-specific due to membership check
 */
async function validateUserAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));
	const user = await ctx.db.get(userId);

	if (!user) {
		throw new Error("User not found");
	}

	await requireMembership(ctx, userId, userOrgId);
}

/**
 * Generate recurring task dates based on frequency and end date
 * Note: Expects timestamps already normalized to UTC midnight from frontend
 */
function generateRecurringTaskDates(
	startDate: number,
	frequency: "daily" | "weekly" | "monthly" | "yearly",
	endDate: number
): number[] {
	const dates: number[] = [];
	const current = new Date(startDate);
	const end = new Date(endDate);

	// Dates should already be normalized to UTC midnight from frontend
	// Just iterate through them without further normalization
	while (current <= end) {
		dates.push(current.getTime());

		// Move to next occurrence based on frequency
		switch (frequency) {
			case "daily":
				current.setUTCDate(current.getUTCDate() + 1);
				break;
			case "weekly":
				current.setUTCDate(current.getUTCDate() + 7);
				break;
			case "monthly":
				current.setUTCMonth(current.getUTCMonth() + 1);
				break;
			case "yearly":
				current.setUTCFullYear(current.getUTCFullYear() + 1);
				break;
		}
	}

	return dates;
}

/**
 * Create a task with automatic orgId assignment
 */
async function createTaskWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"tasks">, "_id" | "_creationTime" | "orgId"> & {
		parentTaskId?: Id<"tasks">;
	}
): Promise<Id<"tasks">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// For external tasks (or untyped legacy tasks), validate client access
	const taskType = data.type || "external"; // Default to external for backward compatibility
	if (taskType === "external") {
		if (!data.clientId) {
			throw new Error("External tasks require a client");
		}
		await validateClientAccess(ctx, data.clientId);
	}

	// Validate project access if provided
	if (data.projectId) {
		await validateProjectAccess(ctx, data.projectId);
	}

	// Validate assignee if provided
	if (data.assigneeUserId) {
		await validateUserAccess(ctx, data.assigneeUserId);
	}

	const taskData = {
		...data,
		orgId: userOrgId,
	};

	return await ctx.db.insert("tasks", taskData);
}

/**
 * Update a task with validation
 */
async function updateTaskWithValidation(
	ctx: MutationCtx,
	id: Id<"tasks">,
	updates: Partial<Doc<"tasks">>
): Promise<void> {
	// Validate task exists and belongs to user's org
	const existingTask = await getTaskOrThrow(ctx, id);

	// Determine task type (use updated type if provided, otherwise use existing)
	const taskType =
		updates.type !== undefined ? updates.type : existingTask.type || "external";

	// For external tasks, validate client
	if (taskType === "external") {
		// If changing to external, must have a client
		const clientId =
			updates.clientId !== undefined ? updates.clientId : existingTask.clientId;
		if (!clientId) {
			throw new Error("External tasks require a client");
		}
		// Validate new client if being updated
		if (updates.clientId) {
			await validateClientAccess(ctx, updates.clientId);
		}
	}

	// Validate new project if being updated
	if (updates.projectId) {
		await validateProjectAccess(ctx, updates.projectId);
	}

	// Validate new assignee if being updated
	if (updates.assigneeUserId) {
		await validateUserAccess(ctx, updates.assigneeUserId);
	}

	// Update the task
	await ctx.db.patch(id, updates);
}

// Interface for task statistics
interface TaskStats {
	total: number;
	byStatus: {
		pending: number;
		inProgress: number;
		completed: number;
		cancelled: number;
	};
	todayTasks: number;
	overdue: number;
	thisWeek: number;
	recurring: number;
}

function createEmptyTaskStats(): TaskStats {
	return {
		total: 0,
		byStatus: {
			pending: 0,
			inProgress: 0,
			completed: 0,
			cancelled: 0,
		},
		todayTasks: 0,
		overdue: 0,
		thisWeek: 0,
		recurring: 0,
	};
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all tasks for the current user's organization
 */
export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
		assigneeUserId: v.optional(v.id("users")),
		dateFrom: v.optional(v.number()),
		dateTo: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<TaskDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned tasks
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		let tasks: TaskDocument[];

		// Start with the most specific query available
		if (args.assigneeUserId) {
			await validateUserAccess(ctx, args.assigneeUserId, orgId);
			tasks = await ctx.db
				.query("tasks")
				.withIndex("by_assignee", (q) =>
					q.eq("assigneeUserId", args.assigneeUserId)
				)
				.collect();
		} else if (args.projectId) {
			await validateProjectAccess(ctx, args.projectId, orgId);
			tasks = await ctx.db
				.query("tasks")
				.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
				.collect();
		} else if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			tasks = await ctx.db
				.query("tasks")
				.withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
				.collect();
		} else if (args.dateFrom && args.dateTo) {
			tasks = await ctx.db
				.query("tasks")
				.withIndex("by_date", (q) =>
					q
						.eq("orgId", orgId)
						.gte("date", args.dateFrom!)
						.lte("date", args.dateTo!)
				)
				.collect();
		} else {
			tasks = await ctx.db
				.query("tasks")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
		}

		// Apply additional filters
		if (args.status) {
			tasks = tasks.filter((task) => task.status === args.status);
		}

		if (args.clientId && !args.assigneeUserId && !args.projectId) {
			tasks = tasks.filter((task) => task.clientId === args.clientId);
		}

		if (args.projectId && !args.assigneeUserId) {
			tasks = tasks.filter((task) => task.projectId === args.projectId);
		}

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			tasks = tasks.filter((task) => task.assigneeUserId === currentUserId);
		}

		// Sort by date
		return tasks.sort((a, b) => a.date - b.date);
	},
});

/**
 * Get a specific task by ID
 */
export const get = query({
	args: { id: v.id("tasks") },
	handler: async (ctx, args): Promise<TaskDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const task = await getTaskWithValidation(ctx, args.id);
		if (!task) {
			return null;
		}

		// Check if user is a member (non-admin) - members can only see their assigned tasks
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		// If user is a member, verify they're assigned to this task
		if (isUserMember && currentUserId) {
			if (task.assigneeUserId !== currentUserId) {
				// Return null if member is not assigned (same as task not found)
				return null;
			}
		}

		return task;
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new task
 */
export const create = mutation({
	args: {
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
		type: v.optional(v.union(v.literal("internal"), v.literal("external"))),
		title: v.string(),
		description: v.optional(v.string()),
		date: v.number(),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		assigneeUserId: v.optional(v.id("users")),
		status: v.union(
			v.literal("pending"),
			v.literal("in-progress"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		repeat: v.optional(
			v.union(
				v.literal("none"),
				v.literal("daily"),
				v.literal("weekly"),
				v.literal("monthly"),
				v.literal("yearly")
			)
		),
		repeatUntil: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<TaskId> => {
		// Validate title is not empty
		if (!args.title.trim()) {
			throw new Error("Task title is required");
		}

		// Default to external type for backward compatibility
		const taskType = args.type || "external";

		// Validate client requirement for external tasks
		if (taskType === "external" && !args.clientId) {
			throw new Error("External tasks require a client");
		}

		// Validate time format if provided
		if (
			args.startTime &&
			!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(args.startTime)
		) {
			throw new Error("Invalid start time format. Use HH:MM format");
		}

		if (
			args.endTime &&
			!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(args.endTime)
		) {
			throw new Error("Invalid end time format. Use HH:MM format");
		}

		// Validate time logic
		if (args.startTime && args.endTime && args.startTime >= args.endTime) {
			throw new Error("End time must be after start time");
		}

		// Validate repeat logic
		if (args.repeat && args.repeat !== "none" && !args.repeatUntil) {
			throw new Error("Repeat end date is required for recurring tasks");
		}

		if (args.repeatUntil && (!args.repeat || args.repeat === "none")) {
			throw new Error(
				"Repeat frequency is required when repeat end date is set"
			);
		}

		if (args.repeatUntil && args.repeatUntil <= args.date) {
			throw new Error("Repeat end date must be after task date");
		}

		// If recurring task with end date, generate all instances immediately
		if (args.repeat && args.repeat !== "none" && args.repeatUntil) {
			const dates = generateRecurringTaskDates(
				args.date,
				args.repeat,
				args.repeatUntil
			);

			// Create parent task with the first normalized date
			const parentTaskId = await createTaskWithOrg(ctx, {
				...args,
				date: dates[0], // Use normalized first date
			});

			// Get the parent task for activity logging
			const parentTask = await ctx.db.get(parentTaskId);
			if (parentTask) {
				await ActivityHelpers.taskCreated(ctx, parentTask as TaskDocument);
			}

			// Create child tasks for remaining occurrences
			for (let i = 1; i < dates.length; i++) {
				await createTaskWithOrg(ctx, {
					...args,
					date: dates[i],
					parentTaskId: parentTaskId, // Link to parent
				});
			}

			return parentTaskId;
		}

		// Single task or recurring without end date
		const taskId = await createTaskWithOrg(ctx, args);

		// Get the created task for activity logging
		const task = await ctx.db.get(taskId);
		if (task) {
			await ActivityHelpers.taskCreated(ctx, task as TaskDocument);
		}

		return taskId;
	},
});

/**
 * Update a task
 */
export const update = mutation({
	args: {
		id: v.id("tasks"),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
		type: v.optional(v.union(v.literal("internal"), v.literal("external"))),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		date: v.optional(v.number()),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		assigneeUserId: v.optional(v.id("users")),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		repeat: v.optional(
			v.union(
				v.literal("none"),
				v.literal("daily"),
				v.literal("weekly"),
				v.literal("monthly"),
				v.literal("yearly")
			)
		),
		repeatUntil: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<TaskId> => {
		const { id, ...updates } = args;

		// Validate title is not empty if being updated
		if (updates.title !== undefined && !updates.title.trim()) {
			throw new Error("Task title cannot be empty");
		}

		// Validate time format if provided
		if (
			updates.startTime &&
			!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(updates.startTime)
		) {
			throw new Error("Invalid start time format. Use HH:MM format");
		}

		if (
			updates.endTime &&
			!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(updates.endTime)
		) {
			throw new Error("Invalid end time format. Use HH:MM format");
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Get current task for validation
		const currentTask = await getTaskOrThrow(ctx, id);
		const oldStatus = currentTask.status;

		// Validate time logic with current or updated values
		const startTime =
			(filteredUpdates.startTime as string | undefined) ?? currentTask.startTime;
		const endTime =
			(filteredUpdates.endTime as string | undefined) ?? currentTask.endTime;

		if (startTime && endTime && startTime >= endTime) {
			throw new Error("End time must be after start time");
		}

		// Check if task is being completed
		const wasCompleted = currentTask.status === "completed";
		const isBeingCompleted =
			filteredUpdates.status === "completed" && !wasCompleted;

		// If being completed, set completion time
		if (isBeingCompleted) {
			(filteredUpdates as Partial<TaskDocument>).completedAt = Date.now();
		}

		await updateTaskWithValidation(
			ctx,
			id,
			filteredUpdates as Partial<TaskDocument>
		);

		// Get updated task for activity logging
		const task = await ctx.db.get(id);
		if (task) {
			if (isBeingCompleted) {
				await ActivityHelpers.taskCompleted(ctx, task as TaskDocument);
			}

			// Emit status change event if status changed
			if (args.status && args.status !== oldStatus) {
				await emitStatusChangeEvent(
					ctx,
					task.orgId,
					"task",
					task._id,
					oldStatus,
					args.status,
					"tasks.update"
				);
			}
		}

		return id;
	},
});

/**
 * Mark a task as completed
 */
export const complete = mutation({
	args: { id: v.id("tasks") },
	handler: async (ctx, args): Promise<TaskId> => {
		const task = await getTaskOrThrow(ctx, args.id);

		if (task.status === "completed") {
			throw new Error("Task is already completed");
		}

		await ctx.db.patch(args.id, {
			status: "completed",
			completedAt: Date.now(),
		});

		// Log activity
		const updatedTask = await ctx.db.get(args.id);
		if (updatedTask) {
			await ActivityHelpers.taskCompleted(ctx, updatedTask as TaskDocument);
		}

		return args.id;
	},
});

/**
 * Delete a task
 */
export const remove = mutation({
	args: { id: v.id("tasks") },
	handler: async (ctx, args): Promise<TaskId> => {
		await getTaskOrThrow(ctx, args.id); // Validate access
		await ctx.db.delete(args.id);
		return args.id;
	},
});

/**
 * Search tasks
 */
// TODO: Candidate for deletion if confirmed unused.
export const search = query({
	args: {
		query: v.string(),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		clientId: v.optional(v.id("clients")),
		assigneeUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, args): Promise<TaskDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		let tasks = await ctx.db
			.query("tasks")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Filter by status if specified
		if (args.status) {
			tasks = tasks.filter((task) => task.status === args.status);
		}

		// Filter by client if specified
		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			tasks = tasks.filter((task) => task.clientId === args.clientId);
		}

		// Filter by assignee if specified
		if (args.assigneeUserId) {
			await validateUserAccess(ctx, args.assigneeUserId, orgId);
			tasks = tasks.filter(
				(task) => task.assigneeUserId === args.assigneeUserId
			);
		}

		// Search in title and description
		const searchQuery = args.query.toLowerCase();
		return tasks.filter(
			(task: TaskDocument) =>
				task.title.toLowerCase().includes(searchQuery) ||
				(task.description &&
					task.description.toLowerCase().includes(searchQuery))
		);
	},
});

/**
 * Get task statistics for dashboard
 */
export const getStats = query({
	args: {},
	handler: async (ctx): Promise<TaskStats> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return createEmptyTaskStats();

		// Check if user is a member (non-admin) - members can only see their assigned tasks
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		let tasks = await ctx.db
			.query("tasks")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			tasks = tasks.filter((task) => task.assigneeUserId === currentUserId);
		}

		const stats: TaskStats = {
			total: tasks.length,
			byStatus: {
				pending: 0,
				inProgress: 0,
				completed: 0,
				cancelled: 0,
			},
			todayTasks: 0,
			overdue: 0,
			thisWeek: 0,
			recurring: 0,
		};

		const now = Date.now();
		const today = DateUtils.startOfDay(now);
		const tomorrow = DateUtils.addDays(today, 1);
		const nextWeek = DateUtils.addDays(today, 7);

		tasks.forEach((task: TaskDocument) => {
			// Count by status
			if (task.status === "pending") {
				stats.byStatus.pending++;
			} else if (task.status === "in-progress") {
				stats.byStatus.inProgress++;
			} else if (task.status === "completed") {
				stats.byStatus.completed++;
			} else if (task.status === "cancelled") {
				stats.byStatus.cancelled++;
			}

			// Count today's tasks
			if (task.date >= today && task.date < tomorrow) {
				stats.todayTasks++;
			}

			// Count this week's tasks
			if (
				task.date >= today &&
				task.date < nextWeek &&
				(task.status === "pending" || task.status === "in-progress")
			) {
				stats.thisWeek++;
			}

			// Count overdue tasks
			if (
				task.date < today &&
				(task.status === "pending" || task.status === "in-progress")
			) {
				stats.overdue++;
			}

			// Count recurring tasks
			if (task.repeat && task.repeat !== "none") {
				stats.recurring++;
			}
		});

		return stats;
	},
});

/**
 * Get today's tasks
 */
// TODO: Candidate for deletion if confirmed unused.
export const getToday = query({
	args: { assigneeUserId: v.optional(v.id("users")) },
	handler: async (ctx, args): Promise<TaskDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned tasks
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		const today = DateUtils.startOfDay(Date.now());
		const tomorrow = DateUtils.addDays(today, 1);

		let tasks = await ctx.db
			.query("tasks")
			.withIndex("by_date", (q) =>
				q.eq("orgId", orgId).gte("date", today).lt("date", tomorrow)
			)
			.collect();

		// Filter by assignee if specified
		if (args.assigneeUserId) {
			await validateUserAccess(ctx, args.assigneeUserId, orgId);
			tasks = tasks.filter(
				(task) => task.assigneeUserId === args.assigneeUserId
			);
		}

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			tasks = tasks.filter((task) => task.assigneeUserId === currentUserId);
		}

		return tasks.sort((a, b) => {
			// Sort by start time if available, otherwise by creation time
			if (a.startTime && b.startTime) {
				return a.startTime.localeCompare(b.startTime);
			}
			return a._creationTime - b._creationTime;
		});
	},
});

/**
 * Get overdue tasks
 */
export const getOverdue = query({
	args: { assigneeUserId: v.optional(v.id("users")) },
	handler: async (ctx, args): Promise<TaskDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned tasks
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		const today = DateUtils.startOfDay(Date.now());

		let tasks = await ctx.db
			.query("tasks")
			.withIndex("by_date", (q) => q.eq("orgId", orgId).lt("date", today))
			.collect();

		// Only include pending and in-progress tasks (not completed or cancelled)
		tasks = tasks.filter(
			(task) => task.status === "pending" || task.status === "in-progress"
		);

		// Filter by assignee if specified
		if (args.assigneeUserId) {
			await validateUserAccess(ctx, args.assigneeUserId, orgId);
			tasks = tasks.filter(
				(task) => task.assigneeUserId === args.assigneeUserId
			);
		}

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			tasks = tasks.filter((task) => task.assigneeUserId === currentUserId);
		}

		return tasks.sort((a, b) => b.date - a.date); // Most recent overdue first
	},
});

/**
 * Get upcoming tasks (due within the next 7 days) for dashboard/home page
 */
export const getUpcoming = query({
	args: {
		assigneeUserId: v.optional(v.id("users")),
		daysAhead: v.optional(v.number()), // Default to 7 days if not specified
	},
	handler: async (ctx, args): Promise<TaskDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Check if user is a member (non-admin) - members can only see their assigned tasks
		const isUserMember = await isMember(ctx);
		const currentUserId = await getCurrentUserId(ctx);

		const today = DateUtils.startOfDay(Date.now());
		const daysAhead = args.daysAhead || 7;
		const futureDate = DateUtils.addDays(today, daysAhead);

		let tasks = await ctx.db
			.query("tasks")
			.withIndex("by_date", (q) =>
				q.eq("orgId", orgId).gte("date", today).lt("date", futureDate)
			)
			.collect();

		// Only include pending and in-progress tasks
		tasks = tasks.filter(
			(task) => task.status === "pending" || task.status === "in-progress"
		);

		// Filter by assignee if specified
		if (args.assigneeUserId) {
			await validateUserAccess(ctx, args.assigneeUserId, orgId);
			tasks = tasks.filter(
				(task) => task.assigneeUserId === args.assigneeUserId
			);
		}

		// Filter by assignment if user is a member
		if (isUserMember && currentUserId) {
			tasks = tasks.filter((task) => task.assigneeUserId === currentUserId);
		}

		// Sort by date, then by start time
		return tasks.sort((a, b) => {
			// First sort by date
			if (a.date !== b.date) {
				return a.date - b.date;
			}

			// Then by start time if available
			if (a.startTime && b.startTime) {
				return a.startTime.localeCompare(b.startTime);
			}

			return a._creationTime - b._creationTime;
		});
	},
});

/**
 * Get tasks assigned to a specific user
 */
// TODO: Candidate for deletion if confirmed unused.
export const getByUser = query({
	args: {
		userId: v.id("users"),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("in-progress"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		includeCompleted: v.optional(v.boolean()), // Whether to include completed tasks
	},
	handler: async (ctx, args): Promise<TaskDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Validate the user exists and belongs to the same org
		await validateUserAccess(ctx, args.userId, orgId);

		let tasks = await ctx.db
			.query("tasks")
			.withIndex("by_assignee", (q) => q.eq("assigneeUserId", args.userId))
			.collect();

		// Filter by organization (additional security check)
		tasks = tasks.filter((task) => task.orgId === orgId);

		// Filter by status if specified
		if (args.status) {
			tasks = tasks.filter((task) => task.status === args.status);
		} else if (!args.includeCompleted) {
			// By default, exclude completed and cancelled tasks
			tasks = tasks.filter(
				(task) => task.status === "pending" || task.status === "in-progress"
			);
		}

		// Sort by date, then by start time
		return tasks.sort((a, b) => {
			// First sort by date
			if (a.date !== b.date) {
				return a.date - b.date;
			}

			// Then by start time if available
			if (a.startTime && b.startTime) {
				return a.startTime.localeCompare(b.startTime);
			}

			return a._creationTime - b._creationTime;
		});
	},
});
