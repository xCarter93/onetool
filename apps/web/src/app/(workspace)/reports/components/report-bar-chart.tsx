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
	ResponsiveContainer,
} from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { CHART_CATEGORICAL, getChartColor } from "@/lib/chart-colors";
import { formatReportValue } from "../report-config";
import { ChartNoData, isChartDataEmpty } from "./chart-no-data";
import { ReportChartTooltip, reportChartConfig } from "./report-chart-tooltip";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { bucketElementClick, type BucketClickHandler } from "./report-bucket-click";

interface DataPoint {
	name: string;
	value: number;
	totalValue?: number;
	/** Drill-down key for this bucket; absent on ungrouped results. */
	bucketKey?: string;
	[key: string]: unknown;
}

const AXIS_LABEL_STYLE = { fill: "var(--muted-foreground)", fontSize: 12 };

interface SegmentMeta {
	key: string;
	label: string;
}

interface ReportBarChartProps {
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
	/** Value-axis goal marker — X here, since this chart is layout="vertical". */
	targetLine?: number;
	/** Drill-down (R10): opens the records behind the clicked bar. */
	onBucketClick?: BucketClickHandler;
}

export function ReportBarChart({
	data,
	total,
	totalIsCurrency = false,
	itemValueIsCurrency = false,
	segments,
	axisLabels,
	targetLine,
	onBucketClick,
}: ReportBarChartProps) {
	const patternPrefix = React.useId();
	const handleBarClick = bucketElementClick(onBucketClick);
	const stacked = segments !== undefined && segments.length > 0;

	const chartConfig: ChartConfig = stacked
		? segments.reduce((acc, segment, index) => {
				acc[segment.key] = {
					label: segment.label,
					color: getChartColor(index, CHART_CATEGORICAL),
				};
				return acc;
			}, {} as ChartConfig)
		: reportChartConfig(
				data.map((item) => item.name),
				itemValueIsCurrency
			);

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
		<div className="flex flex-1 flex-col gap-4">
			{/* Summary stats */}
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">
					{data.length} categories
				</span>
				<span className="font-medium text-foreground">
					Total: {formatReportValue(total, totalIsCurrency, { compact: true })}
				</span>
			</div>

			{/* grow fills a tall canvas; shrink-0 keeps today's height as the floor. */}
			<ChartContainer config={chartConfig} className="min-h-[300px] w-full shrink-0 grow">
				<BarChart
					data={data}
					layout="vertical"
					margin={{
						top: 5,
						right: 30,
						left: axisLabels?.y ? 96 : 80,
						bottom: axisLabels?.x ? 24 : 5,
					}}
				>
					<ChartStripeDefs idPrefix={patternPrefix} colors={seriesColors} />
					<CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="var(--border)" />
					<XAxis
						type="number"
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
						tickFormatter={(value) => formatValue(value)}
						label={axisLabels?.x ? { ...AXIS_LABEL_STYLE, value: axisLabels.x, position: "insideBottom", offset: -10 } : undefined}
					/>
					<YAxis
						type="category"
						dataKey="name"
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 12, fill: "var(--foreground)" }}
						width={75}
						label={axisLabels?.y ? { ...AXIS_LABEL_STYLE, value: axisLabels.y, angle: -90, position: "insideLeft" } : undefined}
					/>
					<ChartTooltip
						cursor={{ fill: "var(--muted)", opacity: 0.2 }}
						content={<ReportChartTooltip isCurrency={itemValueIsCurrency} />}
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
									maxBarSize={40}
									fill={color}
									onClick={handleBarClick}
									className={handleBarClick ? "cursor-pointer" : undefined}
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
						<Bar
								dataKey="value"
								radius={[0, 4, 4, 0]}
								maxBarSize={40}
								onClick={handleBarClick}
								className={handleBarClick ? "cursor-pointer" : undefined}
							>
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
							x={targetLine}
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

