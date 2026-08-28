"use client";

import { Component, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Loader2, AlertCircle, TriangleAlert } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { convexErrorMessage } from "@/lib/convex-error";
import { GROUP_BY_OPTIONS } from "@onetool/backend/convex/lib/reportFields";
import { ReportBarChart } from "./report-bar-chart";
import { ReportColumnChart } from "./report-column-chart";
import { ReportLineChart } from "./report-line-chart";
import { ReportPieChart } from "./report-pie-chart";
import { ReportRadarChart } from "./report-radar-chart";
import { ReportRadialChart } from "./report-radial-chart";
import { ReportTable } from "./report-table";
import {
	COMPARE_TRUNCATION_NOTICE,
	comparisonKindLabel,
	formatReportValue,
	metricOptionsFor,
	metricToValue,
	percentChange,
	pointsChange,
	resolveReportQueryArgs,
	TRUNCATION_NOTICE,
	type ReportConfigV2,
	type ReportVisualization,
} from "../report-config";
import { pathLabel } from "../report-path-options";

interface ReportPreviewProps {
	config: ReportConfigV2;
	visualization: ReportVisualization;
	/** Drill-down (R10): fires when a chart element with a bucketKey is clicked. */
	onBucketClick?: (bucketKey: string, bucketLabel: string) => void;
}

/** Honest failure state: a config the pipeline rejects (or a denied read) shows why instead of white-screening. */
class ReportPreviewBoundary extends Component<
	{ children: ReactNode },
	{ error: unknown }
> {
	state = { error: null as unknown };

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	render() {
		if (this.state.error !== null) {
			return (
				<div className="flex min-h-[300px] flex-1 flex-col items-center justify-center text-center">
					<AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
					<h3 className="mb-2 text-lg font-medium text-foreground">
						This report can&apos;t run
					</h3>
					<p className="max-w-sm text-sm text-muted-foreground">
						{convexErrorMessage(
							this.state.error,
							"Something in the configuration isn't valid. Adjust it to continue."
						)}
					</p>
				</div>
			);
		}
		return this.props.children;
	}
}

export function ReportPreview(props: ReportPreviewProps) {
	// Keyed so a config or visualization change remounts the boundary and retries after an error.
	return (
		<ReportPreviewBoundary
			key={JSON.stringify([props.config, props.visualization])}
		>
			<ReportPreviewInner {...props} />
		</ReportPreviewBoundary>
	);
}

function metricLabelFor(config: ReportConfigV2): string {
	return (
		metricOptionsFor(config.entityType).find(
			(o) => o.value === metricToValue(config.metric)
		)?.label ?? "Count of records"
	);
}

