"use client";

import React from "react";
import { RadialBar, RadialBarChart, Cell, PolarGrid } from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CHART_CATEGORICAL, getChartColor } from "@/lib/chart-colors";
import { formatReportValue } from "../report-config";
import { ChartNoData, isChartDataEmpty } from "./chart-no-data";
import { ChartStripeDefs, stripeId } from "./chart-stripe-defs";

interface DataPoint {
	name: string;
	value: number;
	[key: string]: unknown;
}

interface ReportRadialChartProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	entityType: string;
	totalIsCurrency?: boolean;
	itemValueIsCurrency?: boolean;
}

/** One radial bar per category, stripe fill + solid stroke like ReportBarChart. */
export function ReportRadialChart({
	data,
	total,
	totalIsCurrency = false,
}: ReportRadialChartProps) {
	const patternPrefix = React.useId();
	const chartConfig: ChartConfig = data.reduce((acc, item, index) => {
		acc[item.name] = {
			label: item.name,
			color: getChartColor(index, CHART_CATEGORICAL),
		};
		return acc;
	}, {} as ChartConfig);

	if (isChartDataEmpty(data)) {
		return <ChartNoData />;
	}

	const chartData = data.map((item, index) => ({
		...item,
		fill: `url(#${stripeId(patternPrefix, index)})`,
	}));

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
			<ChartContainer config={chartConfig} className="h-[420px] w-full">
				<RadialBarChart
					data={chartData}
					innerRadius="20%"
					outerRadius="90%"
					startAngle={90}
					endAngle={-270}
				>
					<ChartStripeDefs idPrefix={patternPrefix} colors={data.map((_, index) => getChartColor(index, CHART_CATEGORICAL))} />
					<PolarGrid stroke="var(--border)" gridType="circle" radialLines={false} />
					<ChartTooltip content={<ChartTooltipContent hideLabel />} />
					{/* recharts 3.8.0 animated Pie/RadialBar (shared polar animation
					    path) paints no sectors on initial mount — keep animation off
					    until a fixed release is verified. */}
					<RadialBar dataKey="value" background cornerRadius={4} isAnimationActive={false}>
						{chartData.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={entry.fill}
								stroke={getChartColor(index, CHART_CATEGORICAL)}
								strokeWidth={1}
							/>
						))}
					</RadialBar>
				</RadialBarChart>
			</ChartContainer>
		</div>
	);
}
