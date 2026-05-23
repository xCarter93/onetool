import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { getOptionalOrgId } from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Get all calendar events (projects and tasks) for a date range
 * Returns a normalized structure suitable for calendar rendering
 */
export const getCalendarEvents = optionalUserQuery({
	args: {
		startDate: v.number(), // Unix timestamp
		endDate: v.number(), // Unix timestamp
	},
	handler: async (ctx, args) => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return { projects: [], tasks: [] };
		}

		// Fetch all projects for the organization
		const allProjects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Fetch all tasks within the date range
		const allTasks = await ctx.db
			.query("tasks")
			.withIndex("by_date", (q) =>
				q
					.eq("orgId", userOrgId)
					.gte("date", args.startDate)
					.lte("date", args.endDate)
			)
			.collect();

		// Filter projects that overlap with the date range
		const projects = allProjects.filter((project) => {
			// Projects without dates are not shown on calendar
			if (!project.startDate) return false;

			const projectStart = project.startDate;
			const projectEnd = project.endDate || project.startDate;

			// Check if project overlaps with requested range
			return projectEnd >= args.startDate && projectStart <= args.endDate;
		});

		// Get client data for all events
		const clientIds = new Set<string>();
		projects.forEach((p) => clientIds.add(p.clientId));
		allTasks.forEach((t) => {
			if (t.clientId) clientIds.add(t.clientId);
		});

		const clientPromises = Array.from(clientIds).map(async (id) => {
			const client = await ctx.db.get(id as Id<"clients">);
			// Return the client if it exists (already properly typed)
			return client;
		});

		const clientResults = await Promise.all(clientPromises);
		const clientMap = new Map<Id<"clients">, Doc<"clients">>(
			clientResults
				.filter((c): c is Doc<"clients"> => c !== null)
				.map((c) => [c._id, c])
		);

		// Transform projects to calendar events
		const projectEvents = projects.map((project) => {
			const client = clientMap.get(project.clientId);
			return {
				id: project._id,
				type: "project" as const,
				title: project.title,
				description: project.description,
				startDate: project.startDate!,
				endDate: project.endDate,
				status: project.status,
				clientId: project.clientId,
				clientName: client?.companyName || "Unknown Client",
				assignedUserIds: project.assignedUserIds,
				projectNumber: project.projectNumber,
			};
		});

		// Transform tasks to calendar events
		const taskEvents = allTasks.map((task) => {
			const client = task.clientId ? clientMap.get(task.clientId) : undefined;
			return {
				id: task._id,
				type: "task" as const,
				title: task.title,
				description: task.description,
				startDate: task.date,
				startTime: task.startTime,
				endTime: task.endTime,
				status: task.status,
				clientId: task.clientId,
				clientName:
					client?.companyName ||
					(task.type === "internal" ? "Internal Task" : "Unknown Client"),
				assigneeUserId: task.assigneeUserId,
				projectId: task.projectId,
			};
		});

		return {
			projects: projectEvents,
			tasks: taskEvents,
		};
	},
});
