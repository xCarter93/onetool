"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "@/components/stat-card-skeleton";
import { ChartSkeleton } from "@/components/chart-skeleton";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import LineChart6, {
	type MetricDatum,
	type MetricDataMap,
	type MetricDefinition,
} from "@/components/line-chart-6";
import type { ChartConfig } from "@/components/ui/chart";
import { DateRange } from "react-day-picker";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Map } from "lucide-react";
import ClientPropertiesMap from "./client-properties-map";
import {
	TourElement,
	HomeTour,
	HOME_TOUR_CONTENT,
	HomeTourContext,
} from "@/components/tours";

type ViewMode = "chart" | "map";

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

export default function HomeStatsReal() {
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
	const [viewMode, setViewMode] = useState<ViewMode>("chart");

	const isLoading = homeStats === undefined;

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

	const clientsTotals = useMemo(
		() =>
			getRangeTotals(
				clientsSeries,
				safeNumber(homeStats?.totalClients.current)
			),
		[clientsSeries, homeStats]
	);

	const projectsTotals = useMemo(
		() =>
			getRangeTotals(
				projectsSeries,
				safeNumber(homeStats?.completedProjects.current)
			),
		[projectsSeries, homeStats]
	);

	const quotesTotals = useMemo(
		() =>
			getRangeTotals(
				quotesSeries,
				safeNumber(homeStats?.approvedQuotes.current)
			),
		[quotesSeries, homeStats]
	);

	const invoicesTotals = useMemo(
		() =>
			getRangeTotals(
				invoicesSeries,
				safeNumber(homeStats?.invoicesSent.current)
			),
		[invoicesSeries, homeStats]
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

	const handleToggleView = useCallback(() => {
		setViewMode((prev) => (prev === "chart" ? "map" : "chart"));
	}, []);

	const mapToggleButton = (
		<TourElement<HomeTour>
			TourContext={HomeTourContext}
			stepId={HomeTour.MAP_TOGGLE}
			title={HOME_TOUR_CONTENT[HomeTour.MAP_TOGGLE].title}
			description={HOME_TOUR_CONTENT[HomeTour.MAP_TOGGLE].description}
			tooltipPosition={HOME_TOUR_CONTENT[HomeTour.MAP_TOGGLE].tooltipPosition}
		>
			<StyledButton
				intent="primary"
				size="md"
				onClick={handleToggleView}
				icon={<Map className="h-4 w-4" />}
				showArrow={false}
				title="View properties on map"
				className="rounded-full h-11 w-11 p-0 justify-center"
			/>
		</TourElement>
	);

	return (
		<div className="mb-8 space-y-4">
			{isAnyMetricLoading && !homeStats ? (
				<div className="space-y-4">
					{/* Skeleton header matching LineChart6 header */}
					<div className="space-y-3 pb-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
							<div className="space-y-1">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-5 w-40" />
							</div>
							<Skeleton className="h-9 w-56" />
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
							{Array.from({ length: 6 }).map((_, i) => (
								<StatCardSkeleton key={i} />
							))}
						</div>
					</div>
					<ChartSkeleton />
					<hr className="border-border/60" />
				</div>
			) : viewMode === "chart" ? (
				<LineChart6
					metrics={metrics}
					chartConfig={chartConfig}
					dataByMetric={dataByMetric}
					sparklineData={sparklineData}
					selectedMetric={activeMetric}
					onMetricChange={setActiveMetric}
					title="Business Overview"
					description={rangeLabel}
					height={360}
					dateRange={selectedRange}
					onDateRangeChange={handleDateChange}
					floatingAction={mapToggleButton}
				/>
			) : (
				<ClientPropertiesMap onToggleView={handleToggleView} />
			)}
		</div>
	);
}
