"use client";

import React from "react";
import { Pie, PieChart, Cell, ResponsiveContainer, Sector } from "recharts";
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
	[key: string]: unknown;
}

interface ReportPieChartProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	entityType: string;
	/** Is `total` a dollar amount? Explicit, from the caller — see getReportValueTypes. */
	totalIsCurrency?: boolean;
}

export function ReportPieChart({
	data,
	total,
	totalIsCurrency = false,
}: ReportPieChartProps) {
	const [activeIndex, setActiveIndex] = React.useState<number | undefined>();
	const patternPrefix = React.useId();

	// Build chart config dynamically
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

	const onPieEnter = (_: unknown, index: number) => {
		setActiveIndex(index);
	};

	const onPieLeave = () => {
		setActiveIndex(undefined);
	};

	interface ActiveShapeProps {
		cx: number;
		cy: number;
		innerRadius: number;
		outerRadius: number;
		startAngle: number;
		endAngle: number;
		fill: string;
		payload: DataPoint;
		percent: number;
	}

	const renderActiveShape = (props: unknown) => {
		const {
			cx,
			cy,
			innerRadius,
			outerRadius,
			startAngle,
			endAngle,
			fill,
			payload,
			percent,
		} = props as ActiveShapeProps;

		return (
			<g>
				<Sector
					cx={cx}
					cy={cy}
					innerRadius={innerRadius}
					outerRadius={outerRadius + 8}
					startAngle={startAngle}
					endAngle={endAngle}
					fill={fill}
				/>
				<text
					x={cx}
					y={cy - 10}
					textAnchor="middle"
					fill="hsl(var(--foreground))"
					className="text-sm font-medium"
				>
					{payload.name}
				</text>
				<text
					x={cx}
					y={cy + 10}
					textAnchor="middle"
					fill="hsl(var(--muted-foreground))"
					className="text-xs"
				>
					{`${(percent * 100).toFixed(1)}%`}
				</text>
			</g>
		);
	};

	return (
		<div className="space-y-4">
			{/* Summary stats */}
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">
					{data.length} categories
				</span>
				<span className="font-medium text-foreground">
					Total: {formatReportValue(total, totalIsCurrency, { compact: true })}
				</span>
			</div>

			{/* Chart */}
			<ChartContainer config={chartConfig} className="h-[420px] w-full">
				<PieChart>
					<ChartStripeDefs
						idPrefix={patternPrefix}
						colors={data.map((_, index) => getChartColor(index, CHART_CATEGORICAL))}
					/>
					<Pie
						data={data}
						cx="50%"
						cy="50%"
						innerRadius="55%"
						outerRadius="85%"
						paddingAngle={2}
						dataKey="value"
						nameKey="name"
						activeShape={renderActiveShape}
						onMouseEnter={onPieEnter}
						onMouseLeave={onPieLeave}
						// recharts 3.8.0 animated Pie paints no sectors on initial
						// mount — keep animation off until a fixed release is verified.
						isAnimationActive={false}
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
					</Pie>
					<ChartTooltip
						content={<ChartTooltipContent hideLabel />}
					/>
				</PieChart>
			</ChartContainer>
		</div>
	);
}

