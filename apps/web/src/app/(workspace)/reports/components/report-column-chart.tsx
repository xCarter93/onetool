"use client";

import React from "react";
import {
	Bar,
	BarChart,
	XAxis,
	YAxis,
	CartesianGrid,
	Cell,
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

interface ReportColumnChartProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	entityType: string;
	/** Is `total` a dollar amount? Explicit, from the caller — see getReportValueTypes. */
	totalIsCurrency?: boolean;
	/** Is each item's `value` a dollar amount (vs. a count)? */
	itemValueIsCurrency?: boolean;
}

/** Vertical bars — category names on the X axis, numeric value on the Y
 * axis. Prefer this over ReportBarChart for time buckets (months, weeks). */
export function ReportColumnChart({
	data,
	total,
	totalIsCurrency = false,
	itemValueIsCurrency = false,
}: ReportColumnChartProps) {
	const patternPrefix = React.useId();

	const chartConfig: ChartConfig = data.reduce((acc, item, index) => {
		acc[item.name] = {
			label: item.name,
			color: getChartColor(index, CHART_CATEGORICAL),
		};
		return acc;
	}, {} as ChartConfig);

	chartConfig.value = {
		label: itemValueIsCurrency ? "Amount" : "Count",
		color: getChartColor(0, CHART_CATEGORICAL),
	};

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
				<BarChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
					<ChartStripeDefs idPrefix={patternPrefix} colors={data.map((_, index) => getChartColor(index, CHART_CATEGORICAL))} />
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
					/>
					<ChartTooltip
						cursor={{ fill: "var(--muted)", opacity: 0.2 }}
						content={<ChartTooltipContent />}
					/>
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
				</BarChart>
			</ChartContainer>
		</div>
	);
}
