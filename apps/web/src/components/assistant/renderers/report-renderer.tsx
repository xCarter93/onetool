"use client";

import { ReportBarChart } from "@/app/(workspace)/reports/components/report-bar-chart";
import { ReportLineChart } from "@/app/(workspace)/reports/components/report-line-chart";
import { ReportPieChart } from "@/app/(workspace)/reports/components/report-pie-chart";
import { ReportTable } from "@/app/(workspace)/reports/components/report-table";
import { getReportValueTypes } from "@/app/(workspace)/reports/report-config";
import type { ToolRendererProps } from "./index";

// Mirrors ReportDataResult (+ visualization) from convex/assistantTools.ts.
interface ReportOutput {
	data: Array<{
		label: string;
		value: number;
		metadata?: Record<string, unknown>;
	}>;
	total: number;
	visualization?: "bar" | "line" | "pie" | "table";
	metadata?: { entityType?: string; groupBy?: string };
}

export function ReportRenderer({ input, output }: ToolRendererProps) {
	const report = output as ReportOutput;
	if (!Array.isArray(report?.data)) return null;

	const args = (input ?? {}) as { entityType?: string; groupBy?: string };
	const entityType = report.metadata?.entityType ?? args.entityType ?? "records";
	const groupBy = report.metadata?.groupBy ?? args.groupBy;

	if (report.data.length === 0) {
		return (
			<div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
				No data for that report.
			</div>
		);
	}

	// Same label→name + metadata-spread mapping report-preview.tsx uses;
	// spread first so metadata keys can never clobber the chart encoding.
	const chartData = report.data.map((point) => ({
		...point.metadata,
		name: point.label,
		value: point.value,
	}));

	const { totalIsCurrency, itemValueIsCurrency } = getReportValueTypes(
		entityType,
		groupBy
	);

	const chartProps = {
		data: chartData,
		total: report.total,
		groupBy,
		entityType,
		totalIsCurrency,
		itemValueIsCurrency,
	};

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card p-3">
			{report.visualization === "line" ? (
				<ReportLineChart {...chartProps} />
			) : report.visualization === "pie" ? (
				<ReportPieChart {...chartProps} />
			) : report.visualization === "table" ? (
				<ReportTable {...chartProps} />
			) : (
				<ReportBarChart {...chartProps} />
			)}
		</div>
	);
}
