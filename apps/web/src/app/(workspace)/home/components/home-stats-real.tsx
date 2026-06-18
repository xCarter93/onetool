"use client";

import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "@/components/stat-card-skeleton";
import { ChartSkeleton } from "@/components/chart-skeleton";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import LineChart6, {
	type MetricDatum,
	type MetricDataMap,
	type MetricDefinition,
} from "@/components/line-chart-6";
import type { ChartConfig } from "@/components/ui/chart";
import { DateRange } from "react-day-picker";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Briefcase,
	DollarSign,
	FileText,
	ListChecks,
	Receipt,
	Users,
	type LucideIcon,
} from "lucide-react";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import { AnimatedNumber } from "@/components/animated-number";
import { StatCardSparkline } from "@/components/stat-card-sparkline";
import { cn } from "@/lib/utils";

type ChartInput = Array<{
	date: string;
	count: number;
	_creationTime: number;
}>;

type RangeSeriesResult = {
	baselineCount: number;
	totalInRange: number;
	totalThroughEnd: number;
	data: ChartInput;
};

const parseLocalDate = (dateString: string) =>
	new Date(`${dateString}T00:00:00`);

type RangeTotals = {
	baseline: number;
	endTotal: number;
	percentChange: number;
	changeType: "increase" | "decrease" | "neutral";
	addedInRange: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

const processDataForChart = (
	data: ChartInput,
	dataKey: string,
	isCumulative = false,
	range?: DateRange,
	baseline = 0
): MetricDatum[] => {
	const now = new Date();
	const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	const effectiveStart = range?.from ? startOfDay(range.from) : defaultStart;
	const effectiveEnd = range?.to ? endOfDay(range.to) : endOfDay(defaultEnd);

	const allDates: string[] = [];
	const current = new Date(effectiveStart);

	while (current <= effectiveEnd) {
		const year = current.getFullYear();
		const month = String(current.getMonth() + 1).padStart(2, "0");
		const day = String(current.getDate()).padStart(2, "0");
		allDates.push(`${year}-${month}-${day}`);
		current.setDate(current.getDate() + 1);
	}

	const grouped = (data || []).reduce<Record<string, number>>((acc, item) => {
		acc[item.date] = (acc[item.date] ?? 0) + item.count;
		return acc;
	}, {});

	let cumulative = isCumulative ? baseline : 0;
	return allDates.map((date) => {
		const rawValue = grouped[date] ?? 0;
		const value =
			typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
		if (isCumulative) {
			cumulative += value;
			return { date, [dataKey]: cumulative } as MetricDatum;
		}
		return { date, [dataKey]: value } as MetricDatum;
	});
};

const filterByRange = (data: MetricDatum[], range?: DateRange) => {
	if (!range?.from && !range?.to) return data;
	const from = range?.from ? startOfDay(range.from) : undefined;
	const to = range?.to ? endOfDay(range.to) : undefined;

	return data.filter((item) => {
		const valueDate = startOfDay(parseLocalDate(item.date));
		if (from && valueDate < from) return false;
		if (to && valueDate > to) return false;
		return true;
	});
};

const formatRangeLabel = (range?: DateRange) => {
	if (!range?.from && !range?.to) return "All time";
	if (range?.from && range?.to) {
		return `${format(range.from, "LLL d, yyyy")} - ${format(range.to, "LLL d, yyyy")}`;
	}
	if (range?.from) {
		return format(range.from, "LLL d, yyyy");
	}
	return "Pick a range";
};

const sumCounts = (data: ChartInput) =>
	(data || []).reduce((sum, item) => sum + (item.count ?? 0), 0);

const safeNumber = (val?: number) => (typeof val === "number" ? val : 0);

const getRangeTotals = (
	series?: RangeSeriesResult,
	fallbackTotal = 0
): RangeTotals => {
	const addedInRange = series?.totalInRange ?? sumCounts(series?.data ?? []);
	const baseline = series ? series.baselineCount : fallbackTotal;
	const endTotal = series ? series.baselineCount + addedInRange : fallbackTotal;
	const changeValue = endTotal - baseline;
	const percentChange =
		baseline === 0
			? changeValue > 0
				? 100
				: 0
			: (changeValue / baseline) * 100;
	const changeType: RangeTotals["changeType"] =
		changeValue > 0 ? "increase" : changeValue < 0 ? "decrease" : "neutral";

	return {
		baseline,
		endTotal,
		percentChange,
		changeType,
		addedInRange,
	};
};

/* ── Per-metric visuals for the KPI chips ─────────────────────────────── */
const METRIC_VISUALS: Record<string, { icon: LucideIcon; tile: string }> = {
	clients: {
		icon: Users,
		tile: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
	},
	projects: {
		icon: Briefcase,
		tile: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
	},
	quotes: {
		icon: FileText,
		tile: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
	},
	invoices: {
		icon: Receipt,
		tile: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
	},
	tasks: {
		icon: ListChecks,
		tile: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
	},
};

function changeBadge(metric: MetricDefinition) {
	const changeType = metric.changeType ?? "neutral";
	const variant =
		changeType === "increase"
			? "success"
			: changeType === "decrease"
				? "destructive"
				: "outline";
	const Icon =
		changeType === "increase"
			? ArrowUp
			: changeType === "decrease"
				? ArrowDown
				: ArrowRight;
	return { change: Math.abs(metric.changePercent ?? 0), variant, Icon } as const;
}

/** Sparkline that measures its own width so it can live in a fluid grid cell. */
function MeasuredSparkline({
	data,
	dataKey,
	isActive,
	height = 32,
}: {
	data?: MetricDatum[];
	dataKey: string;
	isActive: boolean;
	height?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setWidth(el.clientWidth);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return (
		<div ref={ref} className="w-full">
			{width > 0 ? (
				<StatCardSparkline
					data={data ?? []}
					dataKey={dataKey}
					color="var(--chart-1)"
					isActive={isActive}
					width={width}
					height={height}
				/>
			) : null}
		</div>
	);
}

/** Compact, color-coded metric chip that drives the main chart on click. */
function KpiChip({
	metric,
	data,
	isActive,
	onSelect,
}: {
	metric: MetricDefinition;
	data?: MetricDatum[];
	isActive: boolean;
	onSelect: () => void;
}) {
	const visual = METRIC_VISUALS[metric.key];
	const Icon = visual?.icon ?? Users;
	const { change, variant, Icon: BadgeIcon } = changeBadge(metric);

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={isActive}
			className={cn(
				"group flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
				isActive ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"flex size-8 items-center justify-center rounded-lg",
						visual?.tile
					)}
				>
					<Icon className="size-4" />
				</span>
				<StyledBadge variant={variant}>
					<BadgeIcon className="mr-1 size-3" />
					{metric.isLoading ? "..." : `${change.toFixed(1)}%`}
				</StyledBadge>
			</div>
			<div className="min-w-0">
				<p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					{metric.label}
				</p>
				<p className="mt-1 text-2xl font-bold leading-none tabular-nums text-foreground">
					{metric.isLoading ? (
						"..."
					) : (
						<AnimatedNumber value={metric.value ?? 0} format={metric.format} />
					)}
				</p>
			</div>
			<div className="mt-auto">
				<MeasuredSparkline data={data} dataKey={metric.key} isActive={isActive} />
			</div>
		</button>
	);
}

/** Hero metric: big revenue figure, progress to target, sparkline. */
function RevenueSpotlight({
	metric,
	data,
	isActive,
	onSelect,
	progressPct,
}: {
	metric: MetricDefinition;
	data?: MetricDatum[];
	isActive: boolean;
	onSelect: () => void;
	progressPct: number;
}) {
	const { change, variant, Icon: BadgeIcon } = changeBadge(metric);
	const clampedProgress = Math.min(100, Math.max(0, progressPct));

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={isActive}
			className={cn(
				"group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/[0.06] to-transparent p-5 text-left shadow-sm transition-all duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
				isActive ? "border-primary/50 ring-1 ring-primary/30" : "border-primary/20"
			)}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/25 opacity-60 blur-3xl"
			/>

			<div className="relative flex items-center justify-between">
				<span className="flex items-center gap-2">
					<span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
						<DollarSign className="size-5" />
					</span>
					<span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
						Revenue
					</span>
				</span>
				<StyledBadge variant={variant}>
					<BadgeIcon className="mr-1 size-3" />
					{metric.isLoading ? "..." : `${change.toFixed(1)}%`}
				</StyledBadge>
			</div>

			<div className="relative mt-5">
				<p className="text-4xl font-bold leading-none tabular-nums text-foreground sm:text-5xl">
					{metric.isLoading ? (
						"..."
					) : (
						<AnimatedNumber value={metric.value ?? 0} format={metric.format} />
					)}
				</p>
				{metric.subtitle ? (
					<p className="mt-2 text-xs font-medium text-muted-foreground">
						{metric.subtitle}
					</p>
				) : null}
			</div>

			<div className="relative mt-auto pt-5">
				<div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
					<div
						className="h-full rounded-full bg-primary transition-all duration-700"
						style={{ width: `${clampedProgress}%` }}
					/>
				</div>
				<div className="mt-3">
					<MeasuredSparkline
						data={data}
						dataKey="revenue"
						isActive
						height={36}
					/>
				</div>
			</div>
		</button>
	);
}

