import {
	Bell,
	ListTodo,
	MessagesSquare,
	Play,
	type LucideIcon,
} from "lucide-react";
import type { ActionNodeConfig } from "./node-types";

/**
 * Per-action-type visual identity, shared by the canvas node card
 * (action-node-rf.tsx) and the config panel header (action-config.tsx) so
 * both surfaces stay in sync with the step picker.
 */
export const ACTION_META: Record<
	ActionNodeConfig["action"]["type"],
	{
		icon: LucideIcon;
		bg: string;
		fg: string;
		badge: string;
		name: string;
		description: string;
	}
> = {
	update_field: {
		icon: Play,
		bg: "bg-green-50 dark:bg-green-950/40",
		fg: "text-green-600 dark:text-green-400",
		badge: "Actions",
		name: "Update Record",
		description: "Set a field on the record in scope.",
	},
	create_task: {
		icon: ListTodo,
		bg: "bg-green-50 dark:bg-green-950/40",
		fg: "text-green-600 dark:text-green-400",
		badge: "Actions",
		name: "Create Task",
		description: "Add a task to your workspace.",
	},
	send_notification: {
		icon: Bell,
		bg: "bg-pink-50 dark:bg-pink-950/40",
		fg: "text-pink-600 dark:text-pink-400",
		badge: "Communication",
		name: "Send Notification",
		description: "Notify an admin, the record owner, or a teammate.",
	},
	send_team_message: {
		icon: MessagesSquare,
		bg: "bg-pink-50 dark:bg-pink-950/40",
		fg: "text-pink-600 dark:text-pink-400",
		badge: "Communication",
		name: "Send Team Message",
		description: "Broadcast a message to your team.",
	},
};
