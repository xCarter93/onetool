"use client";

import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@/components/ui/chart";
import DatePickerRange from "@/components/shared/date-picker-range";
import { DateRange } from "react-day-picker";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";
import { StatCardSparkline } from "./stat-card-sparkline";

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
	/** Last 7 data points per metric for sparkline rendering */
	sparklineData?: MetricDataMap;
}

const CustomTooltip = ({ active, payload, metrics }: TooltipProps) => {
	if (active && payload && payload.length) {
		const entry = payload[0];
		const metric = metrics.find((m) => m.key === entry.dataKey);

		if (metric) {
			return (
				<div className="min-w-[140px] rounded-lg border bg-white dark:bg-slate-900 p-3 shadow-sm shadow-black/5 opacity-100">
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

export default function LineChart6({
	metrics,
	chartConfig,
	dataByMetric,
	selectedMetric,
	onMetricChange,
	title = "Performance",
	description,
	className,
	height = 360,
	dateRange,
	onDateRangeChange,
	floatingAction,
	sparklineData,
}: MetricChartProps) {
	const firstMetricKey = metrics[0]?.key ?? "";
	const [internalMetric, setInternalMetric] = useState<string>(
		selectedMetric ?? firstMetricKey
	);

	// Track whether the initial animation has completed
	const hasAnimated = useRef(false);
	useEffect(() => {
		hasAnimated.current = true;
	}, []);

	// Measure sparkline width from first stat card button
	const gridRef = useRef<HTMLDivElement>(null);
	const [sparklineWidth, setSparklineWidth] = useState(0);
	useLayoutEffect(() => {
		const grid = gridRef.current;
		if (!grid) return;
		const measure = () => {
			const firstButton = grid.querySelector("button");
			if (firstButton) {
				setSparklineWidth(firstButton.clientWidth - 32); // subtract p-4 padding (16px each side)
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(grid);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (selectedMetric && selectedMetric !== internalMetric) {
			setInternalMetric(selectedMetric);
			return;
		}

		if (!internalMetric && firstMetricKey) {
			setInternalMetric(firstMetricKey);
		}
	}, [firstMetricKey, internalMetric, selectedMetric]);

	const activeMetricKey = selectedMetric ?? internalMetric;

	const getMetricColor = useCallback(
		(key: string) => chartConfig[key]?.color ?? "var(--chart-1)",
		[chartConfig]
	);

	const activeMetric = useMemo(
		() => metrics.find((metric) => metric.key === activeMetricKey),
		[metrics, activeMetricKey]
	);

	const chartData = useMemo(
		() => dataByMetric[activeMetricKey] ?? [],
		[dataByMetric, activeMetricKey]
	);
	const activeColor = getMetricColor(activeMetricKey);

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

	const getSeriesChangePercent = useCallback(
		(key: string) => {
			const series = dataByMetric[key] ?? [];
			if (!series.length) return undefined;

			const firstDatum = series.find((point) =>
				Number.isFinite(Number(point[key]))
			);
			const lastDatum = [...series]
				.reverse()
				.find((point) => Number.isFinite(Number(point[key])));

			if (!firstDatum || !lastDatum) return undefined;

			const firstVal = Number(firstDatum[key]);
			const lastVal = Number(lastDatum[key]);

			if (!Number.isFinite(firstVal) || !Number.isFinite(lastVal)) {
				return undefined;
			}

			if (lastVal === firstVal) return 0;
			if (firstVal === 0) return lastVal > 0 ? 100 : 0;

			return ((lastVal - firstVal) / Math.abs(firstVal)) * 100;
		},
		[dataByMetric]
	);

	const handleMetricChange = (key: string) => {
		if (onMetricChange) {
			onMetricChange(key);
		}
		setInternalMetric(key);
	};

	return (
		<div className={cn("relative w-full", className)}>
			<div className="space-y-3 pb-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Overview
						</p>
						<h3 className="text-lg font-semibold text-foreground">{title}</h3>
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

				<div
					ref={gridRef}
					className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
				>
					{metrics.map((metric) => {
						const prev = metric.previousValue ?? 0;
						const seriesChange = getSeriesChangePercent(metric.key);
						const computedChangeRaw =
							seriesChange ??
							metric.changePercent ??
							(prev === 0
								? metric.value > 0
									? 100
									: 0
								: ((metric.value - prev) / Math.abs(prev || 1)) * 100);
						const computedChange =
							Math.abs(computedChangeRaw ?? 0) < 1e-9
								? 0
								: (computedChangeRaw ?? 0);
						const computedChangeType =
							computedChange === 0
								? "neutral"
								: (metric.changeType ??
									(computedChange > 0 ? "increase" : "decrease"));
						const badgeVariant =
							computedChangeType === "increase"
								? "success"
								: computedChangeType === "decrease"
									? "destructive"
									: "outline";
						const BadgeIcon =
							computedChangeType === "increase"
								? ArrowUp
								: computedChangeType === "decrease"
									? ArrowDown
									: ArrowRight;

						const isActive = metric.key === activeMetricKey;
						const metricColor = getMetricColor(metric.key);

						return (
							<button
								key={metric.key}
								type="button"
								onClick={() => handleMetricChange(metric.key)}
								className={cn(
									"flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card/60 p-4 text-left transition-all duration-150 hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
									isActive && "bg-primary/5 shadow-sm"
								)}
								style={isActive ? { borderColor: metricColor } : undefined}
							>
								<div className="flex w-full items-center justify-between gap-3">
									<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{metric.label}
									</span>
									<StyledBadge variant={badgeVariant}>
										<BadgeIcon className="mr-1 size-3" />
										{metric.isLoading
											? "..."
											: `${Math.abs(computedChange).toFixed(1)}%`}
									</StyledBadge>
								</div>
								<div className="flex w-full flex-col gap-1">
									<span className="text-2xl font-bold leading-none text-foreground">
										{metric.isLoading ? (
											"..."
										) : (
											<AnimatedNumber
												value={metric.value ?? 0}
												format={metric.format}
												duration={hasAnimated.current ? 400 : 600}
												delay={hasAnimated.current ? 0 : 300}
											/>
										)}
									</span>
									{metric.subtitle ? (
										<span className="text-xs text-muted-foreground">
											{metric.subtitle}
										</span>
									) : null}
								</div>
								{sparklineData?.[metric.key] &&
									sparklineData[metric.key].length > 0 && (
										<div className="mt-1 w-full">
											<StatCardSparkline
												data={sparklineData[metric.key]}
												dataKey={metric.key}
												color={
													chartConfig[metric.key]?.color ?? "var(--chart-1)"
												}
												isActive={isActive}
												width={sparklineWidth}
												height={28}
											/>
										</div>
									)}
							</button>
						);
					})}
				</div>
			</div>

			<div className="pt-0">
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
							cursor={{ strokeDasharray: "3 3", stroke: "#9ca3af" }}
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
								stroke={activeColor}
								strokeWidth={3}
								strokeOpacity={0.95}
								ifOverflow="extendDomain"
							/>
						) : null}

						<Line
							type="monotone"
							dataKey={activeMetricKey}
							stroke={activeColor}
							strokeWidth={2.5}
							dot={false}
							activeDot={{
								r: 6,
								fill: activeColor,
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

			<hr className="border-border/60" />
		</div>
	);
}
