import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

export type LifecycleStatus = "draft" | "active" | "paused";

type BadgeVariant =
	| "default"
	| "secondary"
	| "destructive"
	| "success"
	| "warning"
	| "outline";

export const effectiveStatus = (a: Doc<"workflowAutomations">): LifecycleStatus =>
	a.status ?? "draft";

export const STATUS_BADGE: Record<
	LifecycleStatus,
	{ label: string; variant: Extract<BadgeVariant, "outline" | "success" | "warning"> }
> = {
	draft: { label: "Draft", variant: "outline" },
	active: { label: "Active", variant: "success" },
	paused: { label: "Paused", variant: "warning" },
};

type ObjectType = "client" | "project" | "quote" | "invoice" | "task";

export const triggerObjectType = (
	a: Doc<"workflowAutomations">
): ObjectType | undefined => {
	const trigger = a.publishedSnapshot?.trigger ?? a.trigger;
	return "objectType" in trigger
		? (trigger.objectType as ObjectType)
		: undefined;
};

export const triggerTypeOf = (
	a: Doc<"workflowAutomations">
): string | undefined => {
	const trigger = a.publishedSnapshot?.trigger ?? a.trigger;
	return "type" in trigger ? (trigger.type as string) : undefined;
};

export const formatObjectType = (type: string) =>
	type.charAt(0).toUpperCase() + type.slice(1);

export const getObjectTypeBadgeVariant = (type: string): BadgeVariant => {
	switch (type) {
		case "quote":
		case "invoice":
			return "default";
		case "project":
		case "task":
			return "secondary";
		case "client":
			return "outline";
		default:
			return "outline";
	}
};

/** Count of action nodes on an automation (for the "Steps" column). */
export const actionNodeCount = (a: Doc<"workflowAutomations">): number =>
	a.nodes.filter((n) => n.type === "action").length;
