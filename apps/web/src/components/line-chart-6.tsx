"use client";

import React, { useMemo } from "react";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@/components/ui/chart";
import DatePickerRange from "@/components/shared/date-picker-range";
import { DateRange } from "react-day-picker";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

const parseLocalDate = (dateString: string) =>
	new Date(`${dateString}T00:00:00`);

export type MetricDefinition = {
	key: string;
	label: string;
	value: number;
	previousValue: number;
	format: (val: number) => string;
	isNegative?: boolean;
	changeType?: "increase" | "decrease" | "neutral";
	changePercent?: number;
	isLoading?: boolean;
	subtitle?: string;
};

export type MetricDatum = { date: string } & Record<string, number>;

export type MetricDataMap = Record<string, MetricDatum[]>;

type TooltipPayload = {
	dataKey: string;
	value: number;
	color: string;
};

interface TooltipProps {
	active?: boolean;
	payload?: TooltipPayload[];
	label?: string;
	metrics: MetricDefinition[];
}

interface MetricChartProps {
	metrics: MetricDefinition[];
	chartConfig: ChartConfig;
	dataByMetric: MetricDataMap;
	selectedMetric?: string;
	onMetricChange?: (key: string) => void;
	title?: string;
	description?: string;
	className?: string;
	height?: number;
	dateRange?: DateRange;
	onDateRangeChange?: (range?: DateRange) => void;
	/** Optional floating action button rendered in bottom-right of card */
	floatingAction?: React.ReactNode;
	/** Last 7 data points per metric — accepted for API compatibility */
	sparklineData?: MetricDataMap;
}

const CustomTooltip = ({ active, payload, metrics }: TooltipProps) => {
	if (active && payload && payload.length) {
		const entry = payload[0];
		const metric = metrics.find((m) => m.key === entry.dataKey);

		if (metric) {
			return (
				<div className="min-w-[140px] rounded-lg border bg-popover p-3 shadow-sm shadow-black/5 opacity-100">
					<div className="flex items-center gap-2 text-sm">
						<div
							className="size-1.5 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="text-muted-foreground">{metric.label}:</span>
						<span className="font-semibold text-popover-foreground">
							{metric.format(entry.value)}
						</span>
					</div>
				</div>
			);
		}
	}
	return null;
};

/**
 * Chart-only card body: an eyebrow + title + date-range header above the
 * interactive line chart for whichever metric is currently selected. Metric
 * selection lives in the parent (the stat spotlight + KPI chips), so this
 * component just renders the active series.
 */
export default function LineChart6({
	metrics,
	chartConfig,
	dataByMetric,
	selectedMetric,
	title = "Performance",
	description,
	className,
	height = 280,
	dateRange,
	onDateRangeChange,
	floatingAction,
}: MetricChartProps) {
	const firstMetricKey = metrics[0]?.key ?? "";
	const activeMetricKey = selectedMetric ?? firstMetricKey;
	const uniformColor = "var(--chart-1)";

	const activeMetric = useMemo(
		() => metrics.find((metric) => metric.key === activeMetricKey),
		[metrics, activeMetricKey]
	);

	const chartData = useMemo(
		() => dataByMetric[activeMetricKey] ?? [],
		[dataByMetric, activeMetricKey]
	);

	const { isFlatLine, flatValue } = useMemo(() => {
		if (!chartData.length) return { isFlatLine: false, flatValue: undefined };

		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;

		chartData.forEach((point) => {
			const val = Number(point[activeMetricKey]);
			if (!Number.isFinite(val)) return;
			min = Math.min(min, val);
			max = Math.max(max, val);
		});

		if (!Number.isFinite(min) || !Number.isFinite(max)) {
			return { isFlatLine: false, flatValue: undefined };
		}

		return { isFlatLine: min === max, flatValue: min };
	}, [chartData, activeMetricKey]);

	return (
		<div className={cn("relative flex h-full w-full flex-col", className)}>
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
				<div className="space-y-1">
					<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
						Overview
					</p>
					<h3 className="text-lg font-bold text-foreground">{title}</h3>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
				<div className="w-full sm:w-auto">
					<DatePickerRange
						value={dateRange}
						onChange={(range) => onDateRangeChange?.(range)}
						showArrow={false}
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1">
				<ChartContainer
					config={chartConfig}
					className="w-full overflow-visible aspect-auto [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
					style={{ height, width: "100%" }}
				>
					<LineChart
						data={chartData}
						margin={{ top: 16, right: 24, left: 8, bottom: 16 }}
						style={{ overflow: "visible" }}
					>
						<defs>
							<pattern
								id="dotGrid"
								x="0"
								y="0"
								width="20"
								height="20"
								patternUnits="userSpaceOnUse"
							>
								<circle
									cx="10"
									cy="10"
									r="1"
									fill="var(--input)"
									fillOpacity="1"
								/>
							</pattern>
							<filter
								id="dotShadow"
								x="-50%"
								y="-50%"
								width="200%"
								height="200%"
							>
								<feDropShadow
									dx="2"
									dy="2"
									stdDeviation="3"
									floodColor="rgba(0,0,0,0.45)"
								/>
							</filter>
						</defs>

						<XAxis
							dataKey="date"
							axisLine={false}
							tickLine={false}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							tickMargin={10}
							tickFormatter={(value: string) => {
								const date = parseLocalDate(value);
								return date.toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
								});
							}}
						/>

						<YAxis
							axisLine={false}
							tickLine={false}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							tickMargin={10}
							tickCount={6}
							tickFormatter={(value: number) => {
								return activeMetric?.format
									? activeMetric.format(value)
									: value.toString();
							}}
						/>

						<ChartTooltip
							content={<CustomTooltip metrics={metrics} />}
							cursor={{
								strokeDasharray: "3 3",
								stroke: "var(--muted-foreground)",
							}}
						/>

						<rect
							x="56px"
							y="-16px"
							width="calc(100% - 70px)"
							height="calc(100% - 12px)"
							fill="url(#dotGrid)"
							style={{ pointerEvents: "none" }}
						/>

						{isFlatLine && flatValue !== undefined ? (
							<ReferenceLine
								y={flatValue}
								stroke={uniformColor}
								strokeWidth={3}
								strokeOpacity={0.95}
								ifOverflow="extendDomain"
							/>
						) : null}

						<Line
							type="monotone"
							dataKey={activeMetricKey}
							stroke={uniformColor}
							strokeWidth={2.5}
							dot={false}
							activeDot={{
								r: 6,
								fill: uniformColor,
								stroke: "white",
								strokeWidth: 2,
								filter: "url(#dotShadow)",
							}}
						/>
					</LineChart>
				</ChartContainer>
			</div>

			{/* Floating Action Button */}
			{floatingAction && (
				<div className="absolute bottom-4 left-4 z-10">{floatingAction}</div>
			)}
		</div>
	);
}
