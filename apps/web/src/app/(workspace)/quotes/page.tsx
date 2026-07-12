"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
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
	FileText,
	Filter as FilterIcon,
	FolderKanban,
	LayoutGrid,
	Plus,
	Search,
	TableProperties,
	Trash2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useState } from "react";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { MetricFrame } from "@/components/metric-frame";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import {
	type DragEndEvent,
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "../projects/components/kanban";
import { QuoteDetailDrawer } from "./components/quote-detail-drawer";
import { ActivitySparkline } from "@/components/shared/activity-sparkline";
import { cn } from "@/lib/utils";

type QuoteWithClient = Doc<"quotes"> & {
	clientName: string;
	projectName?: string;
	activity?: number[];
};

type QuoteKanbanItem = {
	id: string;
	name: string;
	column: Doc<"quotes">["status"];
	status: Doc<"quotes">["status"];
	clientName: string;
	total: number;
	quoteNumber: string;
	validUntil?: number;
};

type QuoteKanbanColumn = {
	id: Doc<"quotes">["status"];
	name: string;
	description: string;
};

const quoteStatusAppearance = (status: Doc<"quotes">["status"]) => {
	if (status === "approved") return "solid" as const;
	if (status === "draft") return "outline" as const;
	return "soft" as const;
};

// Per-lane accent dot (kanban-board-4 style); status → colored dot only.
const statusDot: Record<Doc<"quotes">["status"], string> = {
	draft: "bg-muted-foreground/50",
	sent: "bg-amber-500",
	approved: "bg-emerald-500",
	declined: "bg-rose-500",
	expired: "bg-muted-foreground/40",
};

const kanbanColumns: QuoteKanbanColumn[] = [
	{ id: "draft", name: "Draft", description: "Being prepared" },
	{ id: "sent", name: "Sent", description: "Awaiting response" },
	{ id: "approved", name: "Approved", description: "Accepted by client" },
	{ id: "declined", name: "Declined", description: "Rejected by client" },
	{ id: "expired", name: "Expired", description: "Past valid date" },
];

const formatStatus = (status: Doc<"quotes">["status"]) => {
	switch (status) {
		case "draft":
			return "Draft";
		case "sent":
			return "Sent";
		case "approved":
			return "Approved";
		case "declined":
			return "Declined";
		case "expired":
			return "Expired";
		default:
			return status;
	}
};

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

const formatQuoteDate = (timestamp?: number) => {
	if (!timestamp) return "Not set";
	return new Date(timestamp).toLocaleDateString();
};

const createColumns = (
	router: ReturnType<typeof useRouter>,
	onDelete: (id: string, name: string) => void,
	onPreview: (id: string) => void,
	canDelete: boolean
): ColumnDef<QuoteWithClient>[] => [
	{
		accessorKey: "quoteNumber",
		header: "Quote",
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium text-foreground">
					{row.original.quoteNumber || `#${row.original._id.slice(-6)}`}
				</span>
				<span className="text-muted-foreground text-xs">
					{row.original.title || row.original.projectName || "Untitled Quote"}
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
			<span className="text-foreground font-medium">
				{formatCurrency(row.original.total)}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.original.status;
			return (
				<StatusBadge status={status} appearance={quoteStatusAppearance(status)}>
					{formatStatus(status)}
				</StatusBadge>
			);
		},
	},
	{
		accessorKey: "validUntil",
		header: "Valid Until",
		cell: ({ row }) => {
			if (!row.original.validUntil) {
				return <span className="text-muted-foreground">Not set</span>;
			}
			const d = new Date(row.original.validUntil);
			const isExpired = d < new Date();
			return (
				<span className={cn("text-foreground", isExpired && "text-destructive")}>
					{d.toLocaleDateString()}
				</span>
			);
		},
	},
	{
		accessorKey: "_creationTime",
		header: "Created",
		cell: ({ row }) => {
			const d = new Date(row.original._creationTime);
			return <span className="text-foreground">{d.toLocaleDateString()}</span>;
		},
	},
	{
		id: "activity",
		header: "Activity",
		enableSorting: false,
		cell: ({ row }) => <ActivitySparkline data={row.original.activity} />,
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => {
			const label =
				row.original.quoteNumber || `#${row.original._id.slice(-6)}`;
			return (
				// Stop row-click preview from firing when using the explicit actions.
				<div
					className="flex items-center justify-end gap-2"
					onClick={(e) => e.stopPropagation()}
				>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={() => onPreview(row.original._id)}
						aria-label={`Preview quote ${label}`}
					>
						<Eye className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={() => router.push(`/quotes/${row.original._id}`)}
						aria-label={`Open quote ${label}`}
					>
						<ExternalLink className="size-4" />
					</Button>
					{canDelete && (
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onDelete(row.original._id, label)}
							className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
							aria-label={`Delete quote ${label}`}
						>
							<Trash2 className="size-4" />
						</Button>
					)}
				</div>
			);
		},
	},
];

