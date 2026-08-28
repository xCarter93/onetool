"use client";

import React from "react";
import {
	ChartTooltipContent,
	useChart,
	type ChartConfig,
} from "@/components/ui/chart";
import { CHART_CATEGORICAL, getChartColor } from "@/lib/chart-colors";
import { formatReportValue } from "../report-config";

/** Config key every report chart's tooltip row resolves to — holds the measure label. */
const MEASURE_KEY = "value";

/** Data key and config key of the comparison-range series (R11). */
export const COMPARE_KEY = "compareValue";

/** Comparison series paint — muted so the current range stays the figure. */
export const COMPARE_COLOR = "var(--muted-foreground)";
export const COMPARE_FILL = "var(--muted)";

/** Does this chart's data carry a comparison series to draw? */
export function hasCompareValues(data: { compareValue?: unknown }[]): boolean {
	return data.some((item) => typeof item.compareValue === "number");
}

/** Label for the tooltip's measure row, shared by all six charts. */
export function measureLabel(isCurrency: boolean) {
	return isCurrency ? "Amount" : "Count";
}

/**
 * Config keys for a chart's series, one per name, in order. ChartStyle
 * interpolates the key straight into `--color-<key>`, so a raw display label
 * ("Google Ads") would emit a declaration the browser drops — slugged here,
 * with the human string kept in the entry's `label`.
 */
export function chartConfigKeys(names: string[]): string[] {
	const used = new Set([MEASURE_KEY, COMPARE_KEY]);
	return names.map((name) => {
		const slug = name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "bucket";
		let key = slug;
		for (let suffix = 2; used.has(key); suffix++) key = `${slug}-${suffix}`;
		used.add(key);
		return key;
	});
}

/**
 * One entry per bucket (chip color) plus the measure row label. Bucket entries
 * also feed ChartStyle's `--color-<key>` vars.
 */
export function reportChartConfig(
	names: string[],
	isCurrency: boolean,
	compareLabel?: string
): ChartConfig {
	const config: ChartConfig = {};
	const keys = chartConfigKeys(names);
	names.forEach((name, index) => {
		config[keys[index]] = {
			label: name,
			color: getChartColor(index, CHART_CATEGORICAL),
		};
	});
	config[MEASURE_KEY] = {
		label: measureLabel(isCurrency),
		color: getChartColor(0, CHART_CATEGORICAL),
	};
	if (compareLabel) {
		config[COMPARE_KEY] = { label: compareLabel, color: COMPARE_COLOR };
	}
	return config;
}

/** Bucket entries are keyed by slug, so the display name only matches on `label`. */
function bucketColor(config: ChartConfig, bucket: string): string | undefined {
	return Object.values(config).find((entry) => entry.label === bucket)?.color;
}

type TooltipPayload = React.ComponentProps<typeof ChartTooltipContent>["payload"];

/** recharts gives no usable tooltip label on pie (undefined) or radial (a bare index). */
function bucketName(payload: TooltipPayload): string | undefined {
	const row = payload?.[0]?.payload as { name?: unknown } | undefined;
	return typeof row?.name === "string" ? row.name : undefined;
}

type ReportChartTooltipProps = React.ComponentProps<
	typeof ChartTooltipContent
> & {
	/** Report's itemValueIsCurrency flag — drives $ formatting in the value cell. */
	isCurrency?: boolean;
};

/**
 * The one tooltip treatment for every report chart: bucket name as the heading,
 * a colored chip beside the measure label, and an exact (never compact) value.
 */
export function ReportChartTooltip({
	isCurrency = false,
	...props
}: ReportChartTooltipProps) {
	const { config } = useChart();
	const bucket = bucketName(props.payload);
	const bucketChip = bucket ? bucketColor(config, bucket) : undefined;
	// A comparison row needs its own chip, and ChartTooltipContent's `color` is
	// per-tooltip — so rewrite the rows instead of overriding all of them.
	const hasCompare =
		props.payload?.some((item) => item.dataKey === COMPARE_KEY) === true;
	const payload = hasCompare
		? props.payload?.map((item) => ({
				...item,
				payload: { ...(item.payload as object), fill: undefined },
				color:
					item.dataKey === COMPARE_KEY
						? COMPARE_COLOR
						: (bucketChip ?? item.color),
			}))
		: props.payload;
	return (
		<ChartTooltipContent
			{...props}
			payload={payload}
			hideLabel={bucket === undefined}
			labelFormatter={() => bucket}
			// Stripe fills reach the chip as paint-server urls, so take the bucket's real color.
			color={hasCompare ? undefined : bucketChip}
			valueFormatter={(value) =>
				typeof value === "number"
					? formatReportValue(value, isCurrency)
					: String(value)
			}
		/>
	);
}
