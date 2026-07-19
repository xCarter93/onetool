"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FiltersWithClear } from "@/components/filters/radius-full";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { SegmentedControl } from "@/components/domain/segmented-control";
import type { Filter, FilterFieldConfig } from "@/components/ui/filters";
import {
	DateFilterValue,
	matchesDateFilter,
} from "@/components/filters/date-filter";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import {
	ColumnDef,
	SortingState,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Building2,
	Calendar,
	CheckCircle2,
	Clock,
	DollarSign,
	ExternalLink,
	Eye,
	Filter as FilterIcon,
	FolderKanban,
	LayoutGrid,
	Receipt,
	Search,
	TableProperties,
	Trash2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { todayUtcMidnightMs } from "@/lib/dates";
import { api } from "@onetool/backend/convex/_generated/api";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { useActivitySparklines } from "@/hooks/use-activity-sparklines";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useState } from "react";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { MetricFrame } from "@/components/metric-frame";
import {
	type DragEndEvent,
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "../projects/components/kanban";
import { InvoiceDetailDrawer } from "./components/invoice-detail-drawer";
import { ActivitySparkline } from "@/components/shared/activity-sparkline";
import { ActivityColumnHeader } from "@/components/shared/activity-column-header";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";

type InvoiceStatus = Doc<"invoices">["status"];

// Enhanced invoice type that includes resolved client/project names for display
type InvoiceWithClient = Doc<"invoices"> & {
	clientName: string;
	projectName?: string;
	activity?: number[];
};

type InvoiceKanbanItem = {
	id: string;
	name: string;
	column: InvoiceStatus;
	status: InvoiceStatus;
	clientName: string;
	projectName?: string;
	total: number;
	invoiceNumber: string;
	dueDate: number;
	issuedDate: number;
};

type InvoiceKanbanColumn = {
	id: InvoiceStatus;
	name: string;
	description: string;
};

// Overdue is a computed state: a sent invoice past its due date. Reads the clock
// inside this module-level helper so component render stays pure.
const getEffectiveStatus = (
	status: InvoiceStatus,
	dueDate: number
): InvoiceStatus =>
	status === "sent" && dueDate < todayUtcMidnightMs() ? "overdue" : status;

// appearance chosen to match the legacy statusVariant() boldness: solid for the
// primary/positive status, soft for the mid-weight statuses, outline for the rest.
const statusAppearance = (status: InvoiceStatus) => {
	if (status === "paid") return "solid" as const;
	if (status === "draft") return "outline" as const;
	return "soft" as const;
};

// Per-lane accent dot (kanban-board-4 style); status → colored dot only.
const statusDot: Record<InvoiceStatus, string> = {
	draft: "bg-muted-foreground/50",
	sent: "bg-amber-500",
	paid: "bg-emerald-500",
	overdue: "bg-rose-500",
	cancelled: "bg-muted-foreground/40",
};

const kanbanColumns: InvoiceKanbanColumn[] = [
	{ id: "draft", name: "Draft", description: "Being prepared" },
	{ id: "sent", name: "Sent", description: "Awaiting payment" },
	{ id: "paid", name: "Paid", description: "Payment received" },
	{ id: "overdue", name: "Overdue", description: "Past due date" },
	{ id: "cancelled", name: "Cancelled", description: "Voided invoices" },
];

const formatStatus = (status: InvoiceStatus) => {
	switch (status) {
		case "draft":
			return "Draft";
		case "sent":
			return "Sent";
		case "paid":
			return "Paid";
		case "overdue":
			return "Overdue";
		case "cancelled":
			return "Cancelled";
		default:
			return status;
	}
};

// Calendar-date fields are stored as UTC-midnight epochs; format in UTC so the day never shifts.
const formatInvoiceDate = (timestamp?: number) => {
	if (!timestamp) return "Not set";
	return new Date(timestamp).toLocaleDateString(undefined, { timeZone: "UTC" });
};

const createColumns = (
	router: ReturnType<typeof useRouter>,
	onDelete: (id: string, name: string) => void,
	onPreview: (id: string) => void,
	canDelete: boolean
): ColumnDef<InvoiceWithClient>[] => [
	{
		accessorKey: "invoiceNumber",
		header: "Invoice",
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium text-foreground">
					{row.original.invoiceNumber}
				</span>
				<span className="text-muted-foreground text-xs">
					{row.original.projectName || "No project"}
				</span>
			</div>
		),
	},
	{
		accessorKey: "clientName",
		header: "Client",
		cell: ({ row }) => (
			<span className="text-foreground">{row.original.clientName}</span>
		),
	},
	{
		accessorKey: "total",
		header: "Amount",
		cell: ({ row }) => (
			<span className="text-foreground font-medium tabular-nums">
				{formatCurrency(row.original.total)}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const effective = getEffectiveStatus(
				row.original.status,
				row.original.dueDate
			);
			return (
				<StatusBadge status={effective} appearance={statusAppearance(effective)}>
					{formatStatus(effective)}
				</StatusBadge>
			);
		},
	},
	{
		accessorKey: "issuedDate",
		header: "Issued",
		cell: ({ row }) => (
			<span className="text-foreground">
				{formatInvoiceDate(row.original.issuedDate)}
			</span>
		),
	},
	{
		accessorKey: "dueDate",
		header: "Due Date",
		cell: ({ row }) => {
			const isOverdue =
				row.original.dueDate < todayUtcMidnightMs() &&
				row.original.status !== "paid";
			return (
				<span
					className={cn(
						"text-foreground",
						isOverdue && "text-destructive font-medium"
					)}
				>
					{formatInvoiceDate(row.original.dueDate)}
				</span>
			);
		},
	},
	{
		id: "activity",
		header: () => <ActivityColumnHeader />,
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex justify-center">
				<ActivitySparkline data={row.original.activity} />
			</div>
		),
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => (
			// Stop row-click preview from firing when using the explicit actions.
			<div
				className="flex items-center justify-end gap-2"
				onClick={(e) => e.stopPropagation()}
			>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onPreview(row.original._id)}
					aria-label={`Preview invoice ${row.original.invoiceNumber}`}
				>
					<Eye className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => router.push(`/invoices/${row.original._id}`)}
					aria-label={`Open invoice ${row.original.invoiceNumber}`}
				>
					<ExternalLink className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onDelete(row.original._id, row.original.invoiceNumber)}
					disabled={!canDelete}
					className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
					aria-label={`Delete invoice ${row.original.invoiceNumber}`}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		),
	},
];

