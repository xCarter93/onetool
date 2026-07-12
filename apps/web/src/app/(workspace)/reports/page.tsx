"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { PresetLibraryDialog } from "./components/preset-library-dialog";
import { ReportCreatePanel } from "./components/report-create-panel";
import { entityLabels, formatRelativeTime, groupByOptions, visualizationIcons } from "./report-config";

function createReportColumns(
	duplicatingId: string | null,
	onDuplicate: (id: string) => void,
	onDelete: (id: string, name: string) => void
): ColumnDef<Doc<"reports">>[] {
	return [
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => {
				const report = row.original;
				const VizIcon = visualizationIcons[report.visualization.type];
				const groupBy = report.config.groupBy?.[0];
				const groupByLabel =
					groupByOptions[report.config.entityType]?.find(
						(o) => o.value === groupBy
					)?.label ?? groupBy;
				const source =
					entityLabels[report.config.entityType] ?? report.config.entityType;
				return (
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<VizIcon className="h-4.5 w-4.5" />
						</div>
						<div className="min-w-0">
							<p className="truncate font-medium text-foreground">
								{report.name}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{source}
								{groupByLabel ? ` · by ${groupByLabel}` : ""}
							</p>
						</div>
					</div>
				);
			},
		},
		{
			id: "type",
			header: "Type",
			meta: {
				headerClassName: "hidden sm:table-cell",
				cellClassName: "hidden sm:table-cell",
			},
			cell: ({ row }) => (
				<span className="text-sm capitalize text-muted-foreground">
					{row.original.visualization.type}
				</span>
			),
		},
		{
			id: "updated",
			header: "Updated",
			meta: {
				headerClassName: "hidden md:table-cell",
				cellClassName: "hidden md:table-cell",
			},
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{formatRelativeTime(row.original.updatedAt)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const report = row.original;
				return (
					<div
						onClick={(e) => e.stopPropagation()}
						className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
					>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Duplicate report"
							disabled={duplicatingId === report._id}
							onClick={() => onDuplicate(report._id)}
						>
							<Copy className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Delete report"
							className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
							onClick={() => onDelete(report._id, report.name)}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				);
			},
		},
	];
}

function ReportsPageContent() {
	const router = useRouter();
	const reports = useQuery(api.reports.list);
	const deleteReport = useMutation(api.reports.remove);
	const duplicateReport = useMutation(api.reports.duplicate);

	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [presetDialogOpen, setPresetDialogOpen] = useState(false);
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

	const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
	// Ref guards the same-tick double-click the disabled state can't catch.
	const duplicatingRef = useRef(false);

	const handleDuplicate = useCallback(
		async (id: string) => {
			if (duplicatingRef.current) return;
			duplicatingRef.current = true;
			setDuplicatingId(id);
			try {
				const newId = await duplicateReport({ id: id as Id<"reports"> });
				router.push(`/reports/${newId}`);
			} catch (error) {
				console.error("Failed to duplicate report:", error);
			} finally {
				duplicatingRef.current = false;
				setDuplicatingId(null);
			}
		},
		[duplicateReport, router]
	);

	const handleDeleteClick = useCallback((id: string, name: string) => {
		setReportToDelete({ id, name });
		setDeleteModalOpen(true);
	}, []);

	const columns = useMemo(
		() => createReportColumns(duplicatingId, handleDuplicate, handleDeleteClick),
		[duplicatingId, handleDuplicate, handleDeleteClick]
	);

	const table = useReactTable({
		data: reports ?? [],
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	const isLoading = reports === undefined;

	return (
		<div className="space-y-8 p-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="h-6 w-1.5 rounded-full bg-linear-to-b from-primary to-primary/60" />
				<div>
					<h1 className="text-2xl font-bold text-foreground">Reports</h1>
					<p className="text-sm text-muted-foreground">
						Build and view analytics for your organization
					</p>
				</div>
			</div>

			{/* Create hero — persistent; doubles as the empty state. */}
			<ReportCreatePanel onBrowsePresets={() => setPresetDialogOpen(true)} />

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
					<p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
						Reports you save will show up here.
					</p>
				) : (
					<DataGrid
						table={table}
						recordCount={reports.length}
						onRowClick={(report) => router.push(`/reports/${report._id}`)}
						rowClassName={() => "group"}
						tableLayout={{ width: "auto", headerBackground: true }}
					>
						<DataGridContainer className="rounded-lg border">
							<DataGridTable />
						</DataGridContainer>
					</DataGrid>
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

			<PresetLibraryDialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen} />
		</div>
	);
}

export default function ReportsPage() {
	return (
		<PermissionGate object="reports">
			<ReportsPageContent />
		</PermissionGate>
	);
}
