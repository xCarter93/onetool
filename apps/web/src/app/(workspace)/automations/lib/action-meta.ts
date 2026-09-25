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

/** Per-action-type name and blurb; colours come from step-family.ts. */
export const ACTION_META: Record<
	ActionNodeConfig["action"]["type"],
	{
		icon: LucideIcon;
		name: string;
		description: string;
	}
> = {
	update_field: {
		icon: Play,
		name: "Update Record",
		description: "Set a field on the record in scope.",
	},
	// The multi-field successor; the editor upgrades update_field to this on
	// load, so it shares Update Record's identity.
	update_fields: {
		icon: Play,
		name: "Update Record",
		description: "Set one or more fields on the record in scope.",
	},
	create_task: {
		icon: ListTodo,
		name: "Create Task",
		description: "Add a task to your workspace.",
	},
	create_record: {
		icon: FilePlus,
		name: "Create Record",
		description: "Create a new client, project, or task.",
	},
	send_notification: {
		icon: Bell,
		name: "Send Notification",
		description:
			"Notify all members, org admins, a specific member, or a user from the record — in-app, with optional push.",
	},
	send_team_message: {
		icon: MessagesSquare,
		name: "Send Team Message",
		description:
			"Post to this record's (or a related record's) Team Communication feed, optionally tagging members.",
	},
	send_email: {
		icon: Mail,
		name: "Send Email",
		description: "Email the client's primary contact or specific addresses.",
	},
};
