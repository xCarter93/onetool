"use client";

import React from "react";
import { Pie, PieChart, Cell, ResponsiveContainer, Sector } from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CHART_COLORS, getChartColor } from "@/lib/chart-colors";

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
}

export function ReportPieChart({
	data,
	total,
	groupBy,
	entityType,
}: ReportPieChartProps) {
	const [activeIndex, setActiveIndex] = React.useState<number | undefined>();

	// Build chart config dynamically
	const chartConfig: ChartConfig = data.reduce((acc, item, index) => {
		acc[item.name] = {
			label: item.name,
			color: getChartColor(index, CHART_COLORS.primary),
		};
		return acc;
	}, {} as ChartConfig);

	const totalCount = data.reduce((sum, d) => sum + d.value, 0);

	const formatValue = (value: number) => {
		if (entityType === "invoices" || entityType === "quotes") {
			if (value > 1000) {
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
					Total: {totalCount}
				</span>
			</div>

			{/* Chart */}
			<ChartContainer config={chartConfig} className="min-h-[300px] w-full">
				<PieChart>
					<Pie
						data={data}
						cx="50%"
						cy="50%"
						innerRadius={60}
						outerRadius={100}
						paddingAngle={2}
						dataKey="value"
						nameKey="name"
						activeShape={renderActiveShape}
						onMouseEnter={onPieEnter}
						onMouseLeave={onPieLeave}
					>
						{data.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={getChartColor(index, CHART_COLORS.primary)}
								stroke="var(--background)"
								strokeWidth={2}
							/>
						))}
					</Pie>
					<ChartTooltip
						content={<ChartTooltipContent hideLabel />}
					/>
				</PieChart>
			</ChartContainer>

			{/* Legend */}
			<div className="grid grid-cols-2 gap-2 pt-2">
				{data.map((item, index) => {
					const percentage = totalCount > 0 
						? ((item.value / totalCount) * 100).toFixed(1)
						: 0;
					
					return (
						<div
							key={item.name}
							className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-muted/50 transition-colors"
							onMouseEnter={() => setActiveIndex(index)}
							onMouseLeave={() => setActiveIndex(undefined)}
						>
							<div
								className="w-3 h-3 rounded-sm flex-shrink-0"
								style={{ backgroundColor: getChartColor(index, CHART_COLORS.primary) }}
							/>
							<div className="flex-1 min-w-0">
								<div className="font-medium text-foreground truncate">
									{item.name}
								</div>
								<div className="text-xs text-muted-foreground">
									{item.value} ({percentage}%)
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

