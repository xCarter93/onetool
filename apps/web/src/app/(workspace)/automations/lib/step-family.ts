import {
	Bell,
	CalendarClock,
	CircleStop,
	Clock3,
	Database,
	FilePlus,
	GitBranch,
	ListTodo,
	Mail,
	MessagesSquare,
	Play,
	Repeat,
	Sigma,
	SkipForward,
	Timer,
	Zap,
	type LucideIcon,
} from "lucide-react";

/**
 * Visual family of a step. One band per family; the canvas header, the step
 * picker rows and the config panel header all read from here.
 */
export type StepFamily = "trigger" | "logic" | "action" | "flow";

/**
 * Solid header bands (Datadog-style) with their text colour. `primary-foreground`
 * is the text-on-solid token (white in light, near-black in dark). The trigger
 * band uses the darker warning text colour in light mode so white passes AA.
 */
export const STEP_FAMILY_STYLE: Record<StepFamily, { band: string; label: string }> = {
	trigger: { band: "bg-warning-foreground text-primary-foreground dark:bg-warning", label: "Trigger" },
	logic: { band: "bg-primary text-primary-foreground", label: "Logic" },
	action: { band: "bg-success text-primary-foreground", label: "Action" },
	flow: { band: "bg-muted text-foreground", label: "Flow" },
};

export interface StepIdentity {
	family: StepFamily;
	icon: LucideIcon;
	name: string;
}

const NODE_IDENTITY: Record<string, StepIdentity> = {
	trigger: { family: "trigger", icon: Zap, name: "Trigger" },
	condition: { family: "logic", icon: GitBranch, name: "Condition" },
	loop: { family: "logic", icon: Repeat, name: "Loop" },
	aggregate: { family: "logic", icon: Sigma, name: "Aggregate" },
	adjust_time: { family: "logic", icon: Clock3, name: "Adjust time" },
	delay: { family: "logic", icon: Timer, name: "Delay" },
	delay_until: { family: "logic", icon: CalendarClock, name: "Delay until" },
	fetch_records: { family: "action", icon: Database, name: "Find Records" },
	end: { family: "flow", icon: CircleStop, name: "End" },
	next_item: { family: "flow", icon: SkipForward, name: "Next item" },
};

const ACTION_IDENTITY: Record<string, StepIdentity> = {
	update_field: { family: "action", icon: Play, name: "Update Record" },
	update_fields: { family: "action", icon: Play, name: "Update Record" },
	create_task: { family: "action", icon: ListTodo, name: "Create Task" },
	create_record: { family: "action", icon: FilePlus, name: "Create Record" },
	send_notification: { family: "action", icon: Bell, name: "Send Notification" },
	send_team_message: { family: "action", icon: MessagesSquare, name: "Send Team Message" },
	send_email: { family: "action", icon: Mail, name: "Send Email" },
};

const UNKNOWN_ACTION: StepIdentity = { family: "action", icon: Play, name: "Action" };

export function stepIdentity(nodeType: string, actionType?: string): StepIdentity {
	if (nodeType === "action") {
		return (actionType && ACTION_IDENTITY[actionType]) || UNKNOWN_ACTION;
	}
	return NODE_IDENTITY[nodeType] ?? UNKNOWN_ACTION;
}

export function stepFamilyStyle(family: StepFamily) {
	return STEP_FAMILY_STYLE[family];
}
