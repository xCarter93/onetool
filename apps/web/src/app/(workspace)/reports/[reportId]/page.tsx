"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Pencil } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
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
	visualizationIcons,
	visualizationOptions,
} from "../report-config";

export default function ReportViewPage() {
	const router = useRouter();
	const params = useParams();
	const reportId = params.reportId as string;

	const report = useQuery(api.reports.get, { id: reportId as Id<"reports"> });
	const updateReport = useMutation(api.reports.update);
	const duplicateReport = useMutation(api.reports.duplicate);

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

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
				<StyledButton intent="primary" onClick={() => router.push("/reports")}>
					Back to Reports
				</StyledButton>
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

	const VizIcon = visualizationIcons[report.visualization.type];
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
						intent="plain"
						size="sq-sm"
						onPress={() => router.push("/reports")}
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
					<StyledButton
						intent="outline"
						onClick={handleDuplicate}
						showArrow={false}
					>
						<Copy className="mr-2 h-4 w-4" />
						Duplicate
					</StyledButton>
					<StyledButton
						intent="primary"
						onClick={() => setIsEditing(true)}
						showArrow={false}
					>
						<Pencil className="mr-2 h-4 w-4" />
						Edit
					</StyledButton>
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

			{/* Report */}
			<div className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm sm:p-7">
				<ReportPreview
					config={{
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
					}}
					visualization={{ type: report.visualization.type }}
				/>
			</div>
		</div>
	);
}