function QuotesPageContent() {
	const router = useRouter();
	const toast = useToast();
	const { can } = usePermissions();
	const canModifyQuotes = can("quotes", "modify");
	const canDeleteQuotes = can("quotes", "delete");
	const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [query, setQuery] = React.useState("");
	const [filters, setFilters] = React.useState<Filter<unknown>[]>([]);
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [quoteToDelete, setQuoteToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [previewId, setPreviewId] = useState<Id<"quotes"> | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const deleteQuote = useMutation(api.quotes.remove);
	const updateQuoteStatus = useMutation(api.quotes.update);
	const [kanbanData, setKanbanData] = useState<QuoteKanbanItem[]>([]);

	// Fetch data from Convex. The clients/projects reads are gated — skip them
	// without the grant so the page doesn't crash for quotes-only viewers.
	const quotes = useQuery(api.quotes.list, {});
	// 30-day activity sparkline data, keyed by quote id (presentational).
	const sparklines = useQuery(api.activities.activitySparklines, {
		entityType: "quote",
	});
	const clients = useQuery(api.clients.list, can("clients") ? {} : "skip");
	const projects = useQuery(api.projects.list, can("projects") ? {} : "skip");

	// Combine quotes with client and project data
	const data = React.useMemo((): QuoteWithClient[] => {
		if (!quotes) return [];

		return quotes.map((quote) => {
			const client = clients?.find((c) => c._id === quote.clientId);
			const project = projects?.find((p) => p._id === quote.projectId);

			return {
				...quote,
				clientName: client?.companyName || "Unknown Client",
				projectName: project?.title,
				activity: sparklines?.[quote._id],
			};
		});
	}, [quotes, clients, projects, sparklines]);

	// Advanced filters (status / client / project / valid-until / amount).
	const filteredData = React.useMemo(() => {
		let result = data;
		filters.forEach((filter) => {
			if (filter.values.length === 0) return;
			switch (filter.field) {
				case "status":
					result = result.filter((q) =>
						filter.values.includes(q.status as unknown)
					);
					break;
				case "client":
					result = result.filter((q) =>
						filter.values.includes(q.clientId as unknown)
					);
					break;
				case "project":
					result = result.filter(
						(q) =>
							q.projectId != null &&
							filter.values.includes(q.projectId as unknown)
					);
					break;
				case "validUntil":
					result = result.filter((q) =>
						matchesDateFilter(q.validUntil, filter.operator, filter.values[0])
					);
					break;
				case "amount":
					if (filter.operator === "between" && filter.values.length === 2) {
						const [minVal, maxVal] = filter.values as [string, string];
						if (minVal !== "" && minVal != null) {
							const min = Number(minVal);
							if (!Number.isNaN(min))
								result = result.filter((q) => q.total >= min);
						}
						if (maxVal !== "" && maxVal != null) {
							const max = Number(maxVal);
							if (!Number.isNaN(max))
								result = result.filter((q) => q.total <= max);
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
		return filteredData.filter(
			(quote) =>
				quote.quoteNumber?.toLowerCase().includes(q) ||
				quote.title?.toLowerCase().includes(q) ||
				quote.projectName?.toLowerCase().includes(q) ||
				quote.clientName?.toLowerCase().includes(q) ||
				quote.status?.toLowerCase().includes(q)
		);
	}, [filteredData, query]);

	const quoteStatusMap = React.useMemo(() => {
		const statusMap = new Map<string, Doc<"quotes">["status"]>();
		data.forEach((quote) => statusMap.set(quote._id, quote.status));
		return statusMap;
	}, [data]);

	React.useEffect(() => {
		setKanbanData(
			searchedData.map((quote) => ({
				id: quote._id,
				name: quote.title || quote.projectName || "Untitled Quote",
				column: quote.status,
				status: quote.status,
				clientName: quote.clientName,
				total: quote.total,
				quoteNumber: quote.quoteNumber || `#${quote._id.slice(-6)}`,
				validUntil: quote.validUntil,
			}))
		);
	}, [searchedData]);

	// Loading state — gate only on the primary quotes query. The clients and
	// projects reads are permission-skipped and stay undefined without the grant,
	// which would otherwise pin the page on the skeleton forever.
	const isLoading = quotes === undefined;

	// Empty state
	const isEmpty = !isLoading && data.length === 0;

	const handleDelete = React.useCallback((id: string, name: string) => {
		setQuoteToDelete({ id, name });
		setDeleteModalOpen(true);
	}, []);

	const openPreview = React.useCallback((id: string) => {
		setPreviewId(id as Id<"quotes">);
		setPreviewOpen(true);
	}, []);

	const confirmDelete = async () => {
		if (!quoteToDelete) return;
		// Success/error toasts + closing are owned by DeleteConfirmationModal;
		// let errors propagate so the modal shows a single error toast.
		await deleteQuote({ id: quoteToDelete.id as Id<"quotes"> });
		setQuoteToDelete(null);
	};

	const columns = React.useMemo(
		() => createColumns(router, handleDelete, openPreview, canDeleteQuotes),
		[router, handleDelete, openPreview, canDeleteQuotes]
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
			{ value: "approved", label: "Approved" },
			{ value: "declined", label: "Declined" },
			{ value: "expired", label: "Expired" },
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
				key: "validUntil",
				label: "Valid Until",
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
		(nextData: QuoteKanbanItem[]) => {
			setKanbanData(nextData);
		},
		[]
	);

	const handleKanbanDragEnd = React.useCallback(
		(event: DragEndEvent) => {
			if (!canModifyQuotes) return;
			const item = kanbanData.find((i) => i.id === event.active.id);
			if (!item) return;
			const originalStatus = quoteStatusMap.get(item.id);
			if (originalStatus && originalStatus !== item.column) {
				updateQuoteStatus({
					id: item.id as Id<"quotes">,
					status: item.column,
				}).catch((error) => {
					console.error("Failed to update quote status:", error);
					toast.error(
						"Update Failed",
						"Failed to update quote status. Please try again."
					);
				});
			}
		},
		[canModifyQuotes, kanbanData, quoteStatusMap, updateQuoteStatus, toast]
	);

	const totalPending = React.useMemo(
		() => data.filter((q) => q.status === "sent").length,
		[data]
	);

	const totalValue = React.useMemo(
		() =>
			data
				.filter((q) => q.status === "approved")
				.reduce((sum, q) => sum + q.total, 0),
		[data]
	);

	return (
		<div className="relative px-6 pt-8 pb-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Quotes</h1>
						<p className="text-muted-foreground text-sm">
							Overview of your quotes and proposals
						</p>
					</div>
				</div>
				{canModifyQuotes && (
					<Button onClick={() => router.push("/quotes/new")}>
						<Plus className="h-4 w-4" />
						Create Quote
					</Button>
				)}
			</div>

			<MetricFrame
				loading={isLoading}
				metrics={[
					{
						label: "Total Quotes",
						value: data.length,
						hint: "All quotes in your workspace",
						icon: <FileText />,
						accent: "var(--color-blue-500)",
					},
					{
						label: "Pending Approval",
						value: totalPending,
						hint: "Quotes awaiting client response",
						icon: <Clock />,
						accent: "var(--color-amber-500)",
					},
					{
						label: "Approved Value",
						value: formatCurrency(totalValue),
						hint: "Total value of approved quotes",
						icon: <DollarSign />,
						accent: "var(--color-emerald-500)",
					},
				]}
				summary={
					isLoading
						? undefined
						: `${data.filter((q) => q.status === "draft").length} in draft · ${data.filter((q) => q.status === "approved").length} approved · ${formatCurrency(data.reduce((sum, q) => sum + q.total, 0))} total value`
				}
			/>

			<Frame>
				<FrameHeader className="flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<FrameTitle className="text-base">Quotes</FrameTitle>
						<FrameDescription>
							Search, filter, and browse your quotes
						</FrameDescription>
					</div>
					<div className="flex w-full items-center gap-2 sm:w-auto">
						<div className="relative flex-1 sm:w-64 sm:flex-none">
							<Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
							<Input
								placeholder="Search quotes..."
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
					emptyMessage="No quotes match your filters."
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
								icon={<FileText />}
								title="No quotes yet"
								description="Create your first quote to get started and track proposals in one place."
								action={
									canModifyQuotes ? (
										<Button onClick={() => router.push("/quotes/new")}>
											<Plus className="h-4 w-4" />
											Create Your First Quote
										</Button>
									) : undefined
								}
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
													{(item: QuoteKanbanItem) => (
														<KanbanCard
															key={item.id}
															id={item.id}
															name={item.name}
															column={item.column}
															dragDisabled={!canModifyQuotes}
														>
															<div
																role="button"
																tabIndex={0}
																onClick={() => openPreview(item.id)}
																onKeyDown={(e) => {
																	if (e.key === "Enter" || e.key === " ") {
																		e.preventDefault();
																		openPreview(item.id);
																	}
																}}
																className="flex cursor-pointer flex-col gap-2 outline-none"
															>
																<div className="flex items-start justify-between gap-2">
																	<p className="text-foreground text-sm font-semibold">
																		{item.quoteNumber}
																	</p>
																	<StatusBadge
																		status={item.status}
																		appearance={quoteStatusAppearance(item.status)}
																		className="shrink-0"
																	>
																		{formatStatus(item.status)}
																	</StatusBadge>
																</div>
																<p className="text-muted-foreground truncate text-xs">
																	{item.name}
																</p>
																<p className="text-muted-foreground truncate text-xs">
																	{item.clientName}
																</p>
																<div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
																	<span className="text-foreground text-base font-semibold tabular-nums">
																		{formatCurrency(item.total)}
																	</span>
																	<span className="text-muted-foreground text-xs">
																		{formatQuoteDate(item.validUntil)}
																	</span>
																</div>
																<div className="flex items-center justify-end pt-1">
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			router.push(`/quotes/${item.id}`);
																		}}
																		onKeyDown={(e) => e.stopPropagation()}
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
								{searchedData.length} of {data.length} quotes
							</div>
							{viewMode === "table" ? <DataGridPagination /> : null}
						</FrameFooter>
					)}
				</DataGrid>
			</Frame>

			{/* Detail preview drawer */}
			<QuoteDetailDrawer
				quoteId={previewId}
				open={previewOpen}
				onOpenChange={setPreviewOpen}
			/>

			{/* Delete Confirmation Modal */}
			{quoteToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Delete Quote"
					itemName={quoteToDelete.name}
					itemType="Quote"
				/>
			)}
		</div>
	);
}

export default function QuotesPage() {
	return (
		<PermissionGate object="quotes">
			<QuotesPageContent />
		</PermissionGate>
	);
}
