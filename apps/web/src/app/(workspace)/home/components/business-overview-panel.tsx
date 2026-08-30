"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Line, LineChart, XAxis } from "recharts";
import {
	Banknote,
	Briefcase,
	CalendarClock,
	CheckCircle2,
	Receipt,
	UserPlus,
	type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { DotField } from "@/components/ui/dot-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	HOME_TOUR_CONTENT,
	HomeTour,
	HomeTourContext,
	TourElement,
} from "@/components/tours";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import { AttentionQueue } from "./attention-queue";
import {
	bucketDatesForRange,
	DASHBOARD_PERIODS,
	periodLabel,
	previousPeriodLabel,
	usePeriodRange,
	type DashboardPeriod,
} from "./dashboard-period";

type Tone = "positive" | "negative" | "neutral";

const TONE_BADGE = {
	positive: "success-light",
	negative: "destructive-light",
	neutral: "secondary",
} as const;

type SparkPoint = { label: string; value: number | null };

interface Tile {
	id: string;
	label: string;
	icon: LucideIcon;
	value: string;
	delta: string | null;
	tone: Tone;
	summary: string;
	series: SparkPoint[] | null;
	formatPoint: (value: number) => string;
	isLoading: boolean;
}

const sparkConfig = { value: { label: "Value", color: "var(--primary)" } };

function SparkTooltip({
	active,
	payload,
	label,
	format,
}: {
	active?: boolean;
	payload?: Array<{ payload: SparkPoint }>;
	label: string;
	format: (value: number) => string;
}) {
	const point = payload?.[0]?.payload;
	if (!active || !point || point.value === null) return null;
	return (
		<div className="min-w-28 rounded-lg border bg-popover p-2.5 shadow-sm">
			<div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
				{label} / {point.label}
			</div>
			<div className="text-sm font-semibold tabular-nums text-popover-foreground">
				{format(point.value)}
			</div>
		</div>
	);
}

function Sparkline({ tile }: { tile: Tile }) {
	return (
		<ChartContainer
			config={sparkConfig}
			initialDimension={{ width: 104, height: 48 }}
			className="aspect-auto h-12 w-16 shrink-0 xl:w-24"
			aria-label={`${tile.label} trend`}
		>
			<LineChart
				data={tile.series ?? []}
				margin={{ top: 6, right: 2, bottom: 6, left: 2 }}
			>
				<XAxis dataKey="label" hide />
				<ChartTooltip
					content={
						<SparkTooltip label={tile.label} format={tile.formatPoint} />
					}
					allowEscapeViewBox={{ x: true, y: true }}
					wrapperStyle={{ zIndex: 50 }}
				/>
				<Line
					type="natural"
					dataKey="value"
					stroke="var(--color-value)"
					strokeWidth={1.5}
					dot={false}
					// Avg job value has null days (no invoice paid); bridge them so the
					// trend reads as one line instead of dashes.
					connectNulls
					activeDot={{
						r: 2.5,
						fill: "var(--background)",
						stroke: "var(--color-value)",
						strokeWidth: 1.5,
					}}
					isAnimationActive={false}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</LineChart>
		</ChartContainer>
	);
}


function MetricTile({ tile }: { tile: Tile }) {
	return (
		<div
			className={cn(
				"flex min-w-0 flex-col px-1.5 py-4 sm:px-4",
				// 1 column → 3 columns (sm) → 6 columns (lg); the rules re-cut the
				// hairlines at each step so no divider ever hangs off a row edge.
				"border-t border-border/70 first:border-t-0",
				"sm:border-t-0 sm:[&:nth-child(n+4)]:border-t",
				"sm:border-l sm:[&:nth-child(3n+1)]:border-l-0",
				"lg:[&:nth-child(n+4)]:border-t-0",
				// Only tile 4 needs re-adding at lg; matching 3n+1 would also hit
				// tile 1, and that add wins the specificity tie against first:border-l-0.
				"lg:[&:nth-child(3n+4)]:border-l"
			)}
		>
			<div className="mb-2 flex min-w-0 items-center gap-2">
				<tile.icon
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<span className="truncate text-xs font-medium">{tile.label}</span>
			</div>

			<div className="flex items-center gap-0">
				<div className="flex min-w-0 flex-1 items-center pr-2 xl:pr-3">
					{tile.isLoading ? (
						<Skeleton className="h-7 w-20" />
					) : (
						<span
							className={cn(
								"font-semibold tabular-nums",
								// Number-only tiles spend the sparkline space on the number.
								tile.series ? "text-xl" : "text-2xl xl:text-3xl"
							)}
						>
							{tile.value}
						</span>
					)}
				</div>
				{tile.series && (
					<div className="flex shrink-0 items-end justify-center">
						<Sparkline tile={tile} />
					</div>
				)}
			</div>
			{/* Full-width footer pinned to the tile bottom so all six align. */}
			<div className="mt-auto flex min-w-0 items-center gap-1.5 pt-1.5">
				{tile.delta && (
					<Badge variant={TONE_BADGE[tile.tone]} size="sm">
						{tile.delta}
					</Badge>
				)}
				<span className="truncate text-xs text-muted-foreground">
					{tile.summary}
				</span>
			</div>
		</div>
	);
}

