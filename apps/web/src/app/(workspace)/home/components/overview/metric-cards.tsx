"use client";

import { useId, type CSSProperties } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { FramePanel } from "@/components/reui/frame";
import { AnimatedNumber } from "@/components/animated-number";
import type { MetricDatum, MetricDefinition } from "@/app/(workspace)/home/components/overview/metric-types";
import { ACCENT_COLOR, metricVisual } from "./metric-visuals";

/** Faint dotted bed anchored to the bottom of a card, behind the sparkline. */
function DottedChartBackground() {
	const raw = useId().replace(/:/g, "");
	const patternId = `${raw}-dots`;
	const maskId = `${raw}-fade`;

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-foreground/15"
			fill="none"
			preserveAspectRatio="none"
			viewBox="0 0 320 96"
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<pattern
					id={patternId}
					height="1"
					patternTransform="matrix(4.5 0 0 4.5 0 0)"
					patternUnits="userSpaceOnUse"
					preserveAspectRatio="none"
					viewBox="0 0 9 9"
					width="1"
				>
					<rect fill="currentColor" height="2" rx="1" width="2" x="2" y="2" />
				</pattern>
				<linearGradient id={maskId} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0" stopColor="white" stopOpacity="0" />
					<stop offset="0.28" stopColor="white" stopOpacity="0.45" />
					<stop offset="1" stopColor="white" />
				</linearGradient>
				<mask id={`${maskId}-mask`}>
					<rect fill={`url(#${maskId})`} height="96" width="320" />
				</mask>
			</defs>
			<rect
				fill={`url(#${patternId})`}
				height="96"
				mask={`url(#${maskId}-mask)`}
				width="320"
			/>
		</svg>
	);
}

function MetricSparkline({
	data,
	dataKey,
}: {
	data: MetricDatum[];
	dataKey: string;
}) {
	const config = {
		[dataKey]: { label: dataKey, color: ACCENT_COLOR },
	} satisfies ChartConfig;
	return (
		<ChartContainer
			config={config}
			className="pointer-events-none absolute inset-x-0 bottom-0 aspect-auto h-14 w-full"
		>
			<LineChart data={data} margin={{ top: 6, right: 0, bottom: 8, left: 0 }}>
				<XAxis dataKey="date" hide />
				<YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
				<Line
					type="monotone"
					dataKey={dataKey}
					dot={false}
					isAnimationActive={false}
					stroke={ACCENT_COLOR}
					strokeWidth={2}
				/>
			</LineChart>
		</ChartContainer>
	);
}

function MetricCard({
	metric,
	data,
	isSelected,
	onSelect,
}: {
	metric: MetricDefinition;
	data: MetricDatum[];
	isSelected: boolean;
	onSelect: () => void;
}) {
	const { icon: Icon } = metricVisual(metric.key);
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
	const showTrend = changeType !== "neutral";

	return (
		<FramePanel
			role="button"
			tabIndex={0}
			aria-pressed={isSelected}
			aria-label={`Show ${metric.label} trend`}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			style={
				{
					"--tw-ring-color": isSelected ? ACCENT_COLOR : "transparent",
				} as CSSProperties
			}
			className={cn(
				"group min-h-[148px] cursor-pointer p-0! ring-2 ring-inset transition-[transform,box-shadow] outline-none",
				"hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
				"focus-visible:ring-2 focus-visible:ring-primary",
				isSelected ? "bg-primary/[0.04]" : "hover:bg-muted/20"
			)}
		>
			<div className="relative h-full min-h-[148px]">
				<DottedChartBackground />
				<div className="relative z-10 flex items-start gap-2.5 p-4">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Icon className="size-[18px]" aria-hidden />
					</span>
					<div className="min-w-0">
						<h3 className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							{metric.label}
						</h3>
						<div className="mt-1 text-xl font-bold leading-none tabular-nums text-foreground">
							{metric.isLoading ? (
								"—"
							) : (
								<AnimatedNumber value={metric.value ?? 0} format={metric.format} />
							)}
						</div>
						<div className="mt-1.5 min-h-4">
							{showTrend ? (
								<span
									className={cn(
										"inline-flex items-center gap-0.5 text-xs font-medium",
										trendClass
									)}
								>
									<TrendIcon className="size-3" aria-hidden />
									{Math.abs(metric.changePercent ?? 0).toFixed(1)}%
								</span>
							) : metric.subtitle ? (
								<span className="truncate text-[11px] text-muted-foreground">
									{metric.subtitle}
								</span>
							) : null}
						</div>
					</div>
				</div>
				<MetricSparkline data={data} dataKey={metric.key} />
			</div>
		</FramePanel>
	);
}

export function MetricCards({
	metrics,
	dataByMetric,
	activeMetric,
	onSelect,
}: {
	metrics: MetricDefinition[];
	dataByMetric: Record<string, MetricDatum[]>;
	activeMetric: string;
	onSelect: (key: string) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
			{metrics.map((metric) => (
				<MetricCard
					key={metric.key}
					metric={metric}
					data={dataByMetric[metric.key] ?? []}
					isSelected={activeMetric === metric.key}
					onSelect={() => onSelect(metric.key)}
				/>
			))}
		</div>
	);
}
