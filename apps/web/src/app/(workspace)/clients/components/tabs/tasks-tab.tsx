"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, ClipboardList } from "lucide-react";

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

function getStatusDotColor(status: string) {
	switch (status) {
		case "completed":
			return "bg-green-500";
		case "in-progress":
			return "bg-yellow-500";
		case "pending":
			return "bg-blue-500";
		case "cancelled":
			return "bg-red-500";
		default:
			return "bg-gray-500";
	}
}

interface TasksTabProps {
	tasks: Doc<"tasks">[] | undefined;
	onAddTask: () => void;
}

export function TasksTab({ tasks, onAddTask }: TasksTabProps) {
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
					{tasks.map((task) => (
						<div
							key={task._id}
							className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
						>
							<div
								className={`w-2 h-2 rounded-full shrink-0 ${getStatusDotColor(task.status)}`}
							/>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-foreground truncate">
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
					))}
				</div>
			) : (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
						<ClipboardList className="h-6 w-6 text-muted-foreground" />
					</div>
					<p className="text-sm text-muted-foreground">
						No tasks for this client yet.
					</p>
				</div>
			)}
		</div>
	);
}
