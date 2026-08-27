"use client";

import React from "react";
import {
	Bar,
	BarChart,
	XAxis,
	YAxis,
	CartesianGrid,
	Cell,
	ReferenceLine,
} from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CHART_CATEGORICAL, getChartColor } from "@/lib/chart-colors";
import { formatReportValue } from "../report-config";
import { ChartNoData, isChartDataEmpty } from "./chart-no-data";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";

interface DataPoint {
	name: string;
	value: number;
	totalValue?: number;
	[key: string]: unknown;
}

const AXIS_LABEL_STYLE = { fill: "var(--muted-foreground)", fontSize: 11 };

interface SegmentMeta {
	key: string;
	label: string;
}

interface ReportColumnChartProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	entityType: string;
	/** Is `total` a dollar amount? Explicit, from the caller — see getReportValueTypes. */
	totalIsCurrency?: boolean;
	/** Is each item's `value` a dollar amount (vs. a count)? */
	itemValueIsCurrency?: boolean;
	/** Stacked mode: one bar per segment, read from wide rows keyed by segment key. */
	segments?: SegmentMeta[];
	axisLabels?: { x?: string; y?: string };
	targetLine?: number;
}

/** Vertical bars — category names on the X axis, numeric value on the Y
 * axis. Prefer this over ReportBarChart for time buckets (months, weeks). */
export function ReportColumnChart({
	data,
	total,
	totalIsCurrency = false,
	itemValueIsCurrency = false,
	segments,
	axisLabels,
	targetLine,
}: ReportColumnChartProps) {
	const patternPrefix = React.useId();
	const stacked = segments !== undefined && segments.length > 0;

	const chartConfig: ChartConfig = stacked
		? segments.reduce((acc, segment, index) => {
				acc[segment.key] = {
					label: segment.label,
					color: getChartColor(index, CHART_CATEGORICAL),
				};
				return acc;
			}, {} as ChartConfig)
		: data.reduce((acc, item, index) => {
				acc[item.name] = {
					label: item.name,
					color: getChartColor(index, CHART_CATEGORICAL),
				};
				return acc;
			}, {} as ChartConfig);

	if (!stacked) {
		chartConfig.value = {
			label: itemValueIsCurrency ? "Amount" : "Count",
			color: getChartColor(0, CHART_CATEGORICAL),
		};
	}

	const seriesColors = Array.from(
		{ length: stacked ? segments.length : data.length },
		(_, index) => getChartColor(index, CHART_CATEGORICAL)
	);

	const formatValue = (value: number) =>
		formatReportValue(value, itemValueIsCurrency, { compact: true });

	if (isChartDataEmpty(data)) {
		return <ChartNoData />;
	}

	return (
		<div className="space-y-4">
			{/* Summary stats */}
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">{data.length} categories</span>
				<span className="font-medium text-foreground">
					Total: {formatReportValue(total, totalIsCurrency, { compact: true })}
				</span>
			</div>

			{/* Chart */}
			<ChartContainer config={chartConfig} className="min-h-[300px] w-full">
				<BarChart
					data={data}
					margin={{
						top: 20,
						right: 20,
						left: axisLabels?.y ? 24 : 10,
						bottom: axisLabels?.x ? 28 : 5,
					}}
				>
					<ChartStripeDefs idPrefix={patternPrefix} colors={seriesColors} />
					<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
					<XAxis
						dataKey="name"
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickMargin={10}
						label={axisLabels?.x ? { ...AXIS_LABEL_STYLE, value: axisLabels.x, position: "insideBottom", offset: -14 } : undefined}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickFormatter={(value) => formatValue(value)}
						label={axisLabels?.y ? { ...AXIS_LABEL_STYLE, value: axisLabels.y, angle: -90, position: "insideLeft" } : undefined}
					/>
					<ChartTooltip
						cursor={{ fill: "var(--muted)", opacity: 0.2 }}
						content={<ChartTooltipContent />}
					/>
					{stacked ? (
						segments.map((segment, index) => {
							const color = getChartColor(index, CHART_CATEGORICAL);
							return (
								// Solid series fill so the tooltip chip gets a real color; the Cells
								// paint the stripe pattern. Radius is dropped — it would round
								// joints mid-stack.
								<Bar
									key={segment.key}
									dataKey={segment.key}
									stackId="segments"
									maxBarSize={48}
									fill={color}
								>
									{data.map((entry, bucketIndex) => (
										<Cell
											key={`cell-${segment.key}-${bucketIndex}`}
											fill={`url(#${stripeId(patternPrefix, index)})`}
											stroke={color}
											strokeWidth={1}
										/>
									))}
								</Bar>
							);
						})
					) : (
						<Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
							{data.map((entry, index) => {
								const color = getChartColor(index, CHART_CATEGORICAL);
								return (
									<Cell
										key={`cell-${index}`}
										fill={`url(#${stripeId(patternPrefix, index)})`}
										stroke={color}
										strokeWidth={1}
									/>
								);
							})}
						</Bar>
					)}
					{targetLine !== undefined && (
						// extendDomain keeps a goal above the data max visible instead of clipped.
						<ReferenceLine
							y={targetLine}
							ifOverflow="extendDomain"
							stroke="var(--muted-foreground)"
							strokeDasharray="4 4"
							strokeOpacity={0.6}
						/>
					)}
				</BarChart>
			</ChartContainer>
		</div>
	);
}
