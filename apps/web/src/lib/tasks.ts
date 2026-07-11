import type { Task } from "@/types/task";

// Task in terminal state (completed or cancelled) needs no action.
export function isTerminalStatus(status: Task["status"]): boolean {
	return status === "completed" || status === "cancelled";
}
