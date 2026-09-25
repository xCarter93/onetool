"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseHandle } from "@/components/base-handle";
import { stepIdentity } from "../../lib/step-family";
import type { DelayUntilNodeConfig } from "../../lib/node-types";
import { FlowNodeCard } from "./flow-node-card";
import { SummarySlot } from "./summary-slot";

/** Humanizes a stored static "until" value; falls back to the raw value if it doesn't parse as a date. */
function formatUntilValue(value: string | number | boolean | null): string {
	const date = new Date(value as never);
	if (isNaN(date.getTime())) {
		return String(value);
	}
	// Numeric values are UTC-midnight epoch ms (see value-input's
	// localDateToUtcMidnightMs) and YYYY-MM-DD strings parse as UTC midnight —
	// format those calendar dates in UTC or US timezones render a day early.
	// T-bearing datetimes parse local and stay localized.
	const utcCalendarDate =
		typeof value === "number" ||
		(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
	const dateLabel = date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		...(utcCalendarDate ? { timeZone: "UTC" } : {}),
	});
	// Only string values (e.g. ISO datetimes) can carry a time component here.
	const hasTimeComponent = typeof value === "string" && value.includes("T");
	if (!hasTimeComponent) {
		return dateLabel;
	}
	const timeLabel = date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
	return `${dateLabel}, ${timeLabel}`;
}

function untilText(config: DelayUntilNodeConfig | undefined): string | null {
	const until = config?.until;
	if (!until || (until.kind === "static" && (until.value === null || until.value === ""))) {
		return null;
	}
	return until.kind === "var" ? "a date from earlier steps" : formatUntilValue(until.value);
}

export const DelayUntilNodeRF = memo(({ id, data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as DelayUntilNodeConfig | undefined;
	const warning = (data as Record<string, unknown>)?.warning as string | undefined;
	const identity = stepIdentity("delay_until");

	return (
		<FlowNodeCard
			nodeId={id}
			family={identity.family}
			icon={identity.icon}
			title={identity.name}
			warning={warning}
			ariaLabel={`Delay until: ${identity.name}`}
			handles={
				<>
					<BaseHandle type="target" position={Position.Top} />
					<BaseHandle type="source" position={Position.Bottom} />
				</>
			}
		>
			Wait until <SummarySlot value={untilText(config)} />
		</FlowNodeCard>
	);
});
DelayUntilNodeRF.displayName = "DelayUntilNodeRF";
