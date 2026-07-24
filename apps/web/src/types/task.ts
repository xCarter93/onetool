import { Id } from "@onetool/backend/convex/_generated/dataModel";

/**
 * Task interface that matches the tasks table schema in Convex
 */
export interface Task {
	_id: Id<"tasks">;
	title: string;
	description?: string;
	clientId?: Id<"clients">;
	projectId?: Id<"projects">;
	propertyId?: Id<"clientProperties">;
	type?: "internal" | "external";
	date: number;
	startTime?: string;
	endTime?: string;
	assigneeUserId?: Id<"users">;
	status: "pending" | "in-progress" | "completed" | "cancelled";
	priority?: "low" | "medium" | "high" | "urgent";
	repeat?: "none" | "daily" | "weekly" | "monthly" | "yearly";
	repeatUntil?: number;
}

/**
 * Task status type for use in components
 */
export type TaskStatus = Task["status"];

/**
 * Task priority type for use in components
 */
export type TaskPriority = Task["priority"];

/**
 * Task repeat type for use in components
 */
export type TaskRepeat = Task["repeat"];