function ReportPreviewInner({
	config,
	visualization,
	onBucketClick,
}: ReportPreviewProps) {
	const queryArgs = useDebouncedValue(
		resolveReportQueryArgs(config, visualization),
		300
	);
	const reportData = useQuery(api.reportData.executeReport, queryArgs);

	if (reportData === undefined) {
		return (
			<div className="flex min-h-[300px] flex-1 items-center justify-center">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	// Every branch renders this, empty states included — a truncated scan may have stopped before finding matches.
	const truncated = reportData.metadata?.truncated === true;
	const compareTruncated = reportData.metadata?.compareTruncated === true;
	const truncationBanner = (truncated || compareTruncated) && (
		<div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
			<TriangleAlert className="h-3.5 w-3.5 shrink-0" />
			<span>{truncated ? TRUNCATION_NOTICE : COMPARE_TRUNCATION_NOTICE}</span>
		</div>
	);

	// Absent unless the pipeline actually ran a comparison (it strips unsupported ones).
	const comparison = config.date?.comparison;
	const compareLabel = comparison
		? comparisonKindLabel(comparison.kind)
		: undefined;

	if (reportData.detail) {
		if (reportData.detail.rows.length === 0) {
			return (
				<div className="flex min-h-[300px] flex-1 flex-col items-center justify-center text-center">
					{truncationBanner && <div className="mb-3">{truncationBanner}</div>}
					<AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
					<h3 className="text-lg font-medium text-foreground mb-2">No records available</h3>
					<p className="text-sm text-muted-foreground max-w-sm">
						There&apos;s no data matching your report criteria. Try adjusting the date range, filters, or data source.
					</p>
				</div>
			);
		}
		return (
			<div className="flex min-h-0 flex-1 flex-col gap-3">
				{truncationBanner}
				<ReportTable
					data={[]}
					total={reportData.total}
					groupBy={config.groupBy}
					entityType={config.entityType}
					detail={reportData.detail}
				/>
			</div>
		);
	}

	// The Number type renders the scalar aggregate as a KPI figure — the
	// "Total" data point is the whole result.
	if (visualization.type === "number") {
		const totalIsCurrency = reportData.metadata?.totalIsCurrency === true;
		const isRatio = config.metric.op === "ratio";
		const display = isRatio
			? `${reportData.total}%`
			: formatReportValue(reportData.total, totalIsCurrency);
		const compareTotal = reportData.metadata?.compareTotal;
		// 0 is a real comparison total, so test the type, not truthiness.
		const delta =
			typeof compareTotal === "number" && compareLabel
				? isRatio
					? pointsChange(reportData.total, compareTotal)
					: percentChange(reportData.total, compareTotal)
				: undefined;
		return (
			<div className="flex min-h-[300px] flex-1 flex-col items-center justify-center gap-2 text-center">
				{truncationBanner}
				<p className="text-5xl font-semibold tabular-nums text-foreground">
					{display}
				</p>
				<p className="text-sm text-muted-foreground">{metricLabelFor(config)}</p>
				{typeof compareTotal === "number" && compareLabel && (
					<p className="text-sm">
						{/* Direction reads from the sign, never from a red/green tint. */}
						<span className="font-medium tabular-nums text-primary">
							{delta ??
								`Previous: ${
									isRatio
										? `${compareTotal}%`
										: formatReportValue(compareTotal, totalIsCurrency)
								}`}
						</span>{" "}
						<span className="text-muted-foreground">
							vs {compareLabel.toLowerCase()}
						</span>
					</p>
				)}
			</div>
		);
	}

	if (reportData.data.length === 0) {
		return (
			<div className="flex min-h-[300px] flex-1 flex-col items-center justify-center text-center">
				{truncationBanner && <div className="mb-3">{truncationBanner}</div>}
				<AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
				<h3 className="text-lg font-medium text-foreground mb-2">No data available</h3>
				<p className="text-sm text-muted-foreground max-w-sm">
					{metricLabelFor(config)} found nothing in this date range. Try a
					wider range or different filters.
				</p>
			</div>
		);
	}

	// Segments are authorable on bar/column only; other viz types stay single-series.
	const segments =
		config.segmentBy &&
		(visualization.type === "bar" || visualization.type === "column")
			? reportData.metadata?.segments
			: undefined;

	// bucketKey lands after the metadata spread so a metadata key can't shadow it.
	const chartData = reportData.data.map((item) => ({
		name: item.label,
		value: item.value,
		...((item.metadata || {}) as Record<string, unknown>),
		...(segments ? (item.segments ?? {}) : {}),
		compareValue: item.compareValue,
		bucketKey: item.bucketKey,
	}));

	const total = reportData.total;
	const groupBy = config.groupBy;
	const groupByLabel = groupBy
		? (GROUP_BY_OPTIONS[config.entityType].find((o) => o.value === groupBy)?.label ??
			pathLabel(config.entityType, groupBy))
		: undefined;
	const showAxisLabels = visualization.options?.axisLabels === true;
	const targetLine = visualization.options?.targetLine;
	const axisLabels = showAxisLabels
		? { x: groupByLabel, y: metricLabelFor(config) }
		: undefined;
	// The bar chart is layout="vertical", so its axes are the transpose.
	const barAxisLabels = axisLabels
		? { x: axisLabels.y, y: axisLabels.x }
		: undefined;
	// The unified pipeline emits currency flags only when true — absent means
	// "not currency"; never infer from entityType/groupBy heuristics.
	const totalIsCurrency = reportData.metadata?.totalIsCurrency === true;
	const itemValueIsCurrency = reportData.metadata?.itemValueIsCurrency === true;

	// One visualization on the canvas (d7): the grouped summary table moved to
	// the utility bar's Calculated values; only the table type renders it here.
	const body = (() => {
		switch (visualization.type) {
			case "bar":
				return (
					<ReportBarChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
						segments={segments}
						compareLabel={compareLabel}
						axisLabels={barAxisLabels}
						targetLine={targetLine}
						onBucketClick={onBucketClick}
					/>
				);
			case "column":
				return (
					<ReportColumnChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
						segments={segments}
						compareLabel={compareLabel}
						axisLabels={axisLabels}
						targetLine={targetLine}
						onBucketClick={onBucketClick}
					/>
				);
			case "line":
				return (
					<ReportLineChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
						compareLabel={compareLabel}
						axisLabels={axisLabels}
						targetLine={targetLine}
						onBucketClick={onBucketClick}
					/>
				);
			case "pie":
				return (
					<ReportPieChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
						onBucketClick={onBucketClick}
					/>
				);
			// Radar has no reliable per-element click target; Calculated values
			// rows are the drill-down for it.
			case "radar":
				return (
					<ReportRadarChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
					/>
				);
			case "radial":
				return (
					<ReportRadialChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
						onBucketClick={onBucketClick}
					/>
				);
			case "table":
			default:
				return (
					<ReportTable
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
						totalIsCurrency={totalIsCurrency}
						itemValueIsCurrency={itemValueIsCurrency}
						valueHeader={metricLabelFor(config)}
						compareLabel={compareLabel}
					/>
				);
		}
	})();

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			{truncationBanner}
			{body}
		</div>
	);
}
