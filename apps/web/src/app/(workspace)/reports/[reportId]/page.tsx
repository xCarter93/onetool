"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Copy, Download, Eye, EyeOff, Loader2, Pencil } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	ReportBuilder,
	isValidReportFilters,
	type ReportBuilderSavePayload,
} from "../components/report-builder";
import type { ReportMeasure } from "../report-config";
import { ReportPreview } from "../components/report-preview";
import {
	dateRangeOptions,
	detectDateRangePreset,
	entityLabels,
	groupByOptions,
	resolveReportQueryArgs,
	visualizationIcons,
	visualizationOptions,
	type ReportConfigShape,
} from "../report-config";
import { reportResultToCsv } from "../report-csv";
import { buildCsv, downloadCsv, sanitizeCsvFilename } from "@/lib/csv-export";

/** localStorage key for the per-report chart-visible toggle (Slice 3-D3). */
function chartVisibleKey(reportId: string) {
	return `report-chart-visible:${reportId}`;
}

type ReportDoc = NonNullable<FunctionReturnType<typeof api.reports.get>>;

/** The exact config shape the view passes to ReportPreview — the CSV export runs the same query so it exports what's on screen. */
function toConfigShape(report: ReportDoc): ReportConfigShape {
	return {
		entityType: report.config.entityType,
		groupBy: report.config.groupBy,
		dateRange: report.config.dateRange,
		filters: isValidReportFilters(report.config.filters)
			? report.config.filters
			: undefined,
		aggregation: report.config.aggregations?.[0]
			? {
					op: report.config.aggregations[0].operation,
					field: report.config.aggregations[0].field,
				}
			: undefined,
		columns: report.config.columns,
	};
}

