import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import type { StatusBadgeProps } from "@/components/domain/status-badge";

type BadgeVariant =
	| "default"
	| "secondary"
	| "destructive"
	| "success"
	| "warning"
	| "outline";

export type LifecycleStatus = "draft" | "active" | "paused";

export const effectiveStatus = (a: Doc<"workflowAutomations">): LifecycleStatus =>
	a.status ?? "draft";

/** Display label for each lifecycle status (automations-domain concern). */
export const STATUS_LABEL: Record<LifecycleStatus, string> = {
	draft: "Draft",
	active: "Active",
	paused: "Paused",
};

/**
 * <StatusBadge status={...} .../> props for each lifecycle status
 * (components/domain/status-badge.tsx StatusKey).
 */
export const STATUS_BADGE_PROPS: Record<
	LifecycleStatus,
	{ appearance: StatusBadgeProps["appearance"] }
> = {
	draft: { appearance: "outline" },
	active: { appearance: "solid" },
	paused: { appearance: "solid" },
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
