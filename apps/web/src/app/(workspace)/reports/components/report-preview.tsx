"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Loader2, AlertCircle } from "lucide-react";
import { ReportBarChart } from "./report-bar-chart";
import { ReportLineChart } from "./report-line-chart";
import { ReportPieChart } from "./report-pie-chart";
import { ReportTable } from "./report-table";

type ReportConfig = {
	entityType: "clients" | "projects" | "tasks" | "quotes" | "invoices" | "activities";
	groupBy?: string[];
	dateRange?: { start?: number; end?: number };
};

type Visualization = {
	type: "table" | "bar" | "line" | "pie";
	options?: Record<string, unknown>;
};

interface ReportPreviewProps {
	config: ReportConfig;
	visualization: Visualization;
}

export function ReportPreview({ config, visualization }: ReportPreviewProps) {
	// Execute the report query based on config
	const reportData = useQuery(api.reportData.executeReport, {
		entityType: config.entityType,
		groupBy: config.groupBy?.[0],
		dateRange: config.dateRange,
	});

	if (reportData === undefined) {
		return (
			<div className="flex items-center justify-center min-h-[300px]">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!reportData || reportData.data.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[300px] text-center">
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

	// Render the appropriate visualization
	switch (visualization.type) {
		case "bar":
			return (
				<ReportBarChart
					data={chartData}
					total={total}
					groupBy={config.groupBy?.[0]}
					entityType={config.entityType}
				/>
			);
		case "line":
			return (
				<ReportLineChart
					data={chartData}
					total={total}
					groupBy={config.groupBy?.[0]}
					entityType={config.entityType}
				/>
			);
		case "pie":
			return (
				<ReportPieChart
					data={chartData}
					total={total}
					groupBy={config.groupBy?.[0]}
					entityType={config.entityType}
				/>
			);
		case "table":
		default:
			return (
				<ReportTable
					data={chartData}
					total={total}
					groupBy={config.groupBy?.[0]}
					entityType={config.entityType}
				/>
			);
	}
}

