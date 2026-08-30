"use client";

import { useId, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";
import { EmptyState } from "@/components/domain/empty-state";
import { Frame, FramePanel } from "@/components/reui/frame";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import {
	periodLabel,
	usePeriodRange,
	type DashboardPeriod,
} from "./dashboard-period";

const VISIBLE_CLIENTS = 5;
const SLOT_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
	"var(--chart-6)",
];
const OTHER_COLOR = "var(--muted-foreground)";

// Stacked buckets one step finer than the period window.
const STACK_GRANULARITY: Record<DashboardPeriod, "day" | "week" | "month"> = {
	week: "day",
	month: "week",
	year: "month",
};

type StackRow = Record<string, number | string> & { date: string };

function bucketLabel(date: string, period: DashboardPeriod): string {
	if (period === "year") {
		const [year, month] = date.split("-");
		return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
			"en-US",
			{ month: "short" }
		);
	}
	return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function StackTooltip({
	active,
	payload,
	label,
	names,
	colors,
	period,
}: {
	active?: boolean;
	payload?: Array<{ dataKey: string; value: number }>;
	label?: string;
	names: string[];
	colors: string[];
	period: DashboardPeriod;
}) {
	if (!active || !payload?.length) return null;
	const rows = payload.filter((row) => row.value > 0).reverse();
	return (
		<div className="rounded-lg border bg-popover p-2.5 shadow-lg">
			<div className="text-[11px] font-medium text-muted-foreground">
				{label ? bucketLabel(label, period) : ""}
			</div>
			<div className="mt-1.5 space-y-1">
				{rows.map((row) => {
					const slot = Number(String(row.dataKey).slice(1));
					return (
						<div key={row.dataKey} className="flex items-center gap-1.5">
							<span
								aria-hidden
								className="size-1.5 shrink-0 rounded-full"
								style={{ backgroundColor: colors[slot] }}
							/>
							<span className="max-w-40 truncate text-xs text-muted-foreground">
								{names[slot]}
							</span>
							<span className="ml-auto pl-3 text-sm font-semibold tabular-nums text-popover-foreground">
								{formatCurrency(row.value)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function TopClientsCard({
	period,
	className,
}: {
	period: DashboardPeriod;
	className?: string;
}) {
	const isOrgSwitching = useIsOrgSwitching();
	const range = usePeriodRange(period);
	const patternPrefix = useId();

	const result = useQuery(api.dashboardStats.getTopClientsByRevenue, {
		startDate: range.startDate,
		endDate: range.endDate,
		limit: VISIBLE_CLIENTS,
		granularity: STACK_GRANULARITY[period],
	});

	const isLoading = isOrgSwitching || result === undefined;
	const grandTotal = result?.grandTotal ?? 0;
	const topClient = result?.clients[0];

	const { names, colors, data } = useMemo(() => {
		if (!result || result.clients.length === 0)
			return { names: [] as string[], colors: [] as string[], data: [] as StackRow[] };
		const names = result.clients.map((c) => c.name);
		const colors = result.clients.map(
			(_, i) => SLOT_COLORS[i % SLOT_COLORS.length]
		);
		if (result.otherTotal > 0) {
			names.push("All others");
			colors.push(OTHER_COLOR);
		}
		const data: StackRow[] = result.series.map((bucket) => {
			const row: StackRow = { date: bucket.date };
			bucket.totals.forEach((value, slot) => {
				row[`s${slot}`] = value;
			});
			return row;
		});
		return { names, colors, data };
	}, [result]);

	const chartConfig: ChartConfig = useMemo(
		() =>
			Object.fromEntries(
				names.map((name, i) => [`s${i}`, { label: name, color: colors[i] }])
			),
		[names, colors]
	);

	return (
		<Frame className={cn("w-full", className)}>
			<FramePanel className="flex grow flex-col gap-4">
				<div className="min-w-0">
					<h3 className="text-base font-semibold text-foreground">
						Top clients
					</h3>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Who the revenue came from {periodLabel(period)}.
					</p>
				</div>

				<div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
					<div>
						<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							Collected
						</div>
						{isLoading ? (
							<Skeleton className="mt-1 h-7 w-24" />
						) : (
							<div className="text-2xl font-bold tabular-nums text-foreground">
								{formatCurrency(grandTotal, { whole: true })}
							</div>
						)}
					</div>
					{!isLoading && topClient && (
						<div className="min-w-0">
							<div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								Biggest: {topClient.name}
							</div>
							<div className="text-2xl font-semibold tabular-nums text-muted-foreground">
								{Math.round(topClient.share * 100)}%
							</div>
						</div>
					)}
				</div>

				{isLoading ? (
					<Skeleton className="min-h-[220px] w-full flex-1 rounded-lg" />
				) : data.length === 0 ? (
					<EmptyState
						illustration="clients-none"
						title="No revenue yet"
						description={`Once payments land ${periodLabel(period)}, your biggest clients rank here.`}
						className="min-h-[220px] flex-1 justify-center"
					/>
				) : (
					<>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
							{names.map((name, i) => (
								<span key={`s${i}`} className="flex min-w-0 items-center gap-1.5">
									<span
										aria-hidden
										className="size-1.5 shrink-0 rounded-full"
										style={{ backgroundColor: colors[i] }}
									/>
									<span className="max-w-32 truncate">{name}</span>
								</span>
							))}
						</div>
						<ChartContainer
							config={chartConfig}
							className="aspect-auto min-h-[200px] w-full flex-1"
							style={{ width: "100%" }}
						>
							<BarChart
								data={data}
								margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
								barCategoryGap="22%"
							>
								<ChartStripeDefs idPrefix={patternPrefix} colors={colors} />
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
									tickMargin={8}
									interval="preserveStartEnd"
									minTickGap={24}
									tickFormatter={(value: string) => bucketLabel(value, period)}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
									tickMargin={8}
									width={56}
									tickCount={4}
									tickFormatter={(value: number) =>
										formatCurrency(value, { compact: true })
									}
								/>
								<ChartTooltip
									content={
										<StackTooltip
											names={names}
											colors={colors}
											period={period}
										/>
									}
									cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
								/>
								{names.map((_, i) => (
									<Bar
										key={`s${i}`}
										dataKey={`s${i}`}
										stackId="clients"
										fill={`url(#${stripeId(patternPrefix, i)})`}
										stroke={colors[i]}
										strokeWidth={0}
										radius={
											i === names.length - 1 ? [4, 4, 0, 0] : undefined
										}
										isAnimationActive={false}
									/>
								))}
							</BarChart>
						</ChartContainer>
					</>
				)}
			</FramePanel>
		</Frame>
	);
}
