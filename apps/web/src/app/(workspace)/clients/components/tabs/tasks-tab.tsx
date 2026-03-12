"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { RecordTasksTab } from "@/components/shared/record-tasks-tab";

interface TasksTabProps {
	tasks: Doc<"tasks">[] | undefined;
	onAddTask: () => void;
}

export function TasksTab({ tasks, onAddTask }: TasksTabProps) {
	return (
		<RecordTasksTab
			tasks={tasks}
			onAddTask={onAddTask}
			entityType="client"
		/>
	);
}
