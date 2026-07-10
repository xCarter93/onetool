"use client";

import React from "react";
import {
	Area,
	AreaChart,
	XAxis,
	YAxis,
	CartesianGrid,
} from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CHART_CATEGORICAL } from "@/lib/chart-colors";
import { ChartNoData, isChartDataEmpty } from "./chart-no-data";
import { ChartStripeDefs, stripeId } from "./chart-stripe-defs";

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
}

// This chart's single series used to hardcode the same rgb() value as
// CHART_COLORS.primary[0]; now sourced from the categorical palette so every
// chart shares one validated color system.
const PRIMARY_BLUE = CHART_CATEGORICAL[0];
const AREA_STRIPE_ID = stripeId("report-stripe", 0);

// Renders as an area chart (viz type value stays "line" — schema/presets/
// saved reports are unchanged; only the label/icon in report-config.ts
// present it as "Area").
export function ReportLineChart({
	data,
	total,
	groupBy,
	entityType,
}: ReportLineChartProps) {
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
				return new Intl.NumberFormat("en-US", {
					style: "currency",
					currency: "USD",
					notation: "compact",
					maximumFractionDigits: 1,
				}).format(value);
			}
		}
		return value.toString();
	};

	// Calculate trend
	const trend = data.length >= 2
		? data[data.length - 1].value - data[0].value
		: 0;

	return (
		<div className="space-y-4">
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
							className={`text-xs ${trend > 0 ? "text-green-600" : "text-red-600"}`}
						>
							{trend > 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(0)}
						</span>
					)}
				</div>
			</div>

			{/* Chart */}
			<ChartContainer config={chartConfig} className="min-h-[300px] w-full">
				<AreaChart
					data={data}
					margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
				>
					<ChartStripeDefs colors={[PRIMARY_BLUE]} />
					<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
					<XAxis
						dataKey="name"
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
						tickMargin={10}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
						tickFormatter={(value) => formatValue(value)}
						tickMargin={10}
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
							stroke: "white",
							strokeWidth: 2,
						}}
						activeDot={{
							r: 7,
							fill: PRIMARY_BLUE,
							stroke: "white",
							strokeWidth: 2,
						}}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	);
}
