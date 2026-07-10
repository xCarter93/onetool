"use client";

import React from "react";
import {
	Radar,
	RadarChart,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,
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
import { ChartStripeDefs, stripeId } from "./chart-stripe-defs";

interface DataPoint {
	name: string;
	value: number;
	[key: string]: unknown;
}

interface ReportRadarChartProps {
	data: DataPoint[];
	total: number;
	groupBy?: string;
	entityType: string;
	totalIsCurrency?: boolean;
	itemValueIsCurrency?: boolean;
}

const RADAR_MIN_BUCKETS = 3;
const RADAR_COLOR = getChartColor(0, CHART_CATEGORICAL);

/** Single series over the category buckets. Radar reads poorly with fewer
 * than 3 axes, so callers should steer toward another chart type below that. */
export function ReportRadarChart({
	data,
	total,
	totalIsCurrency = false,
}: ReportRadarChartProps) {
	const patternPrefix = React.useId();
	const RADAR_STRIPE_ID = stripeId(patternPrefix, 0);

	const chartConfig: ChartConfig = {
		value: {
			label: "Value",
			color: RADAR_COLOR,
		},
	};

	if (isChartDataEmpty(data)) {
		return <ChartNoData />;
	}

	if (data.length < RADAR_MIN_BUCKETS) {
		return (
			<ChartNoData
				message="Radar needs at least three groups — try another chart type."
				detail="Pick bar, column, or pie for fewer categories."
			/>
		);
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
			<ChartContainer config={chartConfig} className="h-[420px] w-full">
				<RadarChart data={data} outerRadius="80%">
					<ChartStripeDefs idPrefix={patternPrefix} colors={[RADAR_COLOR]} />
					<PolarGrid stroke="var(--border)" />
					<PolarAngleAxis
						dataKey="name"
						tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
					/>
					<PolarRadiusAxis
						tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
						axisLine={false}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Radar
						dataKey="value"
						fill={`url(#${RADAR_STRIPE_ID})`}
						stroke={RADAR_COLOR}
						strokeWidth={2}
						fillOpacity={1}
					/>
				</RadarChart>
			</ChartContainer>
		</div>
	);
}
