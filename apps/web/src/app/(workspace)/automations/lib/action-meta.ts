import {
	Bell,
	FilePlus,
	ListTodo,
	Mail,
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
		badge: string;
		name: string;
		description: string;
	}
> = {
	update_field: {
		icon: Play,
		bg: "bg-success-soft",
		fg: "text-success-foreground",
		badge: "Actions",
		name: "Update Record",
		description: "Set a field on the record in scope.",
	},
	// The multi-field successor; the editor upgrades update_field to this on
	// load, so it shares Update Record's identity.
	update_fields: {
		icon: Play,
		bg: "bg-success-soft",
		fg: "text-success-foreground",
		badge: "Actions",
		name: "Update Record",
		description: "Set one or more fields on the record in scope.",
	},
	create_task: {
		icon: ListTodo,
		bg: "bg-success-soft",
		fg: "text-success-foreground",
		badge: "Actions",
		name: "Create Task",
		description: "Add a task to your workspace.",
	},
	create_record: {
		icon: FilePlus,
		bg: "bg-success-soft",
		fg: "text-success-foreground",
		badge: "Actions",
		name: "Create Record",
		description: "Create a new client, project, or task.",
	},
	send_notification: {
		icon: Bell,
		bg: "bg-primary-soft",
		fg: "text-primary-foreground",
		badge: "Communication",
		name: "Send Notification",
		description:
			"Notify all members, org admins, a specific member, or a user from the record — in-app, with optional push.",
	},
	send_team_message: {
		icon: MessagesSquare,
		bg: "bg-primary-soft",
		fg: "text-primary-foreground",
		badge: "Communication",
		name: "Send Team Message",
		description:
			"Post to this record's (or a related record's) Team Communication feed, optionally tagging members.",
	},
	send_email: {
		icon: Mail,
		bg: "bg-info-soft",
		fg: "text-info-foreground",
		badge: "Communication",
		name: "Send Email",
		description: "Email the client's primary contact or specific addresses.",
	},
};
