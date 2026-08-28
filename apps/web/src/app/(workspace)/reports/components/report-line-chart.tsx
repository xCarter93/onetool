"use client";

import React from "react";
import {
	Area,
	AreaChart,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
} from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CHART_CATEGORICAL } from "@/lib/chart-colors";
import { ChartNoData, isChartDataEmpty } from "./chart-no-data";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { formatCurrency } from "@/lib/money";

interface DataPoint {
	name: string;
	value: number;
	[key: string]: unknown;
}

interface ReportLineChartProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	entityType: string;
	axisLabels?: { x?: string; y?: string };
	targetLine?: number;
}

const AXIS_LABEL_STYLE = { fill: "var(--muted-foreground)", fontSize: 11 };

// This chart's single series used to hardcode the same rgb() value as
// CHART_COLORS.primary[0]; now sourced from the categorical palette so every
// chart shares one validated color system.
const PRIMARY_BLUE = CHART_CATEGORICAL[0];

// Renders as an area chart (viz type value stays "line" — schema/presets/
// saved reports are unchanged; only the label/icon in report-config.ts
// present it as "Area").
export function ReportLineChart({
	data,
	total,
	groupBy,
	entityType,
	axisLabels,
	targetLine,
}: ReportLineChartProps) {
	const patternPrefix = React.useId();
	const AREA_STRIPE_ID = stripeId(patternPrefix, 0);

	const chartConfig: ChartConfig = {
		value: {
			label: "Value",
			color: PRIMARY_BLUE,
		},
	};

	if (isChartDataEmpty(data)) {
		return <ChartNoData />;
	}

	const formatValue = (value: number) => {
		if (entityType === "invoices" || entityType === "quotes") {
			if (total > 1000) {
				return formatCurrency(value, { compact: true });
			}
		}
		return value.toString();
	};

	// Calculate trend
	const trend = data.length >= 2
		? data[data.length - 1].value - data[0].value
		: 0;

	return (
		<div className="flex flex-1 flex-col gap-4">
			{/* Summary stats */}
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">
					{data.length} data points
				</span>
				<div className="flex items-center gap-3">
					<span className="font-medium text-foreground">
						Total: {formatValue(total)}
					</span>
					{trend !== 0 && (
						<span
							className={`text-xs ${trend > 0 ? "text-success" : "text-destructive"}`}
						>
							{trend > 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(0)}
						</span>
					)}
				</div>
			</div>

			{/* grow fills a tall canvas; shrink-0 keeps today's height as the floor. */}
			<ChartContainer config={chartConfig} className="min-h-[300px] w-full shrink-0 grow">
				<AreaChart
					data={data}
					margin={{
						top: 20,
						right: 30,
						left: axisLabels?.y ? 32 : 20,
						bottom: axisLabels?.x ? 36 : 20,
					}}
				>
					<ChartStripeDefs idPrefix={patternPrefix} colors={[PRIMARY_BLUE]} />
					<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
					<XAxis
						dataKey="name"
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickMargin={10}
						label={axisLabels?.x ? { ...AXIS_LABEL_STYLE, value: axisLabels.x, position: "insideBottom", offset: -18 } : undefined}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickFormatter={(value) => formatValue(value)}
						tickMargin={10}
						label={axisLabels?.y ? { ...AXIS_LABEL_STYLE, value: axisLabels.y, angle: -90, position: "insideLeft" } : undefined}
					/>
					<ChartTooltip
						cursor={{ strokeDasharray: "3 3", stroke: PRIMARY_BLUE }}
						content={<ChartTooltipContent />}
					/>
					{/* Solid 2px stroke for the curve, diagonal-stripe pattern (not a
					    gradient) filling the area beneath it. */}
					<Area
						type="monotone"
						dataKey="value"
						stroke={PRIMARY_BLUE}
						strokeWidth={2}
						fill={`url(#${AREA_STRIPE_ID})`}
						connectNulls
						dot={{
							r: 5,
							fill: PRIMARY_BLUE,
							stroke: "var(--background)",
							strokeWidth: 2,
						}}
						activeDot={{
							r: 7,
							fill: PRIMARY_BLUE,
							stroke: "var(--background)",
							strokeWidth: 2,
						}}
					/>
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
				</AreaChart>
			</ChartContainer>
		</div>
	);
}
