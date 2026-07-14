"use client";

import { useId, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Area, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
import {
	Frame,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = 30;

const SERIES = [
	{ key: "success", label: "Successful", color: "var(--primary)" },
	{ key: "failed", label: "Failed", color: "var(--destructive)" },
] as const;

const chartConfig: ChartConfig = Object.fromEntries(
	SERIES.map(({ key, label, color }) => [key, { label, color }])
);

const dayLabel = (value: number) =>
	new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});

function ThroughputTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: { day: number; success: number; failed: number } }[];
}) {
	if (!active || !payload?.length) return null;
	const point = payload[0].payload;
	return (
		<div className="bg-popover min-w-[150px] rounded-lg border p-3 shadow-lg">
			<div className="text-popover-foreground border-border/50 mb-2 border-b pb-1.5 text-sm font-semibold">
				{dayLabel(point.day)}
			</div>
			<div className="flex flex-col gap-1.5">
				{SERIES.map(({ key, label, color }) => (
					<div key={key} className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<span
								className="size-2.5 rounded-sm"
								style={{ backgroundColor: color }}
							/>
							<span className="text-muted-foreground text-xs font-medium">
								{label}
							</span>
						</div>
						<span className="text-popover-foreground text-sm font-semibold tabular-nums">
							{point[key].toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function RunThroughputChart({ className }: { className?: string }) {
	const patternPrefix = useId();
	const SUCCESS_STRIPE_ID = stripeId(patternPrefix, 0);
	const FAILED_STRIPE_ID = stripeId(patternPrefix, 1);
	const raw = useQuery(api.automations.getRunThroughput, {
		windowDays: WINDOW_DAYS,
	});
	const loading = raw === undefined;

	const { data, total, delta, positive } = useMemo(() => {
		// Bands chart success/failed only; skipped still counts toward the headline total.
		const points = (raw ?? []).map((d) => ({
			day: d.day,
			success: d.success,
			failed: d.failed,
			runs: d.success + d.failed + d.skipped,
		}));
		const sum = points.reduce((s, p) => s + p.runs, 0);
		const mid = Math.floor(points.length / 2);
		const prior = points.slice(0, mid).reduce((s, p) => s + p.runs, 0);
		const recent = points.slice(mid).reduce((s, p) => s + p.runs, 0);
		const change = prior > 0 ? (recent - prior) / prior : null;
		return {
			data: points,
			total: sum,
			delta: change,
			positive: change != null && change >= 0,
		};
	}, [raw]);

	return (
		<Frame className={cn("w-full", className)}>
			<FrameHeader className="flex-row items-center justify-between gap-2">
				<FrameTitle>Run activity</FrameTitle>
				<span className="text-muted-foreground text-xs font-medium">
					Last {WINDOW_DAYS} days
				</span>
			</FrameHeader>

			<FramePanel className="flex grow flex-col">
				<div className="flex flex-col gap-1">
					<div className="text-muted-foreground text-xs font-medium">
						Total runs
					</div>
					<div className="flex items-center gap-2.5">
						<span className="text-2xl leading-none font-semibold tabular-nums text-foreground">
							{total.toLocaleString()}
						</span>
						{delta != null && (
							<span
								className={cn(
									"inline-flex items-center gap-1 text-xs font-medium [&_svg]:size-4",
									positive ? "text-emerald-500" : "text-rose-500"
								)}
							>
								{positive ? (
									<TrendingUp aria-hidden />
								) : (
									<TrendingDown aria-hidden />
								)}
								{positive ? "+" : ""}
								{(delta * 100).toFixed(1)}%
							</span>
						)}
					</div>
				</div>

				<div className="mt-auto pt-4">
					{!loading && (
						<div className="mb-2 flex items-center justify-end gap-4">
							{SERIES.map(({ key, label, color }) => (
								<div key={key} className="flex items-center gap-1.5">
									<span
										className="size-2 rounded-sm"
										style={{ backgroundColor: color }}
									/>
									<span className="text-muted-foreground text-xs font-medium">
										{label}
									</span>
								</div>
							))}
						</div>
					)}
					{loading ? (
						<div className="h-[240px] w-full rounded-md bg-muted motion-safe:animate-pulse" />
					) : (
						<ChartContainer config={chartConfig} className="h-[240px] w-full">
							<ComposedChart
								accessibilityLayer
								data={data}
								margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
							>
								<ChartStripeDefs
									idPrefix={patternPrefix}
									colors={["var(--primary)", "var(--destructive)"]}
								/>
								<CartesianGrid
									vertical={false}
									strokeDasharray="3 3"
									stroke="var(--border)"
								/>
								<XAxis
									dataKey="day"
									tickLine={false}
									axisLine={false}
									tickMargin={10}
									minTickGap={28}
									tick={{ fontSize: 12 }}
									tickFormatter={dayLabel}
								/>
								<YAxis hide />
								<ChartTooltip cursor={false} content={<ThroughputTooltip />} />
								{/* First Area = stack bottom: failures hug the baseline, success stroke traces the total */}
								<Area
									type="monotone"
									dataKey="failed"
									stackId="runs"
									fill={`url(#${FAILED_STRIPE_ID})`}
									stroke="transparent"
									activeDot={false}
								/>
								<Area
									type="monotone"
									dataKey="success"
									stackId="runs"
									fill={`url(#${SUCCESS_STRIPE_ID})`}
									stroke="var(--primary)"
									strokeWidth={2.5}
									activeDot={{
										r: 5,
										fill: "var(--primary)",
										stroke: "var(--background)",
										strokeWidth: 2,
									}}
								/>
							</ComposedChart>
						</ChartContainer>
					)}
				</div>
			</FramePanel>
		</Frame>
	);
}
