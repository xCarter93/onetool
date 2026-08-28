"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Pencil } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePublishAssistantDockFrame } from "@/components/assistant/assistant-dock-frame-context";
import { Button } from "@/components/ui/button";
import {
	ReportBuilder,
	type ReportBuilderSavePayload,
} from "../components/report-builder";
import { ReportPreview } from "../components/report-preview";
import { ReportUtilityBar } from "../components/report-utility-bar";
import {
	dateRangeOptions,
	entityLabels,
	groupByOptions,
	visualizationIcons,
	visualizationOptions,
} from "../report-config";
import { pathLabel } from "../report-path-options";
import { normalizeReportConfig } from "@onetool/backend/convex/lib/reportConfig";

function ReportViewPageContent() {
	const router = useRouter();
	const params = useParams();
	const reportId = params.reportId as string;

	const report = useQuery(api.reports.get, { id: reportId as Id<"reports"> });
	const updateReport = useMutation(api.reports.update);
	const duplicateReport = useMutation(api.reports.duplicate);

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// While editing, the builder publishes its own frame.
	usePublishAssistantDockFrame(
		isEditing || !report
			? null
			: {
					title: "Report assistant",
					description: "Ask me about this report.",
				}
	);

	const normalized = report
		? normalizeReportConfig(report.config, report.visualization)
		: null;

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

	// report is non-null past the guards above, so normalized is too.
	const viewConfig = normalized!.config;

	if (isEditing) {
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
					config: report.config,
					visualization: report.visualization,
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
		groupByOptions[viewConfig.entityType]?.find(
			(o) => o.value === viewConfig.groupBy
		)?.label ??
		(viewConfig.groupBy
			? pathLabel(viewConfig.entityType, viewConfig.groupBy)
			: viewConfig.groupBy);
	const range = viewConfig.date?.range;
	const rangeLabel =
		range?.kind === "preset"
			? (dateRangeOptions.find((o) => o.value === range.preset)?.label ??
				"All Time")
			: range?.kind === "absolute" &&
				  (range.start !== undefined || range.end !== undefined)
				? "Custom Range"
				: "All Time";
	const vizLabel =
		visualizationOptions.find((o) => o.value === report.visualization.type)
			?.label ?? report.visualization.type;

	const isChartVisualization =
		report.visualization.type !== "table" && report.visualization.type !== "number";
	const metaChips = [
		entityLabels[viewConfig.entityType] ?? viewConfig.entityType,
		groupByLabel ? `by ${groupByLabel}` : null,
		rangeLabel,
		isChartVisualization ? `${vizLabel} chart` : vizLabel,
	].filter(Boolean) as string[];

	// pb clears the assistant dock so the utility bar can scroll past it.
	return (
		<div className="space-y-6 p-6 pb-24">
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

			{/* Report */}
			<div className="flex flex-col rounded-2xl border border-border/60 bg-background shadow-sm">
				<div className="p-5 sm:p-7">
					<ReportPreview
						config={viewConfig}
						visualization={normalized!.visualization}
					/>
				</div>
				<ReportUtilityBar
					saved={{ config: viewConfig, visualization: normalized!.visualization }}
					reportName={report.name}
					groupByLabel={groupByLabel}
					rangeLabel={rangeLabel}
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
