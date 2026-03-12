"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
	ColumnDef,
	ColumnFiltersState,
	SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	Receipt,
	Clock,
	ExternalLink,
	Trash2,
	CheckCircle,
	TableProperties,
	LayoutGrid,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { StyledButton, StyledBadge } from "@/components/ui/styled";
import {
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "../projects/components/kanban";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

type InvoiceWithClient = Doc<"invoices"> & {
	clientName: string;
	projectName?: string;
};

type InvoiceKanbanItem = {
	id: string;
	name: string;
	column: Doc<"invoices">["status"];
	status: Doc<"invoices">["status"];
	clientName: string;
	total: number;
	invoiceNumber: string;
	dueDate: number;
	issuedDate: number;
};

type InvoiceKanbanColumn = {
	id: Doc<"invoices">["status"];
	name: string;
	description: string;
};

const kanbanColumns: InvoiceKanbanColumn[] = [
	{
		id: "draft",
		name: "Draft",
		description: "Being prepared",
	},
	{
		id: "sent",
		name: "Sent",
		description: "Awaiting payment",
	},
	{
		id: "paid",
		name: "Paid",
		description: "Payment received",
	},
	{
		id: "overdue",
		name: "Overdue",
		description: "Past due date",
	},
	{
		id: "cancelled",
		name: "Cancelled",
		description: "Voided invoices",
	},
];

const statusVariant = (status: string, dueDate: number) => {
	// Check if overdue
	if (status === "sent" && dueDate < Date.now()) {
		return "destructive" as const;
	}

	switch (status) {
		case "paid":
			return "default" as const;
		case "sent":
			return "secondary" as const;
		case "cancelled":
			return "destructive" as const;
		case "draft":
		default:
			return "outline" as const;
	}
};

const formatStatus = (status: string, dueDate: number) => {
	// Check if overdue
	if (status === "sent" && dueDate < Date.now()) {
		return "Overdue";
	}

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

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
};

const createColumns = (
	router: ReturnType<typeof useRouter>,
	onDelete: (id: string, name: string) => void
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
			<span className="text-foreground font-medium">
				{formatCurrency(row.original.total)}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={statusVariant(row.original.status, row.original.dueDate)}>
				{formatStatus(row.original.status, row.original.dueDate)}
			</Badge>
		),
	},
	{
		accessorKey: "issuedDate",
		header: "Issued",
		cell: ({ row }) => {
			const d = new Date(row.original.issuedDate);
			return <span className="text-foreground">{d.toLocaleDateString()}</span>;
		},
	},
	{
		accessorKey: "dueDate",
		header: "Due Date",
		cell: ({ row }) => {
			const d = new Date(row.original.dueDate);
			const isOverdue = d < new Date() && row.original.status !== "paid";
			return (
				<span
					className={`text-foreground ${isOverdue ? "text-destructive font-medium" : ""}`}
				>
					{d.toLocaleDateString()}
				</span>
			);
		},
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<Button
					intent="outline"
					size="sq-sm"
					onPress={() => router.push(`/invoices/${row.original._id}`)}
					aria-label={`View invoice ${row.original.invoiceNumber}`}
				>
					<ExternalLink className="size-4" />
				</Button>
				<Button
					intent="outline"
					size="sq-sm"
					onPress={() => onDelete(row.original._id, row.original.invoiceNumber)}
					className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
					aria-label={`Delete invoice ${row.original.invoiceNumber}`}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		),
	},
];