function InvoicesPageContent() {
	const router = useRouter();
	const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [query, setQuery] = React.useState("");
	const [filters, setFilters] = React.useState<Filter<unknown>[]>([]);
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [invoiceToDelete, setInvoiceToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [previewId, setPreviewId] = useState<Id<"invoices"> | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const deleteInvoice = useMutation(api.invoices.remove);
	const updateInvoiceStatus = useMutation(api.invoices.update);
	const [kanbanData, setKanbanData] = useState<InvoiceKanbanItem[]>([]);
	const isOrgSwitching = useIsOrgSwitching();
	const { can } = usePermissions();
	const canDeleteInvoices = can("invoices", "delete");

	// Fetch invoices, clients, and projects from Convex. The clients/projects
	// reads are gated — skip them without the grant so the page doesn't crash.
	const invoices = useQuery(api.invoices.list, {});
	// 30-day activity sparkline data, keyed by invoice id (presentational).
	const sparklines = useActivitySparklines("invoice");
	const clients = useQuery(api.clients.list, can("clients") ? {} : "skip");
	const projects = useQuery(api.projects.list, can("projects") ? {} : "skip");

	// Combine invoices with resolved client and project names
	const data = React.useMemo((): InvoiceWithClient[] => {
		if (!invoices) return [];
		return invoices.map((invoice) => {
			const client = clients?.find((c) => c._id === invoice.clientId);
			const project = projects?.find((p) => p._id === invoice.projectId);
			return {
				...invoice,
				clientName: client?.companyName || "Unknown Client",
				projectName: project?.title,
				activity: sparklines?.[invoice._id],
			};
		});
	}, [invoices, clients, projects, sparklines]);

	// Advanced filters (status / client / project / due-date / amount).
	// Status compares against the EFFECTIVE status so "overdue" filtering works.
	const filteredData = React.useMemo(() => {
		let result = data;
		filters.forEach((filter) => {
			if (filter.values.length === 0) return;
			switch (filter.field) {
				case "status":
					result = result.filter((inv) =>
						filter.values.includes(
							getEffectiveStatus(inv.status, inv.dueDate) as unknown
						)
					);
					break;
				case "client":
					result = result.filter((inv) =>
						filter.values.includes(inv.clientId as unknown)
					);
					break;
				case "project":
					result = result.filter(
						(inv) =>
							inv.projectId != null &&
							filter.values.includes(inv.projectId as unknown)
					);
					break;
				case "dueDate":
					result = result.filter((inv) =>
						matchesDateFilter(inv.dueDate, filter.operator, filter.values[0])
					);
					break;
				case "amount":
					if (filter.operator === "between" && filter.values.length === 2) {
						const [minVal, maxVal] = filter.values as [string, string];
						if (minVal !== "" && minVal != null) {
							const min = Number(minVal);
							if (!Number.isNaN(min))
								result = result.filter((inv) => inv.total >= min);
						}
						if (maxVal !== "" && maxVal != null) {
							const max = Number(maxVal);
							if (!Number.isNaN(max))
								result = result.filter((inv) => inv.total <= max);
						}
					}
					break;
			}
		});
		return result;
	}, [data, filters]);

	// Free-text search on top of the advanced filters; drives table + kanban.
	const searchedData = React.useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return filteredData;
		return filteredData.filter((inv) => {
			const effectiveStatus = getEffectiveStatus(inv.status, inv.dueDate);
			return (
				inv.invoiceNumber?.toLowerCase().includes(q) ||
				inv.clientName?.toLowerCase().includes(q) ||
				inv.projectName?.toLowerCase().includes(q) ||
				inv.status?.toLowerCase().includes(q) ||
				effectiveStatus.toLowerCase().includes(q) ||
				formatStatus(effectiveStatus).toLowerCase().includes(q)
			);
		});
	}, [filteredData, query]);

	// Effective-status map keyed by invoice id, used to detect kanban drag changes.
	const invoiceStatusMap = React.useMemo(() => {
		const statusMap = new Map<string, InvoiceStatus>();
		data.forEach((invoice) =>
			statusMap.set(
				invoice._id,
				getEffectiveStatus(invoice.status, invoice.dueDate)
			)
		);
		return statusMap;
	}, [data]);

	React.useEffect(() => {
		setKanbanData(
			searchedData.map((invoice) => {
				const effective = getEffectiveStatus(invoice.status, invoice.dueDate);
				return {
					id: invoice._id,
					name: invoice.invoiceNumber,
					column: effective,
					status: effective,
					clientName: invoice.clientName,
					projectName: invoice.projectName,
					total: invoice.total,
					invoiceNumber: invoice.invoiceNumber,
					dueDate: invoice.dueDate,
					issuedDate: invoice.issuedDate,
				};
			})
		);
	}, [searchedData]);

	// Loading state — gate only on the primary invoices query. The clients and
	// projects reads are permission-skipped and stay undefined without the grant,
	// which would otherwise pin the page on the skeleton forever.
	const isLoading = isOrgSwitching || invoices === undefined;

	// Empty state
	const isEmpty = !isLoading && data.length === 0;

	const handleDelete = React.useCallback((id: string, name: string) => {
		setInvoiceToDelete({ id, name });
		setDeleteModalOpen(true);
	}, []);

	const openPreview = React.useCallback((id: string) => {
		setPreviewId(id as Id<"invoices">);
		setPreviewOpen(true);
	}, []);

	const confirmDelete = async () => {
		if (!invoiceToDelete) return;
		// Success/error toasts + closing are owned by DeleteConfirmationModal;
		// let errors propagate so the modal shows a single error toast.
		await deleteInvoice({ id: invoiceToDelete.id as Id<"invoices"> });
		setInvoiceToDelete(null);
	};

	const columns = React.useMemo(
		() => createColumns(router, handleDelete, openPreview, canDeleteInvoices),
		[router, handleDelete, openPreview, canDeleteInvoices]
	);

	const table = useReactTable({
		data: searchedData,
		columns,
		state: {
			sorting,
			pagination,
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	// Reset to first page when the filtered/searched set changes
	React.useEffect(() => {
		setPagination((prev) =>
			prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }
		);
	}, [query, filters, searchedData.length]);

	// Filter field configuration for the advanced filter builder
	const filterFields: FilterFieldConfig<unknown>[] = React.useMemo(() => {
		const statusOptions = [
			{ value: "draft", label: "Draft" },
			{ value: "sent", label: "Sent" },
			{ value: "paid", label: "Paid" },
			{ value: "overdue", label: "Overdue" },
			{ value: "cancelled", label: "Cancelled" },
		];
		const clientOptions =
			clients?.map((client) => ({
				value: client._id,
				label: client.companyName,
			})) || [];
		const projectOptions =
			projects?.map((project) => ({
				value: project._id,
				label: project.title,
			})) || [];

		return [
			{
				key: "status",
				label: "Status",
				icon: <CheckCircle2 className="h-3 w-3" />,
				type: "select",
				options: statusOptions,
			},
			{
				key: "client",
				label: "Client",
				icon: <Building2 className="h-3 w-3" />,
				type: "multiselect",
				options: clientOptions,
				searchable: true,
			},
			{
				key: "project",
				label: "Project",
				icon: <FolderKanban className="h-3 w-3" />,
				type: "multiselect",
				options: projectOptions,
				searchable: true,
			},
			{
				key: "dueDate",
				label: "Due Date",
				icon: <Calendar className="h-3 w-3" />,
				type: "date",
				defaultOperator: "before",
				operators: [
					{ value: "before", label: "before" },
					{ value: "after", label: "after" },
					{ value: "is", label: "on" },
				],
				customRenderer: (p) => (
					<DateFilterValue values={p.values} onChange={p.onChange} />
				),
			},
			{
				key: "amount",
				label: "Amount",
				icon: <DollarSign className="h-3 w-3" />,
				type: "number",
				defaultOperator: "between",
			},
		];
	}, [clients, projects]);

	// onDataChange fires on every drag-over (column crossing), so keep it purely
	// optimistic; the DB write happens once on drop via handleKanbanDragEnd.
	const handleKanbanDataChange = React.useCallback(
		(nextData: InvoiceKanbanItem[]) => {
			// Overdue is a computed lane. Dropping a card there stores "sent"; a
			// future-due invoice then normalizes back to "sent" instead of sticking
			// in Overdue. Renormalize each card to its effective status first.
			const normalized = nextData.map((item) => {
				const storedStatus: InvoiceStatus =
					item.column === "overdue" ? "sent" : item.column;
				const effective = getEffectiveStatus(storedStatus, item.dueDate);
				return { ...item, column: effective, status: effective };
			});
			setKanbanData(normalized);
		},
		[]
	);

	const handleKanbanDragEnd = React.useCallback(
		(event: DragEndEvent) => {
			const item = kanbanData.find((i) => i.id === event.active.id);
			if (!item) return;
			const originalStatus = invoiceStatusMap.get(item.id);
			if (originalStatus && originalStatus !== item.column) {
				// Overdue is computed from a past-due "sent" invoice, so dropping into
				// either the sent or overdue lane writes the stored status "sent".
				const nextStatus: InvoiceStatus =
					item.column === "overdue" ? "sent" : item.column;
				updateInvoiceStatus({
					id: item.id as Id<"invoices">,
					status: nextStatus,
				}).catch((error) => {
					console.error("Failed to update invoice status:", error);
				});
			}
		},
		[kanbanData, invoiceStatusMap, updateInvoiceStatus]
	);

	return (
		<div className="relative px-6 pt-8 pb-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Invoices</h1>
						<p className="text-muted-foreground text-sm">
							Manage your invoices and track payments
						</p>
					</div>
				</div>
			</div>

			<MetricFrame
				loading={isLoading}
				metrics={[
					{
						label: "Total Invoices",
						value: data.length,
						hint: "All invoices in your workspace",
						icon: <Receipt />,
						accent: "var(--color-blue-500)",
					},
					{
						label: "Open Invoices",
						value: data.filter(
							(inv) => inv.status === "draft" || inv.status === "sent"
						).length,
						hint: "Unpaid and draft invoices",
						icon: <Clock />,
						accent: "var(--color-amber-500)",
					},
					{
						label: "Paid Value",
						value: formatCurrency(
							data
								.filter((inv) => inv.status === "paid")
								.reduce((sum, inv) => sum + inv.total, 0)
						),
						hint: "Total value of paid invoices",
						icon: <CheckCircle2 />,
						accent: "var(--color-emerald-500)",
					},
				]}
				summary={
					isLoading
						? undefined
						: `${
								data.filter(
									(inv) =>
										inv.status === "sent" &&
										inv.dueDate < todayUtcMidnightMs()
								).length
							} overdue · ${formatCurrency(
								data
									.filter(
										(inv) => inv.status === "draft" || inv.status === "sent"
									)
									.reduce((sum, inv) => sum + inv.total, 0)
							)} outstanding`
				}
			/>

			<Frame>
				<FrameHeader className="flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<FrameTitle className="text-base">Invoices</FrameTitle>
						<FrameDescription>
							Search, filter, and browse your invoices
						</FrameDescription>
					</div>
					<div className="flex w-full items-center gap-2 sm:w-auto">
						<div className="relative flex-1 sm:w-64 sm:flex-none">
							<Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
							<Input
								placeholder="Search invoices..."
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
						<SegmentedControl
							className="shrink-0"
							value={viewMode}
							onValueChange={(v) => setViewMode(v as "table" | "kanban")}
							options={[
								{
									value: "table",
									label: "Table",
									icon: <TableProperties className="size-4" />,
									ariaLabel: "Table view",
									hideLabelOnMobile: true,
								},
								{
									value: "kanban",
									label: "Kanban",
									icon: <LayoutGrid className="size-4" />,
									ariaLabel: "Kanban view",
									hideLabelOnMobile: true,
								},
							]}
						/>
					</div>
				</FrameHeader>

				<DataGrid
					table={table}
					recordCount={searchedData.length}
					onRowClick={(row) => openPreview(row._id)}
					emptyMessage={
						<EmptyState
							illustration="no-filter-match"
							title="No invoices match your filters"
							description="Try a different search term or clear a filter."
						/>
					}
					tableLayout={{
						width: "auto",
						headerBackground: true,
					}}
				>
					<FramePanel className="p-0">
						{!isLoading && !isEmpty && (
							<div className="border-b px-4 py-3">
								<FiltersWithClear
									filters={filters}
									fields={filterFields}
									onChange={setFilters}
									addButtonText="Filter"
									addButtonIcon={<FilterIcon className="h-4 w-4" />}
									size="md"
									variant="outline"
									radius="full"
									showClearButton={true}
									clearButtonText="Clear"
									clearButtonIcon={<X className="h-4 w-4" />}
								/>
							</div>
						)}

						{isLoading ? (
							<div className="p-4">
								<div className="space-y-4">
									{[...Array(5)].map((_, i) => (
										<div key={i} className="flex items-center space-x-4 p-4">
											<div className="flex-1 space-y-2">
												<div className="h-4 bg-muted rounded animate-pulse w-2/3" />
												<div className="h-3 bg-muted rounded animate-pulse w-1/2" />
											</div>
											<div className="h-4 bg-muted rounded animate-pulse w-16" />
											<div className="h-4 bg-muted rounded animate-pulse w-20" />
											<div className="h-8 w-8 bg-muted rounded animate-pulse" />
										</div>
									))}
								</div>
							</div>
						) : isEmpty ? (
							<EmptyState
								size="md"
								illustration="invoices-none"
								title="No invoices yet"
								description="Create invoices from approved quotes on the Projects page to get started tracking payments and revenue."
							/>
						) : viewMode === "table" ? (
							<div className="overflow-x-auto">
								<DataGridContainer className="rounded-lg border">
									<DataGridTable />
								</DataGridContainer>
							</div>
						) : (
							<div className="px-2 py-4 h-[calc(100vh-30rem)] min-h-[24rem]">
								<KanbanProvider
									columns={kanbanColumns}
									data={kanbanData}
									onDataChange={handleKanbanDataChange}
									onDragEnd={handleKanbanDragEnd}
								>
									{(column) => {
										const columnItems = kanbanData.filter(
											(item) => item.column === column.id
										);

										return (
											<KanbanBoard
												key={column.id}
												id={column.id}
												className="bg-card/60 flex flex-col"
											>
												<KanbanHeader className="border-b bg-muted/30 flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
													<div className="flex min-w-0 items-center gap-2">
														<span
															className={cn(
																"size-2.5 shrink-0 rounded-full",
																statusDot[column.id]
															)}
														/>
														<div className="min-w-0">
															<p className="text-foreground truncate text-sm font-semibold">
																{column.name}
															</p>
															<p className="text-muted-foreground truncate text-xs">
																{column.description}
															</p>
														</div>
													</div>
													<Badge variant="outline">
														{columnItems.length}
													</Badge>
												</KanbanHeader>
												<KanbanCards id={column.id}>
													{(item: InvoiceKanbanItem) => (
														<KanbanCard
															key={item.id}
															id={item.id}
															name={item.name}
															column={item.column}
														>
															<div
																role="button"
																tabIndex={0}
																onClick={() => openPreview(item.id)}
																onKeyDown={(e) => {
																	if (e.currentTarget !== e.target) return;
																	if (e.key === "Enter" || e.key === " ") {
																		e.preventDefault();
																		openPreview(item.id);
																	}
																}}
																className="flex cursor-pointer flex-col gap-2 outline-none"
															>
																<div className="flex items-start justify-between gap-2">
																	<p className="text-foreground line-clamp-2 text-sm font-medium">
																		{item.invoiceNumber}
																	</p>
																	<StatusBadge
																		status={item.status}
																		appearance={statusAppearance(item.status)}
																		className="shrink-0"
																	>
																		{formatStatus(item.status)}
																	</StatusBadge>
																</div>
																<p className="text-muted-foreground truncate text-xs">
																	{item.clientName}
																</p>
																<div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
																	<span>
																		{formatInvoiceDate(item.issuedDate)}
																	</span>
																	<span aria-hidden>·</span>
																	<span
																		className={cn(
																			item.dueDate < todayUtcMidnightMs() &&
																				item.status !== "paid" &&
																				"text-destructive font-medium"
																		)}
																	>
																		Due {formatInvoiceDate(item.dueDate)}
																	</span>
																</div>
																<div className="flex items-center justify-between pt-1">
																	<span className="text-foreground text-sm font-semibold tabular-nums">
																		{formatCurrency(item.total)}
																	</span>
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			router.push(`/invoices/${item.id}`);
																		}}
																		className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
																	>
																		Open <ExternalLink className="size-3" />
																	</button>
																</div>
															</div>
														</KanbanCard>
													)}
												</KanbanCards>
											</KanbanBoard>
										);
									}}
								</KanbanProvider>
							</div>
						)}
					</FramePanel>

					{!isLoading && !isEmpty && (
						<FrameFooter className="flex-row items-center justify-between">
							<div className="text-muted-foreground text-sm">
								{searchedData.length} of {data.length} invoices
							</div>
							{viewMode === "table" ? <DataGridPagination /> : null}
						</FrameFooter>
					)}
				</DataGrid>
			</Frame>

			{/* Detail preview drawer */}
			<InvoiceDetailDrawer
				invoiceId={previewId}
				open={previewOpen}
				onOpenChange={setPreviewOpen}
			/>

			{/* Delete Confirmation Modal */}
			{invoiceToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Delete Invoice"
					itemName={invoiceToDelete.name}
					itemType="Invoice"
				/>
			)}
		</div>
	);
}

export default function InvoicesPage() {
	return (
		<PermissionGate object="invoices">
			<InvoicesPageContent />
		</PermissionGate>
	);
}
