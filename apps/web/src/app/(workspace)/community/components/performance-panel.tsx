"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Eye, Send, Percent, Clock, TrendingUp, TrendingDown } from "lucide-react";

import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_CATEGORICAL, getChartColor } from "@/lib/chart-colors";
import {
	ChartStripeDefs,
	stripeId,
} from "@/components/charts/chart-stripe-defs";
import { EmptyState } from "@/components/domain/empty-state";
import { cn } from "@/lib/utils";

export type RangeDays = 7 | 30 | 90;

interface DashboardStats {
	views: number;
	viewsPrevious: number;
	requests: number;
	requestsPrevious: number;
	conversionPct: number | null;
	medianFirstResponseMs: number | null;
	waitingCount: number;
	series: Array<{ day: string; views: number; requests: number }>;
}

interface PerformancePanelProps {
	stats: DashboardStats | undefined;
	days: RangeDays;
	onDaysChange: (days: RangeDays) => void;
}

/** "4h", "35m", "2d", or plain words when nothing has been picked up yet. */
function formatDuration(ms: number | null): string {
	if (ms === null) return "None yet";
	const minutes = Math.round(ms / 60_000);
	if (minutes < 60) return `${Math.max(minutes, 1)}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/** "Jun 4" from a UTC day key, read back in UTC so it names the bucket it is. */
function formatDayLabel(day: string): string {
	const [year, month, date] = day.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function Delta({ current, previous }: { current: number; previous: number }) {
	if (previous === 0) {
		return (
			<span className="text-xs text-muted-foreground">
				{current === 0 ? "No activity yet" : "First period of data"}
			</span>
		);
	}
	const change = Math.round(((current - previous) / previous) * 100);
	if (change === 0) {
		return <span className="text-xs text-muted-foreground">Flat</span>;
	}
	const up = change > 0;
	const Icon = up ? TrendingUp : TrendingDown;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-xs font-medium",
				up ? "text-success-foreground" : "text-muted-foreground"
			)}
		>
			<Icon className="size-3.5" aria-hidden="true" />
			{up ? "+" : ""}
			{change}%
		</span>
	);
}

function Tile({
	icon: Icon,
	label,
	value,
	footer,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	footer: React.ReactNode;
}) {
	return (
		<div className="rounded-lg bg-background p-4">
			<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Icon className="size-3.5" aria-hidden="true" />
				{label}
			</p>
			<p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-foreground">
				{value}
			</p>
			<p className="mt-1">{footer}</p>
		</div>
	);
}

const SERIES_COLOR = getChartColor(0, CHART_CATEGORICAL);

const CHART_CONFIG = {
	views: { label: "Views", color: SERIES_COLOR },
} satisfies ChartConfig;

/**
 * The results read: four numbers and the shape of the traffic behind them.
 * Views are counted first-party (see convex/communityAnalytics.ts), so the
 * conversion figure divides two numbers from the same source.
 */
export function PerformancePanel({
	stats,
	days,
	onDaysChange,
}: PerformancePanelProps) {
	const chartData = React.useMemo(
		() =>
			(stats?.series ?? []).map((point) => ({
				...point,
				label: formatDayLabel(point.day),
			})),
		[stats]
	);
	const hasViews = (stats?.views ?? 0) > 0;
	const patternPrefix = React.useId();

	return (
		<div className="flex h-full flex-col rounded-xl border border-border bg-muted/40 p-[3px]">
			<div className="flex items-center justify-between gap-4 px-3 py-2.5">
				<h2 className="text-sm font-semibold text-foreground">Performance</h2>
				<SegmentedControl
					value={String(days)}
					onValueChange={(next) => onDaysChange(Number(next) as RangeDays)}
					options={[
						{ value: "7", label: "7d" },
						{ value: "30", label: "30d" },
						{ value: "90", label: "90d" },
					]}
				/>
			</div>

			{stats === undefined ? (
				<div className="flex flex-1 flex-col gap-[3px]">
					<div className="grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
						{Array.from({ length: 4 }).map((_, index) => (
							<Skeleton key={index} className="h-24 rounded-lg" />
						))}
					</div>
					<Skeleton className="min-h-64 flex-1 rounded-lg" />
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-[3px]">
					<div className="grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
						<Tile
							icon={Eye}
							label="Page views"
							value={stats.views.toLocaleString()}
							footer={
								<Delta current={stats.views} previous={stats.viewsPrevious} />
							}
						/>
						<Tile
							icon={Send}
							label="Quote requests"
							value={stats.requests.toLocaleString()}
							footer={
								<Delta
									current={stats.requests}
									previous={stats.requestsPrevious}
								/>
							}
						/>
						<Tile
							icon={Percent}
							label="Visit to request"
							value={
								stats.conversionPct === null
									? "N/A"
									: `${stats.conversionPct.toFixed(1)}%`
							}
							footer={
								<span className="text-xs text-muted-foreground">
									{stats.conversionPct === null
										? "Needs views to measure"
										: "of visitors asked for a quote"}
								</span>
							}
						/>
						<Tile
							icon={Clock}
							label="Median first response"
							value={formatDuration(stats.medianFirstResponseMs)}
							footer={
								stats.waitingCount > 0 ? (
									<span className="text-xs font-medium text-warning-foreground">
										{stats.waitingCount} waiting
									</span>
								) : (
									<span className="text-xs text-muted-foreground">
										Measured when you pick a request up
									</span>
								)
							}
						/>
					</div>

					<div className="flex flex-1 flex-col rounded-lg bg-background p-4">
						<p className="text-xs text-muted-foreground">
							Page views, last {days} days
						</p>
						{hasViews ? (
							<ChartContainer
								config={CHART_CONFIG}
								className="mt-3 aspect-auto min-h-56 w-full flex-1"
							>
								<BarChart
									data={chartData}
									margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
								>
									<ChartStripeDefs
										idPrefix={patternPrefix}
										colors={[SERIES_COLOR]}
									/>
									<CartesianGrid
										strokeDasharray="3 3"
										vertical={false}
										stroke="var(--border)"
									/>
									<XAxis
										dataKey="label"
										axisLine={false}
										tickLine={false}
										tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
										tickMargin={8}
										interval="preserveStartEnd"
										minTickGap={24}
									/>
									<YAxis
										axisLine={false}
										tickLine={false}
										allowDecimals={false}
										width={32}
										tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
									/>
									<ChartTooltip
										cursor={{ fill: "var(--muted)", opacity: 0.3 }}
										content={<ChartTooltipContent />}
									/>
									<Bar dataKey="views" radius={[4, 4, 0, 0]} maxBarSize={36}>
										{chartData.map((point) => (
											<Cell
												key={point.day}
												fill={`url(#${stripeId(patternPrefix, 0)})`}
												stroke={SERIES_COLOR}
												strokeWidth={1}
											/>
										))}
									</Bar>
								</BarChart>
							</ChartContainer>
						) : (
							// No illustration: the requests table below already carries one,
							// and two on the same screen reads as decoration.
							<div className="flex min-h-56 flex-1 items-center justify-center">
								<EmptyState
									size="md"
									title="No views counted yet"
									description="Numbers start the moment someone opens your page."
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