function ReportViewPageContent() {
	const router = useRouter();
	const params = useParams();
	const reportId = params.reportId as string;

	const report = useQuery(api.reports.get, { id: reportId as Id<"reports"> });
	const updateReport = useMutation(api.reports.update);
	const duplicateReport = useMutation(api.reports.duplicate);

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	// Lazy localStorage read is hydration-safe here: the toggle only affects
	// the report body, which isn't in the HTML while `report` is still
	// loading (this same early-return-before-hydration pattern is used for
	// "assistant-panel-pinned" in sidebar-with-header.tsx).
	const [chartVisible, setChartVisible] = useState(
		() =>
			typeof window === "undefined" ||
			localStorage.getItem(chartVisibleKey(reportId)) !== "false"
	);
	const toggleChartVisible = () => {
		setChartVisible((prev) => {
			const next = !prev;
			localStorage.setItem(chartVisibleKey(reportId), String(next));
			return next;
		});
	};

	// Same args ReportPreview subscribes with (Convex dedupes the
	// subscription), so Download CSV exports exactly what's on screen.
	const reportData = useQuery(
		api.reportData.executeReport,
		report && !isEditing
			? resolveReportQueryArgs(
					toConfigShape(report),
					report.visualization.type !== "table" && chartVisible
						? report.visualization.type
						: "table"
				)
			: "skip"
	);

	if (report === undefined) {
		return (
			<div className="flex min-h-[400px] items-center justify-center p-6">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (report === null) {
		return (
			<div className="p-6 text-center">
				<h1 className="mb-2 text-xl font-semibold text-foreground">
					Report not found
				</h1>
				<p className="mb-4 text-muted-foreground">
					This report may have been deleted or you don&apos;t have access to it.
				</p>
				<Button onClick={() => router.push("/reports")}>
					Back to Reports
				</Button>
			</div>
		);
	}

	if (isEditing) {
		const savedFilters = isValidReportFilters(report.config.filters)
			? report.config.filters
			: undefined;
		const savedAggregation = report.config.aggregations?.[0];
		const measure: ReportMeasure | undefined = savedAggregation
			? { op: savedAggregation.operation, field: savedAggregation.field }
			: undefined;

		const handleSave = async (payload: ReportBuilderSavePayload) => {
			setIsSaving(true);
			try {
				await updateReport({
					id: reportId as Id<"reports">,
					name: payload.name,
					description: payload.description,
					config: payload.config,
					visualization: payload.visualization,
				});
				setIsEditing(false);
			} catch (error) {
				console.error("Failed to save report:", error);
			} finally {
				setIsSaving(false);
			}
		};

		return (
			<ReportBuilder
				mode="edit"
				initial={{
					name: report.name,
					description: report.description || "",
					entityType: report.config.entityType,
					groupBy: report.config.groupBy?.[0],
					vizType: report.visualization.type,
					dateRangePreset: report.config.dateRange
						? detectDateRangePreset(report.config.dateRange)
						: "all_time",
					filters: savedFilters,
					measure,
					columns: report.config.columns,
				}}
				saving={isSaving}
				onSave={handleSave}
				onBack={() => setIsEditing(false)}
			/>
		);
	}

	const handleDuplicate = async () => {
		try {
			const newId = await duplicateReport({ id: reportId as Id<"reports"> });
			router.push(`/reports/${newId}`);
		} catch (error) {
			console.error("Failed to duplicate report:", error);
		}
	};

	const csvReady =
		reportData !== undefined &&
		(reportData.detail
			? reportData.detail.rows.length > 0
			: reportData.data.length > 0);

	const handleDownloadCsv = () => {
		if (!reportData) return;
		const { headers, rows } = reportResultToCsv(reportData, {
			entityType: report.config.entityType,
			groupBy: report.config.groupBy?.[0],
			groupByLabel,
		});
		downloadCsv(sanitizeCsvFilename(report.name), buildCsv(headers, rows));
	};

	const VizIcon = visualizationIcons[report.visualization.type];
	const isChartVisualization = report.visualization.type !== "table";
	const groupByLabel =
		groupByOptions[report.config.entityType]?.find(
			(o) => o.value === report.config.groupBy?.[0]
		)?.label ?? report.config.groupBy?.[0];
	const rangeLabel = report.config.dateRange
		? (dateRangeOptions.find(
				(o) => o.value === detectDateRangePreset(report.config.dateRange!)
			)?.label ?? "All Time")
		: "All Time";
	const vizLabel =
		visualizationOptions.find((o) => o.value === report.visualization.type)
			?.label ?? report.visualization.type;

	const metaChips = [
		entityLabels[report.config.entityType] ?? report.config.entityType,
		groupByLabel ? `by ${groupByLabel}` : null,
		rangeLabel,
		`${vizLabel} chart`,
	].filter(Boolean) as string[];

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => router.push("/reports")}
						aria-label="Back to reports"
					>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<VizIcon className="h-5 w-5" />
					</div>
					<div className="min-w-0">
						<h1 className="truncate text-2xl font-bold text-foreground">
							{report.name}
						</h1>
						{report.description && (
							<p className="truncate text-sm text-muted-foreground">
								{report.description}
							</p>
						)}
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={handleDownloadCsv} disabled={!csvReady}>
						<Download className="mr-2 h-4 w-4" />
						Download CSV
					</Button>
					<Button variant="outline" onClick={handleDuplicate}>
						<Copy className="mr-2 h-4 w-4" />
						Duplicate
					</Button>
					<Button onClick={() => setIsEditing(true)}>
						<Pencil className="mr-2 h-4 w-4" />
						Edit
					</Button>
				</div>
			</div>

			{/* Meta chips */}
			<div className="flex flex-wrap items-center gap-2">
				{metaChips.map((chip) => (
					<span
						key={chip}
						className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground"
					>
						{chip}
					</span>
				))}
			</div>

			{/* Chart toggle — chart visualizations only; the table is always shown */}
			{isChartVisualization && (
				<div className="flex justify-end">
					<Button variant="ghost" size="sm" onClick={toggleChartVisible}>
						{chartVisible ? (
							<EyeOff className="mr-2 h-4 w-4" />
						) : (
							<Eye className="mr-2 h-4 w-4" />
						)}
						{chartVisible ? "Hide chart" : "Show chart"}
					</Button>
				</div>
			)}

			{/* Report */}
			<div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm sm:p-7">
				<ReportPreview
					config={toConfigShape(report)}
					visualization={{
						type: isChartVisualization && chartVisible ? report.visualization.type : "table",
					}}
				/>
			</div>
		</div>
	);
}

export default function ReportViewPage() {
	return (
		<PermissionGate object="reports">
			<ReportViewPageContent />
		</PermissionGate>
	);
}
