"use client";

import { TriangleAlert } from "lucide-react";
import { ReportBarChart } from "@/app/(workspace)/reports/components/report-bar-chart";
import { ReportLineChart } from "@/app/(workspace)/reports/components/report-line-chart";
import { ReportPieChart } from "@/app/(workspace)/reports/components/report-pie-chart";
import { ReportTable } from "@/app/(workspace)/reports/components/report-table";
import { getReportValueTypes, TRUNCATION_NOTICE } from "@/app/(workspace)/reports/report-config";
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
	metadata?: {
		entityType?: string;
		groupBy?: string;
		truncated?: boolean;
		totalIsCurrency?: boolean;
		itemValueIsCurrency?: boolean;
	};
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

	const fallbackValueTypes = getReportValueTypes(entityType, groupBy);
	const totalIsCurrency =
		typeof report.metadata?.totalIsCurrency === "boolean"
			? report.metadata.totalIsCurrency
			: fallbackValueTypes.totalIsCurrency;
	const itemValueIsCurrency =
		typeof report.metadata?.itemValueIsCurrency === "boolean"
			? report.metadata.itemValueIsCurrency
			: fallbackValueTypes.itemValueIsCurrency;

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
			{report.metadata?.truncated === true && (
				<div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
					<TriangleAlert className="h-3 w-3 shrink-0" />
					<span>{TRUNCATION_NOTICE}</span>
				</div>
			)}
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
