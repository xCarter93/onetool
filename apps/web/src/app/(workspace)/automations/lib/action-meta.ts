import {
	Bell,
	FilePlus,
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
		/** Icon-chip background (dual-mode). */
		bg: string;
		/** Icon-chip foreground (dual-mode). */
		fg: string;
		/** Left-accent border classes (dual-mode) for the node card. */
		accent: string;
		badge: string;
		name: string;
		description: string;
	}
> = {
	update_field: {
		icon: Play,
		bg: "bg-green-100 dark:bg-green-400/15",
		fg: "text-green-700 dark:text-green-300",
		accent: "border-l-green-500 dark:border-l-green-400",
		badge: "Actions",
		name: "Update Record",
		description: "Set a field on the record in scope.",
	},
	// The multi-field successor; the editor upgrades update_field to this on
	// load, so it shares Update Record's identity.
	update_fields: {
		icon: Play,
		bg: "bg-green-100 dark:bg-green-400/15",
		fg: "text-green-700 dark:text-green-300",
		accent: "border-l-green-500 dark:border-l-green-400",
		badge: "Actions",
		name: "Update Record",
		description: "Set one or more fields on the record in scope.",
	},
	create_task: {
		icon: ListTodo,
		bg: "bg-green-100 dark:bg-green-400/15",
		fg: "text-green-700 dark:text-green-300",
		accent: "border-l-green-500 dark:border-l-green-400",
		badge: "Actions",
		name: "Create Task",
		description: "Add a task to your workspace.",
	},
	create_record: {
		icon: FilePlus,
		bg: "bg-green-100 dark:bg-green-400/15",
		fg: "text-green-700 dark:text-green-300",
		accent: "border-l-green-500 dark:border-l-green-400",
		badge: "Actions",
		name: "Create Record",
		description: "Create a new client, project, or task.",
	},
	send_notification: {
		icon: Bell,
		bg: "bg-pink-100 dark:bg-pink-400/15",
		fg: "text-pink-700 dark:text-pink-300",
		accent: "border-l-pink-500 dark:border-l-pink-400",
		badge: "Communication",
		name: "Send Notification",
		description: "Notify an admin, the record owner, or a teammate.",
	},
	send_team_message: {
		icon: MessagesSquare,
		bg: "bg-pink-100 dark:bg-pink-400/15",
		fg: "text-pink-700 dark:text-pink-300",
		accent: "border-l-pink-500 dark:border-l-pink-400",
		badge: "Communication",
		name: "Send Team Message",
		description: "Broadcast a message to your team.",
	},
};
