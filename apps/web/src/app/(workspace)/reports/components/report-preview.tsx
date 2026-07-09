"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Loader2, AlertCircle, TriangleAlert } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ReportBarChart } from "./report-bar-chart";
import { ReportLineChart } from "./report-line-chart";
import { ReportPieChart } from "./report-pie-chart";
import { ReportTable } from "./report-table";
import {
	getReportValueTypes,
	resolveReportQueryArgs,
	TRUNCATION_NOTICE,
	type ReportConfigShape,
	type VizType,
} from "../report-config";

type Visualization = {
	type: VizType;
	options?: Record<string, unknown>;
};

interface ReportPreviewProps {
	config: ReportConfigShape;
	visualization: Visualization;
}

export function ReportPreview({ config, visualization }: ReportPreviewProps) {
	const queryArgs = useDebouncedValue(resolveReportQueryArgs(config, visualization.type), 300);
	const reportData = useQuery(api.reportData.executeReport, queryArgs);

	if (reportData === undefined) {
		return (
			<div className="flex min-h-[300px] flex-1 items-center justify-center">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (reportData.detail) {
		if (reportData.detail.rows.length === 0) {
			return (
				<div className="flex min-h-[300px] flex-1 flex-col items-center justify-center text-center">
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
				{reportData.metadata?.truncated === true && (
					<div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
						<TriangleAlert className="h-3.5 w-3.5 shrink-0" />
						<span>{TRUNCATION_NOTICE}</span>
					</div>
				)}
				<ReportTable
					data={[]}
					total={reportData.total}
					groupBy={config.groupBy?.[0]}
					entityType={config.entityType}
					detail={reportData.detail}
				/>
			</div>
		);
	}

	if (!reportData || reportData.data.length === 0) {
		return (
			<div className="flex min-h-[300px] flex-1 flex-col items-center justify-center text-center">
				<AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
				<h3 className="text-lg font-medium text-foreground mb-2">No data available</h3>
				<p className="text-sm text-muted-foreground max-w-sm">
					There&apos;s no data matching your report criteria. Try adjusting the date range or data source.
				</p>
			</div>
		);
	}

	const chartData = reportData.data.map((item) => ({
		name: item.label,
		value: item.value,
		...((item.metadata || {}) as Record<string, unknown>),
	}));

	const total = reportData.total;
	const groupBy = config.groupBy?.[0];
	const fallbackValueTypes = getReportValueTypes(config.entityType, groupBy);
	const totalIsCurrency =
		typeof reportData.metadata?.totalIsCurrency === "boolean"
			? reportData.metadata.totalIsCurrency
			: fallbackValueTypes.totalIsCurrency;
	const itemValueIsCurrency =
		typeof reportData.metadata?.itemValueIsCurrency === "boolean"
			? reportData.metadata.itemValueIsCurrency
			: fallbackValueTypes.itemValueIsCurrency;

	// Render the appropriate visualization
	const chart = (() => {
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
					/>
				);
			case "line":
				return (
					<ReportLineChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
					/>
				);
			case "pie":
				return (
					<ReportPieChart
						data={chartData}
						total={total}
						groupBy={groupBy}
						entityType={config.entityType}
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
					/>
				);
		}
	})();

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			{reportData.metadata?.truncated === true && (
				<div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
					<TriangleAlert className="h-3.5 w-3.5 shrink-0" />
					<span>{TRUNCATION_NOTICE}</span>
				</div>
			)}
			{chart}
		</div>
	);
}

