"use client";

import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	buildMetric,
	metricAggOf,
	metricAggOptions,
	metricTargetOptionsFor,
	metricTargetValue,
	METRIC_TARGET_SEPARATOR,
	type EntityType,
	type MetricAgg,
	type MetricTargetOption,
	type ReportMetric,
} from "../report-config";

/**
 * Attio's two-control metric (§8 d15 amendment): what to measure on the left,
 * how to aggregate on the right. Both controls derive from the metric itself —
 * switching to a target that carries its own aggregation (count, related count,
 * ratio) hides the dropdown, and coming back defaults to Sum.
 */
export function ReportMetricControls({
	entityType,
	metric,
	onChange,
}: {
	entityType: EntityType;
	metric: ReportMetric;
	onChange: (metric: ReportMetric) => void;
}) {
	const options = metricTargetOptionsFor(entityType);
	const targetValue = metricTargetValue(metric);
	const selected = options.find((option) => option.value === targetValue);
	const agg = metricAggOf(metric) ?? "sum";

	const groups = new Map<string, MetricTargetOption[]>();
	for (const option of options) {
		groups.set(option.group, [...(groups.get(option.group) ?? []), option]);
	}

	return (
		<div className="flex items-center gap-2">
			<Select
				value={targetValue}
				onValueChange={(value) => {
					const next = options.find((option) => option.value === value);
					if (next) onChange(buildMetric(next.target, agg));
				}}
			>
				<Tooltip>
					<TooltipTrigger
						delay={300}
						render={
							<SelectTrigger className="min-w-0 flex-1">
								<SelectValue placeholder="Count of records" />
							</SelectTrigger>
						}
					/>
					<TooltipContent side="top" align="start">
						{selected?.label ?? "Count of records"}
					</TooltipContent>
				</Tooltip>
				<SelectContent>
					{[...groups].map(([heading, items]) => (
						<SelectGroup key={heading}>
							<SelectLabel>{heading}</SelectLabel>
							{items.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									// The label splits across nodes for the muted trail; name it whole.
									aria-label={option.label}
								>
									{targetItemLabel(option)}
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
			{selected?.aggregatable && (
				<Select
					value={agg}
					onValueChange={(value) => {
						if (value) onChange(buildMetric(selected.target, value as MetricAgg));
					}}
				>
					<SelectTrigger className="w-28 shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{metricAggOptions.map((option) => (
							<SelectItem key={option.op} value={option.op}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);
}

/** Muted parent trail so the trigger reads as a breadcrumb once truncated. */
function targetItemLabel(option: MetricTargetOption): ReactNode {
	const prefix = `${option.group}${METRIC_TARGET_SEPARATOR}`;
	if (!option.label.startsWith(prefix)) return option.label;
	return (
		<>
			<span className="text-muted-foreground">{prefix}</span>
			{option.label.slice(prefix.length)}
		</>
	);
}
