"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Plus, Trash2 } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import {
	entityLabels,
	formatRelativeTime,
	groupByOptions,
	reportTemplates,
	visualizationIcons,
} from "./report-config";

function templateHref(t: (typeof reportTemplates)[number]) {
	const qs = new URLSearchParams({
		entity: t.entityType,
		group: t.groupBy,
		viz: t.viz,
		range: t.dateRange,
		name: t.name,
	});
	return `/reports/new?${qs.toString()}`;
}

function ReportRow({
	report,
	onView,
	onDelete,
	onDuplicate,
}: {
	report: Doc<"reports">;
	onView: () => void;
	onDelete: () => void;
	onDuplicate: () => void;
}) {
	const VizIcon = visualizationIcons[report.visualization.type];
	const groupBy = report.config.groupBy?.[0];
	const groupByLabel =
		groupByOptions[report.config.entityType]?.find((o) => o.value === groupBy)
			?.label ?? groupBy;
	const source = entityLabels[report.config.entityType] ?? report.config.entityType;

	return (
		<tr
			onClick={onView}
			className="group cursor-pointer transition-colors hover:bg-muted/40"
		>
			<td className="py-3 pl-2 pr-3">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<VizIcon className="h-4.5 w-4.5" />
					</div>
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground">{report.name}</p>
						<p className="truncate text-xs text-muted-foreground">
							{source}
							{groupByLabel ? ` · by ${groupByLabel}` : ""}
						</p>
					</div>
				</div>
			</td>
			<td className="hidden px-3 py-3 text-sm capitalize text-muted-foreground sm:table-cell">
				{report.visualization.type}
			</td>
			<td className="hidden px-3 py-3 text-sm text-muted-foreground md:table-cell">
				{formatRelativeTime(report.updatedAt)}
			</td>
			<td className="py-3 pl-3 pr-2">
				<div
					onClick={(e) => e.stopPropagation()}
					className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
				>
					<Button
						intent="plain"
						size="sq-sm"
						aria-label="Duplicate report"
						onPress={onDuplicate}
					>
						<Copy className="h-4 w-4" />
					</Button>
					<Button
						intent="plain"
						size="sq-sm"
						aria-label="Delete report"
						className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
						onPress={onDelete}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</td>
		</tr>
	);
}

export default function ReportsPage() {
	const router = useRouter();
	const reports = useQuery(api.reports.list);
	const deleteReport = useMutation(api.reports.remove);
	const duplicateReport = useMutation(api.reports.duplicate);

	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [reportToDelete, setReportToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const confirmDelete = async () => {
		if (!reportToDelete) return;
		try {
			await deleteReport({ id: reportToDelete.id as Id<"reports"> });
			setDeleteModalOpen(false);
			setReportToDelete(null);
		} catch (error) {
			console.error("Failed to delete report:", error);
		}
	};

	const handleDuplicate = async (id: string) => {
		try {
			const newId = await duplicateReport({ id: id as Id<"reports"> });
			router.push(`/reports/${newId}`);
		} catch (error) {
			console.error("Failed to duplicate report:", error);
		}
	};

	const isLoading = reports === undefined;

	return (
		<div className="space-y-8 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="h-6 w-1.5 rounded-full bg-linear-to-b from-primary to-primary/60" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Reports</h1>
						<p className="text-sm text-muted-foreground">
							Build and view analytics for your organization
						</p>
					</div>
				</div>
				<StyledButton
					onClick={() => router.push("/reports/new")}
					intent="primary"
					size="md"
					icon={<Plus className="h-4 w-4" />}
				>
					New Report
				</StyledButton>
			</div>

			{/* Templates */}
			<section className="space-y-3">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Start from a template
				</h2>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{reportTemplates.map((t) => {
						const Icon = t.icon;
						return (
							<Link
								key={t.id}
								href={templateHref(t)}
								className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
							>
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
									<Icon className="h-4.5 w-4.5" />
								</div>
								<div className="min-w-0">
									<p className="font-medium text-foreground">{t.name}</p>
									<p className="text-xs text-muted-foreground">
										{t.description}
									</p>
								</div>
							</Link>
						);
					})}
				</div>
			</section>

			{/* Saved reports */}
			<section className="space-y-3">
				<div className="flex items-center gap-2">
					<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Your reports
					</h2>
					{!isLoading && reports && reports.length > 0 && (
						<span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
							{reports.length}
						</span>
					)}
				</div>

				{isLoading ? (
					<div className="space-y-2">
						{Array.from({ length: 4 }).map((_, i) => (
							<div
								key={i}
								className="flex items-center gap-3 rounded-lg px-2 py-3"
							>
								<div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
								<div className="space-y-2">
									<div className="h-4 w-40 animate-pulse rounded bg-muted" />
									<div className="h-3 w-24 animate-pulse rounded bg-muted" />
								</div>
							</div>
						))}
					</div>
				) : !reports || reports.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
						<p className="font-medium text-foreground">No reports yet</p>
						<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
							Pick a template above to get started, or build one from scratch.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto rounded-xl border border-border/60">
						<table className="w-full border-collapse">
							<thead>
								<tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th className="py-2 pl-2 pr-3 font-medium">Name</th>
									<th className="hidden px-3 py-2 font-medium sm:table-cell">
										Type
									</th>
									<th className="hidden px-3 py-2 font-medium md:table-cell">
										Updated
									</th>
									<th className="py-2 pl-3 pr-2" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{reports.map((report) => (
									<ReportRow
										key={report._id}
										report={report}
										onView={() => router.push(`/reports/${report._id}`)}
										onDelete={() => {
											setReportToDelete({ id: report._id, name: report.name });
											setDeleteModalOpen(true);
										}}
										onDuplicate={() => handleDuplicate(report._id)}
									/>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{reportToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Delete Report"
					itemName={reportToDelete.name}
					itemType="Report"
				/>
			)}
		</div>
	);
}