export default function HomeStatsReal() {
	const isOrgSwitching = useIsOrgSwitching();
	const homeStats = useQuery(api.homeStats.getHomeStats);

	const defaultRange: DateRange = useMemo(
		() => ({
			from: startOfMonth(new Date()),
			to: new Date(),
		}),
		[]
	);

	const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(
		defaultRange
	);
	const [activeMetric, setActiveMetric] = useState<string>("clients");

	const isLoading = isOrgSwitching || homeStats === undefined;

	const rangeArgs = useMemo(() => {
		if (!selectedRange?.from && !selectedRange?.to) return {};
		return {
			from: selectedRange?.from
				? startOfDay(selectedRange.from).getTime()
				: undefined,
			to: selectedRange?.to ? endOfDay(selectedRange.to).getTime() : undefined,
		};
	}, [selectedRange]);

	const clientsSeries = useQuery(
		api.homeStats.getClientsCreatedByDateRange,
		rangeArgs
	);
	const projectsSeries = useQuery(
		api.homeStats.getProjectsCompletedByDateRange,
		rangeArgs
	);
	const quotesSeries = useQuery(
		api.homeStats.getQuotesApprovedByDateRange,
		rangeArgs
	);
	const invoicesSeries = useQuery(
		api.homeStats.getInvoicesPaidByDateRange,
		rangeArgs
	);
	const revenueThisMonth = useQuery(
		api.homeStats.getRevenueByDateRange,
		rangeArgs
	);
	const tasksThisMonth = useQuery(
		api.homeStats.getTasksCreatedByDateRange,
		rangeArgs
	);

	const isClientsLoading = isLoading || clientsSeries === undefined;
	const isProjectsLoading = isLoading || projectsSeries === undefined;
	const isQuotesLoading = isLoading || quotesSeries === undefined;
	const isInvoicesLoading = isLoading || invoicesSeries === undefined;
	const isRevenueLoading = isLoading || revenueThisMonth === undefined;
	const isTasksLoading = isLoading || tasksThisMonth === undefined;

	const clientsChartData = useMemo(
		() =>
			processDataForChart(
				clientsSeries?.data ?? [],
				"clients",
				true,
				selectedRange,
				clientsSeries?.baselineCount ?? 0
			),
		[clientsSeries, selectedRange]
	);
	const projectsChartData = useMemo(
		() =>
			processDataForChart(
				projectsSeries?.data ?? [],
				"projects",
				true,
				selectedRange,
				projectsSeries?.baselineCount ?? 0
			),
		[projectsSeries, selectedRange]
	);
	const quotesChartData = useMemo(
		() =>
			processDataForChart(
				quotesSeries?.data ?? [],
				"quotes",
				true,
				selectedRange,
				quotesSeries?.baselineCount ?? 0
			),
		[quotesSeries, selectedRange]
	);
	const invoicesChartData = useMemo(
		() =>
			processDataForChart(
				invoicesSeries?.data ?? [],
				"invoices",
				true,
				selectedRange,
				invoicesSeries?.baselineCount ?? 0
			),
		[invoicesSeries, selectedRange]
	);
	const revenueChartData = useMemo(
		() =>
			processDataForChart(
				revenueThisMonth || [],
				"revenue",
				true,
				selectedRange
			),
		[revenueThisMonth, selectedRange]
	);
	const tasksChartData = useMemo(
		() =>
			processDataForChart(tasksThisMonth || [], "tasks", false, selectedRange),
		[tasksThisMonth, selectedRange]
	);

	const dataByMetric: MetricDataMap = useMemo(
		() => ({
			clients: filterByRange(clientsChartData, selectedRange),
			projects: filterByRange(projectsChartData, selectedRange),
			quotes: filterByRange(quotesChartData, selectedRange),
			invoices: filterByRange(invoicesChartData, selectedRange),
			revenue: filterByRange(revenueChartData, selectedRange),
			tasks: filterByRange(tasksChartData, selectedRange),
		}),
		[
			clientsChartData,
			invoicesChartData,
			projectsChartData,
			quotesChartData,
			revenueChartData,
			selectedRange,
			tasksChartData,
		]
	);

	// Sparklines use the same full-range data as the main chart
	const sparklineData = dataByMetric;

	const isAnyMetricLoading =
		isClientsLoading ||
		isProjectsLoading ||
		isQuotesLoading ||
		isInvoicesLoading ||
		isRevenueLoading ||
		isTasksLoading;

	const chartConfig: ChartConfig = useMemo(
		() => ({
			clients: { label: "Clients", color: "var(--chart-1)" },
			projects: { label: "Projects", color: "var(--chart-2)" },
			quotes: { label: "Quotes", color: "var(--chart-3)" },
			invoices: { label: "Invoices", color: "var(--chart-4)" },
			revenue: { label: "Revenue", color: "var(--chart-5)" },
			tasks: { label: "Tasks", color: "var(--chart-6)" },
		}),
		[]
	);

	const revenueTotal = useMemo(
		() =>
			(revenueThisMonth || []).reduce(
				(sum: number, item: { count?: number }) => sum + (item?.count ?? 0),
				0
			),
		[revenueThisMonth]
	);

	// Extract counts so memo deps are plain numbers (not `.current` ref-like access)
	const totalClientsCurrent = safeNumber(homeStats?.totalClients.current);
	const completedProjectsCurrent = safeNumber(
		homeStats?.completedProjects.current
	);
	const approvedQuotesCurrent = safeNumber(homeStats?.approvedQuotes.current);
	const invoicesSentCurrent = safeNumber(homeStats?.invoicesSent.current);

	const clientsTotals = useMemo(
		() => getRangeTotals(clientsSeries, totalClientsCurrent),
		[clientsSeries, totalClientsCurrent]
	);

	const projectsTotals = useMemo(
		() => getRangeTotals(projectsSeries, completedProjectsCurrent),
		[projectsSeries, completedProjectsCurrent]
	);

	const quotesTotals = useMemo(
		() => getRangeTotals(quotesSeries, approvedQuotesCurrent),
		[quotesSeries, approvedQuotesCurrent]
	);

	const invoicesTotals = useMemo(
		() => getRangeTotals(invoicesSeries, invoicesSentCurrent),
		[invoicesSeries, invoicesSentCurrent]
	);

	const metrics: MetricDefinition[] = useMemo(() => {
		return [
			{
				key: "clients",
				label: "Total Clients",
				value: clientsTotals.endTotal,
				previousValue: clientsTotals.baseline,
				format: (val: number) => val.toLocaleString(),
				changeType: clientsTotals.changeType,
				changePercent: clientsTotals.percentChange,
				isLoading: isClientsLoading,
			},
			{
				key: "projects",
				label: "Projects Completed",
				value: projectsTotals.endTotal,
				previousValue: projectsTotals.baseline,
				format: (val: number) => val.toLocaleString(),
				changeType: projectsTotals.changeType,
				changePercent: projectsTotals.percentChange,
				isLoading: isProjectsLoading,
			},
			{
				key: "quotes",
				label: "Approved Quotes",
				value: quotesTotals.endTotal,
				previousValue: quotesTotals.baseline,
				format: (val: number) => val.toLocaleString(),
				changeType: quotesTotals.changeType,
				changePercent: quotesTotals.percentChange,
				isLoading: isQuotesLoading,
			},
			{
				key: "invoices",
				label: "Invoices Paid",
				value: invoicesTotals.endTotal,
				previousValue: invoicesTotals.baseline,
				format: (val: number) => val.toLocaleString(),
				changeType: invoicesTotals.changeType,
				changePercent: invoicesTotals.percentChange,
				isLoading: isInvoicesLoading,
			},
			{
				key: "revenue",
				label: "Revenue",
				value: revenueTotal,
				previousValue: safeNumber(homeStats?.revenueGoal.target),
				format: (val: number) => currencyFormatter.format(val),
				changeType:
					homeStats?.revenueGoal.changePercentage === undefined
						? "neutral"
						: homeStats.revenueGoal.changePercentage > 0
							? "increase"
							: homeStats.revenueGoal.changePercentage < 0
								? "decrease"
								: "neutral",
				subtitle: homeStats
					? `Progress: ${homeStats.revenueGoal.percentage}% of target`
					: undefined,
				isLoading: isRevenueLoading,
			},
			{
				key: "tasks",
				label: "Pending Tasks",
				value: safeNumber(homeStats?.pendingTasks.total),
				previousValue: safeNumber(homeStats?.pendingTasks.total),
				format: (val: number) => val.toLocaleString(),
				changeType: "neutral",
				subtitle: homeStats
					? `Due this week: ${homeStats.pendingTasks.dueThisWeek}`
					: undefined,
				isLoading: isTasksLoading,
			},
		];
	}, [
		clientsTotals,
		projectsTotals,
		quotesTotals,
		invoicesTotals,
		homeStats,
		isClientsLoading,
		isProjectsLoading,
		isQuotesLoading,
		isInvoicesLoading,
		isRevenueLoading,
		isTasksLoading,
		revenueTotal,
	]);

	const handleDateChange = useCallback(
		(nextRange?: DateRange) => {
			setSelectedRange(nextRange);
		},
		[setSelectedRange]
	);

	const rangeLabel = useMemo(
		() => formatRangeLabel(selectedRange),
		[selectedRange]
	);

	const revenueMetric = metrics.find((m) => m.key === "revenue");
	const chipMetrics = ["clients", "projects", "quotes", "invoices", "tasks"]
		.map((key) => metrics.find((m) => m.key === key))
		.filter((m): m is MetricDefinition => Boolean(m));
	const revenueProgress = safeNumber(homeStats?.revenueGoal.percentage);

	return (
		<div className="mb-8 space-y-4">
			{isAnyMetricLoading && !homeStats ? (
				<div className="space-y-4">
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
						<div className="lg:col-span-4 h-48 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
							<Skeleton className="size-9 rounded-xl" />
							<Skeleton className="mt-6 h-10 w-32" />
							<Skeleton className="mt-6 h-2 w-full rounded-full" />
						</div>
						<div className="lg:col-span-8 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
							<div className="mb-4 flex items-start justify-between gap-6">
								<div className="space-y-2">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="h-5 w-40" />
								</div>
								<Skeleton className="h-9 w-56" />
							</div>
							<ChartSkeleton />
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						{Array.from({ length: 5 }).map((_, i) => (
							<StatCardSkeleton key={i} />
						))}
					</div>
				</div>
			) : (
				<>
					{/* Top bento: revenue spotlight + interactive chart */}
					<div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
						{revenueMetric ? (
							<div className="flex lg:col-span-4">
								<RevenueSpotlight
									metric={revenueMetric}
									data={sparklineData.revenue}
									isActive={activeMetric === "revenue"}
									onSelect={() => setActiveMetric("revenue")}
									progressPct={revenueProgress}
								/>
							</div>
						) : null}
						<div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5 lg:col-span-8">
							<LineChart6
								metrics={metrics}
								chartConfig={chartConfig}
								dataByMetric={dataByMetric}
								selectedMetric={activeMetric}
								onMetricChange={setActiveMetric}
								title="Business Overview"
								description={rangeLabel}
								height={240}
								dateRange={selectedRange}
								onDateRangeChange={handleDateChange}
							/>
						</div>
					</div>

					{/* KPI chip rail — each chip drives the chart above */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						{chipMetrics.map((m) => (
							<KpiChip
								key={m.key}
								metric={m}
								data={sparklineData[m.key]}
								isActive={activeMetric === m.key}
								onSelect={() => setActiveMetric(m.key)}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
