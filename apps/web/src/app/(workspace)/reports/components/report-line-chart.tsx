"use client";

import React from "react";
import {
	Line,
	LineChart,
	XAxis,
	YAxis,
	CartesianGrid,
	Area,
} from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

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

// Glass blue color palette (matching app's primary color)
const PRIMARY_BLUE = "rgb(0, 166, 244)";
const PRIMARY_BLUE_LIGHT = "rgba(0, 166, 244, 0.15)";

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
				<LineChart
					data={data}
					margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
				>
					<defs>
						<linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="0%"
								stopColor={PRIMARY_BLUE}
								stopOpacity={0.3}
							/>
							<stop
								offset="100%"
								stopColor={PRIMARY_BLUE}
								stopOpacity={0.05}
							/>
						</linearGradient>
					</defs>
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
					{/* Area fill under the line — decorative only; without
					    tooltipType="none" it duplicates the Line's tooltip entry
					    (two payload rows keyed "value" → React duplicate-key error) */}
					<Area
						type="monotone"
						dataKey="value"
						stroke="none"
						fill="url(#lineGradient)"
						tooltipType="none"
					/>
					{/* Main line with connected points */}
					<Line
						type="monotone"
						dataKey="value"
						stroke={PRIMARY_BLUE}
						strokeWidth={2.5}
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
				</LineChart>
			</ChartContainer>
		</div>
	);
}

