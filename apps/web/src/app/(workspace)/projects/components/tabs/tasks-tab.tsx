"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, ClipboardList, CheckCircle2, Circle } from "lucide-react";

function formatDate(timestamp?: number) {
	if (!timestamp) return "No date";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function getStatusColor(status: string) {
	switch (status) {
		case "completed":
			return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
		case "in-progress":
			return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
		case "pending":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
		case "cancelled":
			return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
	}
}

interface TasksTabProps {
	tasks: Doc<"tasks">[] | undefined;
	onAddTask: () => void;
}

export function TasksTab({ tasks, onAddTask }: TasksTabProps) {
	const [updatingTasks, setUpdatingTasks] = useState<Set<Id<"tasks">>>(
		new Set()
	);
	const updateTaskMutation = useMutation(api.tasks.update);
	const completeTaskMutation = useMutation(api.tasks.complete);

	const handleToggleComplete = async (task: Doc<"tasks">) => {
		setUpdatingTasks((prev) => new Set(prev).add(task._id));
		try {
			if (task.status === "completed") {
				await updateTaskMutation({ id: task._id, status: "pending" });
			} else {
				await completeTaskMutation({ id: task._id });
			}
		} catch (error) {
			console.error("Error updating task:", error);
		} finally {
			setUpdatingTasks((prev) => {
				const newSet = new Set(prev);
				newSet.delete(task._id);
				return newSet;
			});
		}
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Tasks ({tasks?.length ?? 0})
				</h3>
				<Button intent="outline" size="sm" onPress={onAddTask}>
					<Plus className="h-4 w-4 mr-2" />
					Add Task
				</Button>
			</div>
			<Separator className="mb-4" />

			{tasks && tasks.length > 0 ? (
				<div className="space-y-2">
					{tasks.map((task) => {
						const isUpdating = updatingTasks.has(task._id);
						return (
							<div
								key={task._id}
								className={cn(
									"flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors",
									task.status === "completed" && "opacity-60"
								)}
							>
								<button
									onClick={() => handleToggleComplete(task)}
									disabled={isUpdating}
									className={cn(
										"p-0.5 rounded-full transition-colors shrink-0",
										"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isUpdating && "opacity-50 cursor-not-allowed"
									)}
								>
									{task.status === "completed" ? (
										<CheckCircle2 className="h-5 w-5 text-green-600" />
									) : (
										<Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
									)}
								</button>
								<div className="flex-1 min-w-0">
									<p
										className={cn(
											"text-sm font-medium text-foreground truncate",
											task.status === "completed" &&
												"line-through text-muted-foreground"
										)}
									>
										{task.title}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatDate(task.date)}
									</p>
								</div>
								<Badge
									className={getStatusColor(task.status)}
									variant="outline"
								>
									{task.status}
								</Badge>
							</div>
						);
					})}
				</div>
			) : (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
						<ClipboardList className="h-6 w-6 text-muted-foreground" />
					</div>
					<p className="text-sm text-muted-foreground">
						No tasks for this project yet.
					</p>
				</div>
			)}
		</div>
	);
}
