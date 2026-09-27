import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { StoredOp } from "./db";
import { overlayTaskOps } from "./field-patch";
import { saveOffline } from "./hooks";

/**
 * Queues a checkbox or swipe toggle. `tasks.complete` rejects a completed task, so
 * un-completing goes through `update`, expecting the status the phone last showed.
 */
export function queueTaskToggle(
	task: { id: string; title?: string; status?: string },
	done: boolean,
	ops: StoredOp[],
): Promise<boolean> {
	const id = task.id as Id<"tasks">;
	const title = task.title ? `: ${task.title}` : "";
	if (done) {
		return saveOffline("tasks.complete", { id }, { display: { title: `Complete${title}` } });
	}
	const chainOps = ops.filter((op) => op.chainKey === `task:${task.id}`);
	return saveOffline(
		"tasks.update",
		{
			id,
			status: "pending",
			expectedValues: { status: overlayTaskOps({ status: task.status }, chainOps).status },
		},
		{ display: { title: `Mark not done${title}` } },
	);
}
