"use client";

import { useCallback, useMemo, useState } from "react";
import { StatCardSkeleton } from "@/components/stat-card-skeleton";
import { ChartSkeleton } from "@/components/chart-skeleton";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import type {
	MetricDatum,
	MetricDataMap,
	MetricDefinition,
} from "@/app/(workspace)/home/components/overview/metric-types";
import { DateRange } from "react-day-picker";
import { endOfDay, startOfDay, startOfMonth } from "date-fns";
import { OverviewPanel } from "./overview/overview-panel";
import { OVERVIEW_METRIC_ORDER } from "./overview/metric-visuals";
import { formatCurrency } from "@/lib/money";

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

export default function HomeStatsReal() {
	const isOrgSwitching = useIsOrgSwitching();
	// Aggregate-based stats (O(log n)) — avoids the full-org `.collect()` scans in
	// api.homeStats.getHomeStats that tripped Convex's document-read limit on large orgs.
	const homeStats = useQuery(api.homeStatsOptimized.getHomeStats, {});

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
	const [activeMetric, setActiveMetric] = useState<string>("revenue");

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
			processDataForChart(revenueThisMonth || [], "revenue", true, selectedRange),
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

	const isAnyMetricLoading =
		isClientsLoading ||
		isProjectsLoading ||
		isQuotesLoading ||
		isInvoicesLoading ||
		isRevenueLoading ||
		isTasksLoading;

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
				format: (val: number) => formatCurrency(val),
				changeType:
					homeStats?.revenueGoal.changePercentage === undefined
						? "neutral"
						: homeStats.revenueGoal.changePercentage > 0
							? "increase"
							: homeStats.revenueGoal.changePercentage < 0
								? "decrease"
								: "neutral",
				changePercent: Math.abs(homeStats?.revenueGoal.changePercentage ?? 0),
				subtitle: homeStats
					? `${homeStats.revenueGoal.percentage}% of target`
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

	// Revenue-first ordering; the selected card drives the big chart above.
	const orderedMetrics = useMemo(
		() =>
			OVERVIEW_METRIC_ORDER.map((key) =>
				metrics.find((m) => m.key === key)
			).filter((m): m is MetricDefinition => Boolean(m)),
		[metrics]
	);

	const activeMetricDef = useMemo(
		() => metrics.find((m) => m.key === activeMetric) ?? metrics[0],
		[metrics, activeMetric]
	);

	return (
		<div className="mb-8">
			{isAnyMetricLoading && !homeStats ? (
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
						{Array.from({ length: 6 }).map((_, i) => (
							<StatCardSkeleton key={i} />
						))}
					</div>
					<div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
						<ChartSkeleton />
					</div>
				</div>
			) : activeMetricDef ? (
				<OverviewPanel
					metrics={orderedMetrics}
					dataByMetric={dataByMetric}
					activeMetric={activeMetric}
					activeMetricDef={activeMetricDef}
					onSelect={setActiveMetric}
					dateRange={selectedRange}
					onDateRangeChange={handleDateChange}
				/>
			) : null}
		</div>
	);
}
