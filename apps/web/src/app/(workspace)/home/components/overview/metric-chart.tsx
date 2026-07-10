"use client";

import { useId, useMemo } from "react";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	XAxis,
	YAxis,
} from "recharts";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import { FramePanel } from "@/components/reui/frame";
import { AnimatedNumber } from "@/components/animated-number";
import type { MetricDatum, MetricDefinition } from "@/components/line-chart-6";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import {
	ACCENT_COLOR,
	formatDayLabel,
	getSeriesStats,
	metricVisual,
} from "./metric-visuals";

type DotRenderProps = {
	cx?: number;
	cy?: number;
	payload?: MetricDatum;
	value?: number;
};

function ChartTooltipCard({
	active,
	payload,
	metric,
	color,
}: {
	active?: boolean;
	payload?: Array<{ value: number; payload: MetricDatum }>;
	metric: MetricDefinition;
	color: string;
}) {
	if (!active || !payload?.length) return null;
	const point = payload[0];
	return (
		<div className="rounded-lg border bg-popover p-2.5 shadow-lg">
			<div className="text-[11px] font-medium text-muted-foreground">
				{formatDayLabel(point.payload?.date ?? "")}
			</div>
			<div className="mt-1 flex items-center gap-1.5">
				<span
					aria-hidden
					className="size-1.5 rounded-full"
					style={{ backgroundColor: color }}
				/>
				<span className="text-sm font-semibold tabular-nums text-popover-foreground">
					{metric.format(point.value)}
				</span>
			</div>
		</div>
	);
}

/**
 * The big selected-metric chart. Rendered as a FramePanel so it lives inside the
 * shared Overview Frame (alongside the KPI cards) — no Frame of its own.
 */
export function MetricChartBody({
	metric,
	data,
	height = 260,
}: {
	metric: MetricDefinition;
	data: MetricDatum[];
	height?: number;
}) {
	const { icon: Icon } = metricVisual(metric.key);
	const color = ACCENT_COLOR;
	const stats = useMemo(() => getSeriesStats(data, metric.key), [data, metric.key]);
	const hasRange = stats.high !== stats.low;

	const changeType = metric.changeType ?? "neutral";
	const TrendIcon =
		changeType === "increase"
			? ArrowUp
			: changeType === "decrease"
				? ArrowDown
				: ArrowRight;
	const trendClass =
		changeType === "increase"
			? "text-success"
			: changeType === "decrease"
				? "text-destructive"
				: "text-muted-foreground";
	const changePct = Math.abs(metric.changePercent ?? 0);

	const signedChange = `${stats.change >= 0 ? "+" : "−"}${metric.format(
		Math.abs(stats.change)
	)}`;

	const chartConfig: ChartConfig = useMemo(
		() => ({ [metric.key]: { label: metric.label, color } }),
		[metric.key, metric.label, color]
	);

	const patternPrefix = useId();
	const AREA_STRIPE_ID = stripeId(patternPrefix, 0);
	const dotGridId = `overview-dots-${metric.key}`;

	return (
		<FramePanel className="flex flex-col gap-5">
			{/* Selected-metric identity + value + trend */}
			<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<Icon className="size-4" aria-hidden />
						</span>
						<span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
							{metric.label}
						</span>
					</div>
					<div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<span className="text-3xl font-bold leading-none tabular-nums text-foreground sm:text-4xl">
							{metric.isLoading ? (
								"—"
							) : (
								<AnimatedNumber value={metric.value ?? 0} format={metric.format} />
							)}
						</span>
						<span className={cn("flex items-center gap-1 text-sm font-medium", trendClass)}>
							<TrendIcon className="size-3.5" aria-hidden />
							{changePct.toFixed(1)}%
						</span>
						{metric.subtitle ? (
							<span className="text-xs font-medium text-muted-foreground">
								{metric.subtitle}
							</span>
						) : null}
					</div>
				</div>

				{/* High / Low / Change strip */}
				<div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
					<span>
						High{" "}
						<span className="font-medium text-foreground tabular-nums">
							{metric.format(stats.high)}
						</span>
					</span>
					<span>
						Low{" "}
						<span className="font-medium text-foreground tabular-nums">
							{metric.format(stats.low)}
						</span>
					</span>
					<span>
						Change{" "}
						<span
							className={cn(
								"font-medium tabular-nums",
								stats.change > 0
									? "text-success"
									: stats.change < 0
										? "text-destructive"
										: "text-foreground"
							)}
						>
							{signedChange}
						</span>
					</span>
				</div>
			</div>

			{/* Chart */}
			<ChartContainer
				config={chartConfig}
				className="aspect-auto w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
				style={{ height, width: "100%" }}
			>
				<ComposedChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
					<ChartStripeDefs idPrefix={patternPrefix} colors={[color]} />
					<defs>
						<pattern
							id={dotGridId}
							x="0"
							y="0"
							width="20"
							height="20"
							patternUnits="userSpaceOnUse"
						>
							<circle cx="10" cy="10" r="1" fill="var(--input)" fillOpacity="0.6" />
						</pattern>
					</defs>

					<rect
						x="0"
						y="0"
						width="100%"
						height="100%"
						fill={`url(#${dotGridId})`}
						style={{ pointerEvents: "none" }}
					/>

					<CartesianGrid
						strokeDasharray="4 8"
						stroke="var(--border)"
						horizontal
						vertical={false}
					/>

					<XAxis
						dataKey="date"
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickMargin={12}
						interval="preserveStartEnd"
						minTickGap={28}
						tickFormatter={formatDayLabel}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickMargin={8}
						width={52}
						tickCount={5}
						tickFormatter={(value: number) => metric.format(value)}
					/>

					<ChartTooltip
						content={<ChartTooltipCard metric={metric} color={color} />}
						cursor={{
							strokeDasharray: "3 3",
							stroke: "var(--muted-foreground)",
							strokeOpacity: 0.5,
						}}
					/>

					<Area
						type="monotone"
						dataKey={metric.key}
						stroke="none"
						fill={`url(#${AREA_STRIPE_ID})`}
						isAnimationActive={false}
					/>
					<Line
						type="monotone"
						dataKey={metric.key}
						stroke={color}
						strokeWidth={2.5}
						dot={(props: DotRenderProps) => {
							const { cx, cy, value } = props;
							const key = `${props.payload?.date ?? cx}`;
							if (
								hasRange &&
								typeof cx === "number" &&
								typeof cy === "number" &&
								(value === stats.high || value === stats.low)
							) {
								return (
									<circle
										key={key}
										cx={cx}
										cy={cy}
										r={5}
										fill={color}
										stroke="var(--card)"
										strokeWidth={2}
									/>
								);
							}
							return <g key={key} />;
						}}
						activeDot={{
							r: 5,
							fill: color,
							stroke: "var(--card)",
							strokeWidth: 2,
						}}
					/>
				</ComposedChart>
			</ChartContainer>
		</FramePanel>
	);
}
