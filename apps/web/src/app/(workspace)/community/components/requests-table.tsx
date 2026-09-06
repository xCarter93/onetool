"use client";

import * as React from "react";
import {
	useTable,
	type ColumnDef,
	type SortingState,
} from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

import {
	DataGrid,
	DataGridContainer,
	dataGridFeatures,
	type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, type StatusRole } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { useCreateRecord } from "@/components/domain/create-record-provider";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import { formatRelativeTime } from "@/lib/notification-utils";

type Lead = Doc<"communityLeads">;
type LeadStatus = Lead["status"];

export type RequestFilter = "new" | "all";

/** Labels the ladder in the owner's language: a converted lead is a client. */
const STATUS_META: Record<LeadStatus, { label: string; role: StatusRole }> = {
	new: { label: "New", role: "info" },
	contacted: { label: "Contacted", role: "neutral" },
	quoted: { label: "Quoted", role: "warning" },
	converted: { label: "Client", role: "success" },
	archived: { label: "Archived", role: "neutral" },
};

interface RequestsTableProps {
	leads: Lead[];
	newCount: number;
	/** Org-wide count, so an empty table can tell "none yet" from "none new". */
	total: number;
	filter: RequestFilter;
	onFilterChange: (filter: RequestFilter) => void;
}

/**
 * Requests from the public page, and the two moves that follow one: promote to
 * a client, or start a quote for a client already promoted.
 */
export function RequestsTable({
	leads,
	newCount,
	total,
	filter,
	onFilterChange,
}: RequestsTableProps) {
	const toast = useToast();
	const openCreate = useCreateRecord();
	const updateStatus = useMutation(api.communityLeads.updateStatus);
	const promoteToClient = useMutation(api.communityLeads.promoteToClient);
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [busyId, setBusyId] = React.useState<string | null>(null);

	const setStatus = React.useCallback(
		async (lead: Lead, status: LeadStatus) => {
			try {
				await updateStatus({ leadId: lead._id, status });
			} catch (error) {
				toast.error(
					"Could not update the request",
					convexErrorMessage(error, "Please try again")
				);
			}
		},
		[updateStatus, toast]
	);

	const promote = React.useCallback(
		async (lead: Lead) => {
			setBusyId(lead._id);
			try {
				const clientId = await promoteToClient({ leadId: lead._id });
				toast.success(
					`${lead.name} added as a client`,
					"Status moved to Client"
				);
				return clientId;
			} catch (error) {
				toast.error(
					"Could not add the client",
					convexErrorMessage(error, "Please try again")
				);
				return null;
			} finally {
				setBusyId(null);
			}
		},
		[promoteToClient, toast]
	);

	const sendQuote = React.useCallback(
		async (lead: Lead) => {
			// A quote needs somewhere to live, so promote first when it hasn't happened.
			const clientId = lead.clientId ?? (await promote(lead));
			if (!clientId) return;
			openCreate({ type: "quote", clientId });
		},
		[promote, openCreate]
	);

	const columns = React.useMemo<ColumnDef<DataGridFeatures, Lead>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="font-medium text-foreground">
							{row.original.name}
						</span>
						<a
							href={`mailto:${row.original.email}`}
							className="text-xs text-muted-foreground hover:text-foreground hover:underline"
						>
							{row.original.email}
						</a>
					</div>
				),
			},
			{
				accessorKey: "message",
				header: "Message",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="line-clamp-2 max-w-md text-muted-foreground">
						{row.original.message || "No message"}
					</span>
				),
			},
			{
				accessorKey: "service",
				header: "Service",
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.service || "Not specified"}
					</span>
				),
			},
			{
				accessorKey: "submittedAt",
				header: "Received",
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-muted-foreground">
						{formatRelativeTime(row.original.submittedAt)}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => {
					const meta = STATUS_META[row.original.status];
					return (
						<StatusBadge role={meta.role} appearance="soft">
							{meta.label}
						</StatusBadge>
					);
				},
			},
			{
				id: "actions",
				header: "",
				enableSorting: false,
				cell: ({ row }) => {
					const lead = row.original;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										disabled={busyId === lead._id}
										aria-label={`Actions for ${lead.name}`}
									>
										<MoreHorizontal className="size-4" aria-hidden="true" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuItem onClick={() => void sendQuote(lead)}>
									Send quote
								</DropdownMenuItem>
								{!lead.clientId && (
									<DropdownMenuItem onClick={() => void promote(lead)}>
										Add as client
									</DropdownMenuItem>
								)}
								<DropdownMenuItem
									render={<a href={`mailto:${lead.email}`} />}
								>
									Reply by email
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								{(["contacted", "quoted"] as const).map((status) => (
									<DropdownMenuItem
										key={status}
										disabled={lead.status === status}
										onClick={() => void setStatus(lead, status)}
									>
										Mark {STATUS_META[status].label.toLowerCase()}
									</DropdownMenuItem>
								))}
								<DropdownMenuItem
									disabled={lead.status === "archived"}
									onClick={() => void setStatus(lead, "archived")}
								>
									Archive
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		],
		[busyId, promote, sendQuote, setStatus]
	);

	const table = useTable({
		features: dataGridFeatures,
		data: leads,
		columns,
		state: { sorting },
		onSortingChange: setSorting,
		getRowId: (row) => row._id,
		// No pagination UI; stops the bundled paginatedRowModel truncating at 10 rows.
		manualPagination: true,
	});

	return (
		<DataGrid
			table={table}
			recordCount={leads.length}
			emptyMessage={
				<EmptyState
					size="md"
					illustration="community-page"
					title={
						total === 0
							? "No requests yet"
							: filter === "new"
								? "No new requests"
								: "Nothing here"
					}
					description={
						total === 0
							? "When someone submits the quote form on your public page, it lands here."
							: "Everything has been picked up. Switch to All to see the rest."
					}
				/>
			}
			tableLayout={{ width: "auto", headerBackground: true }}
		>
			<div className="rounded-xl border border-border bg-muted/40 p-[3px]">
				<div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
					<div>
						<h2 className="text-sm font-semibold text-foreground">
							Requests from your page
						</h2>
						<p className="text-xs text-muted-foreground">
							Every submission also creates a follow-up task. Add someone as a
							client when you are ready.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<SegmentedControl
							value={filter}
							onValueChange={(next) => onFilterChange(next as RequestFilter)}
							options={[
								{
									value: "new",
									label: newCount > 0 ? `New (${newCount})` : "New",
								},
								{ value: "all", label: "All" },
							]}
						/>
						<Button
							variant="outline"
							size="sm"
							nativeButton={false}
							render={<Link href="/tasks" />}
						>
							Open in Tasks
							<ArrowRight className="size-4 ml-1.5" />
						</Button>
					</div>
				</div>
				<DataGridContainer className="rounded-lg border-0 bg-background">
					<DataGridTable />
				</DataGridContainer>
			</div>
		</DataGrid>
	);
}
