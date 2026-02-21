"use client";

import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";

export interface FieldChange {
	field: string;
	oldValue: unknown;
	newValue: unknown;
}

interface ActivityChangesTooltipProps {
	changes: FieldChange[];
	children: React.ReactNode;
}

const DATE_FIELDS = new Set([
	"Start Date",
	"End Date",
	"Due Date",
	"Valid Until",
]);

/** Format a single value for display in the tooltip. */
function formatValue(value: unknown, field?: string): string {
	if (value == null || value === "") return "\u2014";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") {
		if (field && DATE_FIELDS.has(field)) {
			return new Date(value).toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		}
		return value.toLocaleString();
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return "none";
		return value.join(", ");
	}
	return String(value);
}

/** For array fields, show added/removed items instead of raw before/after. */
function renderArrayDiff(
	field: string,
	oldValue: unknown,
	newValue: unknown
): React.ReactNode {
	const oldArr = Array.isArray(oldValue) ? oldValue.map(String) : [];
	const newArr = Array.isArray(newValue) ? newValue.map(String) : [];

	const added = newArr.filter((v) => !oldArr.includes(v));
	const removed = oldArr.filter((v) => !newArr.includes(v));

	return (
		<div key={field} className="space-y-0.5">
			<p className="text-muted-foreground font-medium text-[11px]">{field}</p>
			{added.length > 0 && (
				<p className="text-xs">
					<span className="text-green-600 dark:text-green-400">
						+ {added.join(", ")}
					</span>
				</p>
			)}
			{removed.length > 0 && (
				<p className="text-xs">
					<span className="text-red-500/80 dark:text-red-400/80">
						- {removed.join(", ")}
					</span>
				</p>
			)}
		</div>
	);
}

function renderChange(change: FieldChange): React.ReactNode {
	const isArray =
		Array.isArray(change.oldValue) || Array.isArray(change.newValue);

	if (isArray) {
		return renderArrayDiff(change.field, change.oldValue, change.newValue);
	}

	return (
		<div key={change.field} className="space-y-0.5">
			<p className="text-muted-foreground font-medium text-[11px]">
				{change.field}
			</p>
			<p className="text-xs">
				<span className="line-through text-red-500/70 dark:text-red-400/70">
					{formatValue(change.oldValue, change.field)}
				</span>
				<span className="mx-1 text-muted-foreground">{"\u2192"}</span>
				<span className="font-medium text-foreground">
					{formatValue(change.newValue, change.field)}
				</span>
			</p>
		</div>
	);
}

export default function ActivityChangesTooltip({
	changes,
	children,
}: ActivityChangesTooltipProps) {
	if (!changes || changes.length === 0) {
		return <>{children}</>;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="top" className="max-w-72 p-3">
				<p className="text-xs font-semibold text-foreground mb-2">
					Field Changes
				</p>
				<div className="space-y-2">
					{changes.map((change) => renderChange(change))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
