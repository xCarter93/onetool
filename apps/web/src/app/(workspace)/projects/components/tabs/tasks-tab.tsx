"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { RecurringTaskSetup } from "./recurring-task-setup";

interface TasksTabProps {
	projectId: Doc<"projects">["_id"];
	tasks: Doc<"tasks">[] | undefined;
	onAddTask: () => void;
}

export function TasksTab({ projectId, tasks, onAddTask }: TasksTabProps) {
	return (
		<RecurringTaskSetup
			key={projectId}
			projectId={projectId}
			tasks={tasks}
			onAddTask={onAddTask}
		/>
	);
}