function percentDelta(current: number, previous: number): string | null {
	if (previous === 0) return current === 0 ? null : "New";
	const pct = ((current - previous) / Math.abs(previous)) * 100;
	if (!Number.isFinite(pct)) return null;
	return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

function toneFor(
	current: number,
	previous: number,
	lowerIsBetter = false
): Tone {
	if (current === previous) return "neutral";
	const better = lowerIsBetter ? current < previous : current > previous;
	return better ? "positive" : "negative";
}

function shortLabel(date: string): string {
	// Bucket keys are "YYYY-MM-DD" (day) or "YYYY-MM" (month).
	const parts = date.split("-");
	return parts.length === 3 ? `${parts[1]}/${parts[2]}` : date;
}

/**
 * Running total over every bucket in the period, so a quiet org still draws a
 * full-width line. Rows arrive as daily "YYYY-MM-DD" keys; truncating to the
 * bucket-key length rolls them up when the period buckets by month.
 */
function cumulative(
	rows: Array<{ date: string; count: number }>,
	bucketDates: string[]
): SparkPoint[] {
	const keyLength = bucketDates[0]?.length ?? 10;
	const byDate = new Map<string, number>();
	for (const row of rows) {
		const key = row.date.slice(0, keyLength);
		byDate.set(key, (byDate.get(key) ?? 0) + row.count);
	}
	let running = 0;
	return bucketDates.map((date) => {
		running += byDate.get(date) ?? 0;
		return { label: shortLabel(date), value: running };
	});
}

export function BusinessOverviewPanel({
	period,
	onPeriodChange,
}: {
	period: DashboardPeriod;
	onPeriodChange: (period: DashboardPeriod) => void;
}) {
	const range = usePeriodRange(period);

	const homeArgs = { from: range.startDate, to: range.endDate };
	const prevHomeArgs = {
		from: range.previous.startDate,
		to: range.previous.endDate,
	};
	const statsArgs = {
		startDate: range.startDate,
		endDate: range.endDate,
		granularity: range.granularity,
	};
	const prevStatsArgs = {
		startDate: range.previous.startDate,
		endDate: range.previous.endDate,
		granularity: range.granularity,
	};

	const revenue = useQuery(api.homeStats.getRevenueByDateRange, homeArgs);
	const prevRevenue = useQuery(
		api.homeStats.getRevenueByDateRange,
		prevHomeArgs
	);
	const clients = useQuery(
		api.homeStats.getClientsCreatedByDateRange,
		homeArgs
	);
	const projects = useQuery(
		api.homeStats.getProjectsCompletedByDateRange,
		homeArgs
	);
	const avgJobValue = useQuery(api.dashboardStats.getAvgJobValue, statsArgs);
	const prevAvgJobValue = useQuery(
		api.dashboardStats.getAvgJobValue,
		prevStatsArgs
	);
	const avgDaysToPay = useQuery(api.dashboardStats.getAvgDaysToPay, {});
	const activeJobs = useQuery(api.dashboardStats.getActiveJobCount, {});

	const inPeriod = periodLabel(period);
	const vsPrevious = previousPeriodLabel(period);

	const tiles: Tile[] = useMemo(() => {
		const bucketDates = bucketDatesForRange(range);
		const revenueTotal = (revenue ?? []).reduce((sum, r) => sum + r.count, 0);
		const prevRevenueTotal = (prevRevenue ?? []).reduce(
			(sum, r) => sum + r.count,
			0
		);

		const clientsInRange = clients?.totalInRange ?? 0;
		const clientBaseline = clients?.baselineCount ?? 0;

		const jobsInRange = projects?.totalInRange ?? 0;
		const jobsBaseline = projects?.baselineCount ?? 0;

		const avgValue = avgJobValue?.value ?? 0;
		const prevAvgValue = prevAvgJobValue?.value ?? 0;

		const days = avgDaysToPay?.days;
		const prevDays = avgDaysToPay?.prevDays;

		return [
			{
				id: "revenue",
				label: "Revenue collected",
				icon: Banknote,
				value: formatCurrency(revenueTotal, { whole: true }),
				delta: percentDelta(revenueTotal, prevRevenueTotal),
				tone: toneFor(revenueTotal, prevRevenueTotal),
				summary: vsPrevious,
				series: cumulative(revenue ?? [], bucketDates),
				formatPoint: (v) => formatCurrency(v, { whole: true }),
				isLoading: revenue === undefined,
			},
			{
				id: "clients",
				label: "New clients",
				icon: UserPlus,
				value: clientsInRange.toLocaleString(),
				delta: percentDelta(
					clientBaseline + clientsInRange,
					clientBaseline
				),
				tone: toneFor(clientBaseline + clientsInRange, clientBaseline),
				summary: `${(clientBaseline + clientsInRange).toLocaleString()} total`,
				series: cumulative(clients?.data ?? [], bucketDates),
				formatPoint: (v) => v.toLocaleString(),
				isLoading: clients === undefined,
			},
			{
				id: "jobs",
				label: "Jobs completed",
				icon: CheckCircle2,
				value: jobsInRange.toLocaleString(),
				delta: percentDelta(jobsBaseline + jobsInRange, jobsBaseline),
				tone: toneFor(jobsBaseline + jobsInRange, jobsBaseline),
				summary: `${(jobsBaseline + jobsInRange).toLocaleString()} all time`,
				series: cumulative(projects?.data ?? [], bucketDates),
				formatPoint: (v) => v.toLocaleString(),
				isLoading: projects === undefined,
			},
			{
				id: "avg-job-value",
				label: "Avg job value",
				icon: Receipt,
				value:
					avgJobValue?.value == null
						? "No data"
						: formatCurrency(avgJobValue.value, { whole: true }),
				delta: percentDelta(avgValue, prevAvgValue),
				tone: toneFor(avgValue, prevAvgValue),
				summary: vsPrevious,
				series: (avgJobValue?.series ?? []).map((point) => ({
					label: shortLabel(point.date),
					value: point.value,
				})),
				formatPoint: (v) => formatCurrency(v, { whole: true }),
				isLoading: avgJobValue === undefined,
			},
			{
				id: "days-to-pay",
				label: "Avg days to pay",
				icon: CalendarClock,
				value: days == null ? "No data" : `${days} days`,
				delta:
					days == null || prevDays == null
						? null
						: percentDelta(days, prevDays),
				tone:
					days == null || prevDays == null
						? "neutral"
						: toneFor(days, prevDays, true),
				summary: "Last 30 days",
				series: null,
				formatPoint: (v) => `${v}`,
				isLoading: avgDaysToPay === undefined,
			},
			{
				id: "active-jobs",
				label: "Open jobs",
				icon: Briefcase,
				value: (
					(activeJobs?.inProgress ?? 0) + (activeJobs?.planned ?? 0)
				).toLocaleString(),
				delta: null,
				tone: "neutral",
				summary: `${(activeJobs?.inProgress ?? 0).toLocaleString()} in progress, ${(activeJobs?.planned ?? 0).toLocaleString()} planned`,
				series: null,
				formatPoint: (v) => `${v}`,
				isLoading: activeJobs === undefined,
			},
		];
	}, [
		range,
		revenue,
		prevRevenue,
		clients,
		projects,
		avgJobValue,
		prevAvgJobValue,
		avgDaysToPay,
		activeJobs,
		vsPrevious,
	]);

	return (
		<Frame className="w-full text-foreground">
			<FrameHeader className="flex-row flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<FrameTitle>
						<h2>Business overview</h2>
					</FrameTitle>
					<FrameDescription className="text-xs">
						What you collected, won, and finished {inPeriod}.
					</FrameDescription>
				</div>

				<Tabs
					value={period}
					onValueChange={(value) => onPeriodChange(value as DashboardPeriod)}
					className="w-full shrink-0 sm:w-auto"
				>
					<TabsList
						className="grid h-9 w-full grid-cols-3 sm:w-auto"
						aria-label="Overview period"
					>
						{DASHBOARD_PERIODS.map((option) => (
							<TabsTrigger
								key={option.value}
								value={option.value}
								className="text-xs sm:min-w-16"
							>
								{option.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</FrameHeader>

			<FramePanel className="isolate overflow-visible [&::before]:z-0">
				<DotField className="rounded-[calc(var(--frame-radius)-1px)] text-muted-foreground [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

				<div className="relative z-10 grid grid-cols-1 items-stretch sm:grid-cols-3 lg:grid-cols-6">
					{tiles.map((tile) => (
						<MetricTile key={tile.id} tile={tile} />
					))}
				</div>
			</FramePanel>

			<FrameFooter className="px-4 py-4">
				<TourElement<HomeTour>
					TourContext={HomeTourContext}
					stepId={HomeTour.TASKS}
					title={HOME_TOUR_CONTENT[HomeTour.TASKS].title}
					description={HOME_TOUR_CONTENT[HomeTour.TASKS].description}
					tooltipPosition={HOME_TOUR_CONTENT[HomeTour.TASKS].tooltipPosition}
				>
					<AttentionQueue />
				</TourElement>
			</FrameFooter>
		</Frame>
	);
}