export default function InvoicesPage() {
	const router = useRouter();
	const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [invoiceToDelete, setInvoiceToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const deleteInvoice = useMutation(api.invoices.remove);
	const updateInvoiceStatus = useMutation(api.invoices.update);
	const [kanbanData, setKanbanData] = useState<InvoiceKanbanItem[]>([]);

	// Fetch data from Convex
	const invoices = useQuery(api.invoices.list, {});
	const clients = useQuery(api.clients.list, {});
	const projects = useQuery(api.projects.list, {});

	// Memoize the arrays to avoid dependency changes on every render
	const invoicesArray = React.useMemo(() => invoices || [], [invoices]);
	const clientsArray = React.useMemo(() => clients || [], [clients]);
	const projectsArray = React.useMemo(() => projects || [], [projects]);

	// Combine invoices with client and project data
	const data = React.useMemo((): InvoiceWithClient[] => {
		return invoicesArray.map((invoice) => {
			const client = clientsArray.find((c) => c._id === invoice.clientId);
			const project = projectsArray.find((p) => p._id === invoice.projectId);

			return {
				...invoice,
				clientName: client?.companyName || "Unknown Client",
				projectName: project?.title,
			};
		});
	}, [invoicesArray, clientsArray, projectsArray]);

	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[]
	);
	const [query, setQuery] = React.useState("");
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});

	const invoiceStatusMap = React.useMemo(() => {
		const statusMap = new Map<string, Doc<"invoices">["status"]>();
		data.forEach((invoice) => {
			// Check if overdue
			const isOverdue =
				invoice.status === "sent" && invoice.dueDate < Date.now();
			const effectiveStatus = isOverdue ? "overdue" : invoice.status;
			statusMap.set(invoice._id, effectiveStatus as Doc<"invoices">["status"]);
		});
		return statusMap;
	}, [data]);

	React.useEffect(() => {
		if (!data || data.length === 0) {
			setKanbanData([]);
			return;
		}

		setKanbanData(
			data.map((invoice) => {
				// Check if overdue
				const isOverdue =
					invoice.status === "sent" && invoice.dueDate < Date.now();
				const effectiveStatus = isOverdue ? "overdue" : invoice.status;

				return {
					id: invoice._id,
					name: invoice.projectName || "No project",
					column: effectiveStatus as Doc<"invoices">["status"],
					status: effectiveStatus as Doc<"invoices">["status"],
					clientName: invoice.clientName,
					total: invoice.total,
					invoiceNumber: invoice.invoiceNumber,
					dueDate: invoice.dueDate,
					issuedDate: invoice.issuedDate,
				};
			})
		);
	}, [data]);

	const handleDelete = (id: string, name: string) => {
		setInvoiceToDelete({ id, name });
		setDeleteModalOpen(true);
	};

	const confirmDelete = async () => {
		if (invoiceToDelete) {
			try {
				await deleteInvoice({ id: invoiceToDelete.id as Id<"invoices"> });
				setDeleteModalOpen(false);
				setInvoiceToDelete(null);
			} catch (error) {
				console.error("Failed to delete invoice:", error);
			}
		}
	};

	const handleKanbanDataChange = React.useCallback(
		(nextData: InvoiceKanbanItem[]) => {
			setKanbanData(nextData);

			const changedItem = nextData.find((item) => {
				const originalStatus = invoiceStatusMap.get(item.id);
				return originalStatus && originalStatus !== item.column;
			});

			if (changedItem) {
				// Don't allow moving from overdue to sent - that's computed
				if (changedItem.column === "sent" || changedItem.column === "overdue") {
					// If trying to move from/to overdue, just update to "sent"
					updateInvoiceStatus({
						id: changedItem.id as Id<"invoices">,
						status: "sent",
					}).catch((error) => {
						console.error("Failed to update invoice status:", error);
					});
				} else {
					updateInvoiceStatus({
						id: changedItem.id as Id<"invoices">,
						status: changedItem.column,
					}).catch((error) => {
						console.error("Failed to update invoice status:", error);
					});
				}
			}
		},
		[invoiceStatusMap, updateInvoiceStatus]
	);

	const table = useReactTable({
		data,
		columns: createColumns(router, handleDelete),
		state: {
			sorting,
			columnFilters,
			globalFilter: query,
			pagination,
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setQuery,
		onPaginationChange: setPagination,
		globalFilterFn: (row, columnId, value) => {
			// If no search value, show all rows
			if (!value || value.trim() === "") return true;

			const search = value.toLowerCase().trim();
			const invoice = row.original;

			// Search in invoice number
			if (
				invoice.invoiceNumber &&
				invoice.invoiceNumber.toLowerCase().includes(search)
			)
				return true;

			// Search in client name
			if (
				invoice.clientName &&
				invoice.clientName.toLowerCase().includes(search)
			)
				return true;

			// Search in project name
			if (
				invoice.projectName &&
				invoice.projectName.toLowerCase().includes(search)
			)
				return true;

			// Search in status
			if (invoice.status && invoice.status.toLowerCase().includes(search))
				return true;

			return false;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	// Reset to first page when search changes
	React.useEffect(() => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, [query]);

	// Calculate stats
	const totalOpen = React.useMemo(
		() =>
			data.filter((inv) => inv.status === "draft" || inv.status === "sent")
				.length,
		[data]
	);

	const totalPaidValue = React.useMemo(
		() =>
			data
				.filter((inv) => inv.status === "paid")
				.reduce((sum, inv) => sum + inv.total, 0),
		[data]
	);

	// Loading state
	const isLoading =
		invoices === undefined || clients === undefined || projects === undefined;
	const isEmpty = !isLoading && data.length === 0;

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

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="flex items-center gap-2 text-base">
							<Receipt className="size-4" /> Total Invoices
						</CardTitle>
						<CardDescription>All invoices in your workspace</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{isLoading ? (
								<div className="h-9 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
							) : (
								data.length
							)}
						</div>
					</CardContent>
				</Card>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="flex items-center gap-2 text-base">
							<Clock className="size-4" /> Open Invoices
						</CardTitle>
						<CardDescription>Unpaid and draft invoices</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{isLoading ? (
								<div className="h-9 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
							) : (
								totalOpen
							)}
						</div>
					</CardContent>
				</Card>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="flex items-center gap-2 text-base">
							<CheckCircle className="size-4" /> Paid Value
						</CardTitle>
						<CardDescription>Total value of paid invoices</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{isLoading ? (
								<div className="h-9 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
							) : (
								formatCurrency(totalPaidValue)
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
				<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
				<CardHeader className="relative z-10 flex flex-col gap-2 border-b">
					<div>
						<CardTitle>Invoices</CardTitle>
						<CardDescription>
							Search, sort, and browse your invoices
						</CardDescription>
					</div>
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<Input
							placeholder="Search invoices..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full md:w-96"
						/>
						<ButtonGroup>
							<button
								onClick={() => setViewMode("table")}
								aria-pressed={viewMode === "table"}
								aria-label="Table view"
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									viewMode === "table"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								<TableProperties className="w-4 h-4" />
								<span className="hidden sm:inline">Table</span>
							</button>
							<button
								onClick={() => setViewMode("kanban")}
								aria-pressed={viewMode === "kanban"}
								aria-label="Kanban view"
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									viewMode === "kanban"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								<LayoutGrid className="w-4 h-4" />
								<span className="hidden sm:inline">Kanban</span>
							</button>
						</ButtonGroup>
					</div>
				</CardHeader>
				<CardContent className="relative z-10 px-0">
					{isEmpty ? (
						<div className="px-6 py-12 text-center">
							<div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
								<Receipt className="h-12 w-12 text-muted-foreground" />
							</div>
							<h3 className="text-lg font-semibold text-foreground mb-2">
								No invoices yet
							</h3>
							<p className="text-muted-foreground mb-6 max-w-sm mx-auto">
								Create invoices from approved quotes on the Projects page to get
								started tracking payments and revenue.
							</p>
						</div>
					) : viewMode === "kanban" ? (
						<div className="px-2 py-6 h-[calc(100vh-28rem)]">
							<KanbanProvider
								columns={kanbanColumns}
								data={kanbanData}
								onDataChange={handleKanbanDataChange}
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
											<KanbanHeader className="flex items-center justify-between border-b bg-muted/30 shrink-0">
												<div>
													<p className="font-semibold text-sm text-foreground">
														{column.name}
													</p>
													<p className="text-xs text-muted-foreground">
														{column.description}
													</p>
												</div>
												<StyledBadge variant="outline">
													{columnItems.length}
												</StyledBadge>
											</KanbanHeader>
											<KanbanCards id={column.id}>
												{(item: InvoiceKanbanItem) => (
													<KanbanCard
														key={item.id}
														id={item.id}
														name={item.name}
														column={item.column}
													>
														<div className="space-y-3">
															<div className="flex items-center justify-between gap-2">
																<p className="text-sm font-semibold text-foreground">
																	{item.invoiceNumber}
																</p>
																<StyledBadge
																	variant={statusVariant(
																		item.status,
																		item.dueDate
																	)}
																>
																	{formatStatus(item.status, item.dueDate)}
																</StyledBadge>
															</div>
															<div className="text-xs text-muted-foreground">
																{item.name}
															</div>
															<div className="flex items-center justify-between text-xs">
																<span className="text-muted-foreground">
																	Client: {item.clientName}
																</span>
															</div>
															<div className="flex flex-col gap-1 text-xs border-t border-border/50 pt-2">
																<div className="flex items-center justify-between">
																	<span className="text-muted-foreground">
																		Issued:
																	</span>
																	<span className="text-foreground">
																		{new Date(
																			item.issuedDate
																		).toLocaleDateString()}
																	</span>
																</div>
																<div className="flex items-center justify-between">
																	<span className="text-muted-foreground">
																		Due:
																	</span>
																	<span
																		className={cn(
																			"text-foreground",
																			item.dueDate < Date.now() &&
																				item.status !== "paid" &&
																				"text-red-600 font-medium"
																		)}
																	>
																		{new Date(
																			item.dueDate
																		).toLocaleDateString()}
																	</span>
																</div>
															</div>
															<div className="flex items-center justify-between text-xs border-t border-border/50 pt-2">
																<span className="font-semibold text-foreground text-base">
																	{formatCurrency(item.total)}
																</span>
															</div>
															<div className="pt-2 border-t border-border/50">
																<StyledButton
																	intent="outline"
																	size="sm"
																	icon={
																		<ExternalLink className="h-3.5 w-3.5" />
																	}
																	label="View Invoice"
																	showArrow={false}
																	onClick={(e) => {
																		e?.stopPropagation();
																		router.push(`/invoices/${item.id}`);
																	}}
																	className="w-full justify-center"
																/>
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
					) : (
						<div className="px-6">
							<div className="overflow-hidden rounded-lg border">
								<Table>
									<TableHeader className="bg-muted sticky top-0 z-10">
										{table.getHeaderGroups().map((headerGroup) => (
											<TableRow key={headerGroup.id}>
												{headerGroup.headers.map((header) => (
													<TableHead key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(
																	header.column.columnDef.header,
																	header.getContext()
																)}
													</TableHead>
												))}
											</TableRow>
										))}
									</TableHeader>
									<TableBody>
										{isLoading ? (
											Array.from({ length: 5 }).map((_, i) => (
												<TableRow key={i}>
													{Array.from({
														length: createColumns(router, handleDelete).length,
													}).map((_, j) => (
														<TableCell key={j}>
															<div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
														</TableCell>
													))}
												</TableRow>
											))
										) : table.getRowModel().rows?.length ? (
											table.getRowModel().rows.map((row) => (
												<TableRow
													key={row.id}
													data-state={row.getIsSelected() && "selected"}
												>
													{row.getVisibleCells().map((cell) => (
														<TableCell key={cell.id}>
															{flexRender(
																cell.column.columnDef.cell,
																cell.getContext()
															)}
														</TableCell>
													))}
												</TableRow>
											))
										) : (
											<TableRow>
												<TableCell
													colSpan={createColumns(router, handleDelete).length}
													className="h-24 text-center"
												>
													No invoices match your search.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</div>
							<div className="flex items-center justify-between py-4">
								<div className="text-muted-foreground text-sm">
									{table.getFilteredRowModel().rows.length} of {data.length}{" "}
									invoices
								</div>
								<div className="flex items-center gap-2">
									<Button
										intent="outline"
										size="sq-sm"
										onPress={() => table.previousPage()}
										isDisabled={!table.getCanPreviousPage()}
										aria-label="Previous page"
									>
										<ChevronLeft className="size-4" />
									</Button>
									<div className="text-sm font-medium">
										Page {table.getState().pagination?.pageIndex + 1} of{" "}
										{table.getPageCount()}
									</div>
									<Button
										intent="outline"
										size="sq-sm"
										onPress={() => table.nextPage()}
										isDisabled={!table.getCanNextPage()}
										aria-label="Next page"
									>
										<ChevronRight className="size-4" />
									</Button>
								</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

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
