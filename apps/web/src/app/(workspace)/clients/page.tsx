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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
	Users,
	ExternalLink,
	Plus,
	Trash2,
	RotateCcw,
	Archive,
	Upload,
	TableProperties,
	LayoutGrid,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "convex/react";
import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledBadge } from "@/components/ui/styled";

import {
	useCanPerformAction,
	useFeatureAccess,
} from "@/hooks/use-feature-access";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "../projects/components/kanban";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

type Client = {
	id: string;
	name: string;
	location: string;
	activeProjects: number;
	lastActivity: string; // ISO date or friendly string
	status: "Active" | "Prospect" | "Paused" | "Archived";
	primaryContact: {
		name: string;
		email: string;
		jobTitle: string;
	} | null;
};

type ClientKanbanItem = {
	id: string;
	name: string;
	column: "lead" | "active" | "inactive";
	status: "lead" | "active" | "inactive";
	activeProjects: number;
	primaryContact: {
		name: string;
		email: string;
	} | null;
};

type ClientKanbanColumn = {
	id: "lead" | "active" | "inactive";
	name: string;
	description: string;
};

const kanbanColumns: ClientKanbanColumn[] = [
	{
		id: "lead",
		name: "Leads",
		description: "Potential new clients",
	},
	{
		id: "active",
		name: "Active",
		description: "Current clients",
	},
	{
		id: "inactive",
		name: "Inactive",
		description: "Paused or dormant",
	},
];

const statusToBadgeVariant = (status: Client["status"]) => {
	switch (status) {
		case "Active":
			return "default" as const;
		case "Prospect":
			return "secondary" as const;
		case "Paused":
			return "outline" as const;
		case "Archived":
			return "outline" as const;
		default:
			return "outline" as const;
	}
};

const kanbanStatusToBadgeVariant = (
	status: "lead" | "active" | "inactive"
) => {
	switch (status) {
		case "active":
			return "default" as const;
		case "lead":
			return "secondary" as const;
		case "inactive":
			return "outline" as const;
		default:
			return "outline" as const;
	}
};

const formatKanbanStatus = (
	status: "lead" | "active" | "inactive"
) => {
	switch (status) {
		case "lead":
			return "Lead";
		case "active":
			return "Active";
		case "inactive":
			return "Inactive";
		default:
			return status;
	}
};

const createColumns = (
	router: ReturnType<typeof useRouter>,
	toast: ReturnType<typeof useToast>,
	onDelete: (id: string, name: string) => void,
	onRestore?: (id: string, name: string) => void,
	isArchivedTab?: boolean
): ColumnDef<Client>[] => [
	{
		accessorKey: "name",
		header: () => <div className="flex items-center gap-1">Name</div>,
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium text-foreground">{row.original.name}</span>
				<span className="text-muted-foreground text-xs">
					{row.original.location}
				</span>
			</div>
		),
	},
	{
		accessorKey: "primaryContact",
		header: "Primary Contact",
		cell: ({ row }) => (
			<div className="flex flex-col">
				{row.original.primaryContact ? (
					<>
						<span className="font-medium text-foreground">
							{row.original.primaryContact.name}
						</span>
						<span className="text-muted-foreground text-xs">
							{row.original.primaryContact.email}
						</span>
					</>
				) : (
					<span className="text-muted-foreground text-sm">No contact</span>
				)}
			</div>
		),
	},
	{
		accessorKey: "activeProjects",
		header: "Active Projects",
		cell: ({ row }) => (
			<span className="text-foreground">{row.original.activeProjects}</span>
		),
	},
	{
		accessorKey: "lastActivity",
		header: "Last Activity",
		cell: ({ row }) => {
			const date = new Date(row.original.lastActivity);
			return (
				<span className="text-foreground">
					{isNaN(date.getTime())
						? row.original.lastActivity
						: date.toLocaleDateString()}
				</span>
			);
		},
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge variant={statusToBadgeVariant(row.original.status)}>
				{row.original.status}
			</Badge>
		),
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<Button
					intent="outline"
					size="sq-sm"
					onPress={() => {
						router.push(`/clients/${row.original.id}`);
					}}
					aria-label={`View client ${row.original.name}`}
				>
					<ExternalLink className="size-4" />
				</Button>

				{isArchivedTab && onRestore ? (
					<Button
						intent="outline"
						size="sq-sm"
						onPress={() => onRestore(row.original.id, row.original.name)}
						className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
						aria-label={`Restore client ${row.original.name}`}
					>
						<RotateCcw className="size-4" />
					</Button>
				) : (
					<Button
						intent="outline"
						size="sq-sm"
						onPress={() => onDelete(row.original.id, row.original.name)}
						className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
						aria-label={`Archive client ${row.original.name}`}
					>
						<Trash2 className="size-4" />
					</Button>
				)}
			</div>
		),
	},
];

export default function ClientsPage() {
	const router = useRouter();
	const toast = useToast();
	const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);

	const [clientToDelete, setClientToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [activeTab, setActiveTab] = useState("active");
	const [kanbanData, setKanbanData] = useState<ClientKanbanItem[]>([]);

	// Check if user can create new clients
	const { canPerform, reason, currentUsage, limit } =
		useCanPerformAction("create_client");

	// Check if user has premium access for import feature
	const { hasPremiumAccess } = useFeatureAccess();

	const handleAddClient = () => {
		if (!canPerform) {
			toast.error(
				"Upgrade Required",
				reason || "You've reached your client limit"
			);
			return;
		}
		router.push("/clients/new");
	};

	const archiveClient = useMutation(api.clients.archive);
	const restoreClient = useMutation(api.clients.restore);
	const updateClient = useMutation(api.clients.update);

	// Fetch clients with project counts from Convex
	const convexClients = useQuery(api.clients.listWithProjectCounts, {});
	const archivedClients = useQuery(api.clients.listWithProjectCounts, {
		status: "archived" as const,
		includeArchived: true,
	});
	const clientsStats = useQuery(api.clients.getStats, {});

	// Transform the data to match our Client type
	const activeData = React.useMemo(() => {
		if (!convexClients) return [];
		return convexClients;
	}, [convexClients]);

	const archivedData = React.useMemo(() => {
		if (!archivedClients) return [];
		return archivedClients;
	}, [archivedClients]);

	const isActiveEmpty = activeData.length === 0;
	const isArchivedEmpty = archivedData.length === 0;
	const currentData = activeTab === "active" ? activeData : archivedData;
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[]
	);
	const [globalQuery, setGlobalQuery] = React.useState("");
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});

	// Create kanban data from active clients
	const clientStatusMap = React.useMemo(() => {
		const statusMap = new Map<
			string,
			"lead" | "active" | "inactive"
		>();
		// Map client statuses to kanban columns
		activeData.forEach((client) => {
			let kanbanStatus: "lead" | "active" | "inactive";
			if (client.status === "Active") {
				kanbanStatus = "active";
			} else if (client.status === "Prospect") {
				kanbanStatus = "lead"; // Map deprecated Prospect to Lead
			} else {
				kanbanStatus = "inactive";
			}
			statusMap.set(client.id, kanbanStatus);
		});
		return statusMap;
	}, [activeData]);

	React.useEffect(() => {
		if (!activeData || activeData.length === 0) {
			setKanbanData([]);
			return;
		}

		setKanbanData(
			activeData
				.filter((client) => client.status !== "Archived") // Only show non-archived in kanban
				.map((client) => {
					let kanbanStatus: "lead" | "active" | "inactive";
					if (client.status === "Active") {
						kanbanStatus = "active";
					} else if (client.status === "Prospect") {
						kanbanStatus = "lead"; // Map deprecated Prospect to Lead
					} else {
						kanbanStatus = "inactive";
					}

				return {
					id: client.id,
					name: client.name,
					column: kanbanStatus,
					status: kanbanStatus,
					activeProjects: client.activeProjects,
					primaryContact: client.primaryContact
						? {
								name: client.primaryContact.name,
								email: client.primaryContact.email,
						  }
						: null,
				};
				})
		);
	}, [activeData]);

	const handleDelete = (id: string, name: string) => {
		setClientToDelete({ id, name });
		setDeleteModalOpen(true);
	};

	const handleRestore = async (id: string, name: string) => {
		try {
			await restoreClient({ id: id as Id<"clients"> });
			toast.success(
				"Client Restored",
				`${name} has been restored and is now active.`
			);
		} catch (error) {
			console.error("Failed to restore client:", error);
			toast.error(
				"Restore Failed",
				"Failed to restore the client. Please try again."
			);
		}
	};

	const confirmDelete = async () => {
		if (clientToDelete) {
			try {
				await archiveClient({ id: clientToDelete.id as Id<"clients"> });
				setDeleteModalOpen(false);
				setClientToDelete(null);
				toast.success(
					"Client Archived",
					`${clientToDelete.name} has been archived. It will be permanently deleted in 7 days.`
				);
			} catch (error) {
				console.error("Failed to archive client:", error);
				toast.error(
					"Archive Failed",
					"Failed to archive the client. Please try again."
				);
			}
		}
	};

	const handleKanbanDataChange = React.useCallback(
		(nextData: ClientKanbanItem[]) => {
			setKanbanData(nextData);

			const changedItem = nextData.find((item) => {
				const originalStatus = clientStatusMap.get(item.id);
				return originalStatus && originalStatus !== item.column;
			});

			if (changedItem) {
				// Map kanban status back to client status
				let clientStatus:
					| "lead"
					| "active"
					| "inactive"
					| "archived";
				if (changedItem.column === "active") {
					clientStatus = "active";
				} else if (changedItem.column === "lead") {
					clientStatus = "lead";
				} else {
					clientStatus = "inactive";
				}

				updateClient({
					id: changedItem.id as Id<"clients">,
					status: clientStatus,
				}).catch((error) => {
					console.error("Failed to update client status:", error);
					toast.error(
						"Update Failed",
						"Failed to update client status. Please try again."
					);
				});
			}
		},
		[clientStatusMap, updateClient, toast]
	);

	const isArchivedTab = activeTab === "archived";
	const columns = createColumns(
		router,
		toast,
		handleDelete,
		handleRestore,
		isArchivedTab
	);

	const table = useReactTable({
		data: currentData,
		columns,
		state: {
			sorting,
			columnFilters,
			globalFilter: globalQuery,
			pagination,
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalQuery,
		onPaginationChange: setPagination,
		globalFilterFn: (row, columnId, value) => {
			// If no search value, show all rows
			if (!value || value.trim() === "") return true;

			const search = value.toLowerCase().trim();
			const client = row.original;

			// Search in client name
			if (client.name && client.name.toLowerCase().includes(search))
				return true;

			// Search in primary contact name and email
			if (client.primaryContact) {
				if (
					client.primaryContact.name &&
					client.primaryContact.name.toLowerCase().includes(search)
				)
					return true;
				if (
					client.primaryContact.email &&
					client.primaryContact.email.toLowerCase().includes(search)
				)
					return true;
			}

			return false;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	// Reset to first page when switching tabs or when search changes
	React.useEffect(() => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, [activeTab, globalQuery]);

	// Loading state
	if (
		convexClients === undefined ||
		archivedClients === undefined ||
		clientsStats === undefined
	) {
		return (
			<div className="relative px-6 pt-8 pb-6 space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
						<div>
							<h1 className="text-2xl font-bold text-foreground">Clients</h1>
							<p className="text-muted-foreground text-sm">
								Loading clients...
							</p>
						</div>
					</div>
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					{[1, 2, 3].map((i) => (
						<Card key={i}>
							<CardHeader>
								<div className="h-4 bg-muted rounded animate-pulse" />
							</CardHeader>
							<CardContent>
								<div className="h-8 bg-muted rounded animate-pulse" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="relative px-6 pt-8 pb-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Clients</h1>
						<p className="text-muted-foreground text-sm">
							Overview of your clients
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-block">
								<StyledButton
									intent="outline"
									size="md"
									onClick={() => router.push("/clients/import")}
									disabled={!hasPremiumAccess}
								>
									<Upload className="h-4 w-4" />
									Import Clients
								</StyledButton>
							</span>
						</TooltipTrigger>
						{!hasPremiumAccess && (
							<TooltipContent>
								<div className="space-y-1">
									<p className="font-semibold">Premium Feature</p>
									<p>Upgrade to access client import functionality</p>
								</div>
							</TooltipContent>
						)}
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-block">
								<StyledButton
									intent="primary"
									size="md"
									onClick={handleAddClient}
									disabled={!canPerform}
									icon={<Plus className="h-4 w-4" />}
								>
									Add Client
									{!canPerform &&
										limit &&
										limit !== "unlimited" &&
										currentUsage !== undefined && (
											<Badge variant="secondary" className="ml-1 text-xs">
												{currentUsage}/{limit}
											</Badge>
										)}
								</StyledButton>
							</span>
						</TooltipTrigger>
						{!canPerform && (
							<TooltipContent>
								<div className="space-y-1">
									<p className="font-semibold">Upgrade Required</p>
									<p>{reason || "You've reached your client limit"}</p>
									{limit &&
										limit !== "unlimited" &&
										currentUsage !== undefined && (
											<p className="text-muted-foreground">
												{currentUsage}/{limit} clients
											</p>
										)}
								</div>
							</TooltipContent>
						)}
					</Tooltip>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="flex items-center gap-2 text-base">
							<Users className="size-4" /> Prospective Clients
						</CardTitle>
						<CardDescription>
							Clients currently marked as prospects
						</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{clientsStats?.groupedByStatus?.prospective ?? 0}
						</div>
					</CardContent>
				</Card>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="text-base">Active Clients</CardTitle>
						<CardDescription>Clients engaged in work right now</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{clientsStats?.groupedByStatus?.active ?? 0}
						</div>
					</CardContent>
				</Card>
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="text-base">Inactive Clients</CardTitle>
						<CardDescription>
							Clients marked inactive or archived
						</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<div className="text-3xl font-semibold">
							{clientsStats?.groupedByStatus?.inactive ?? 0}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
				<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
				<CardHeader className="relative z-10 flex flex-col gap-2 border-b">
					<div>
						<CardTitle>Clients</CardTitle>
						<CardDescription>
							Search, sort, and browse your client list
						</CardDescription>
					</div>
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<Input
							placeholder="Search clients or contacts..."
							value={globalQuery}
							onChange={(e) => setGlobalQuery(e.target.value)}
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
					{viewMode === "kanban" ? (
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
												{(item: ClientKanbanItem) => (
													<KanbanCard
														key={item.id}
														id={item.id}
														name={item.name}
														column={item.column}
													>
														<div className="space-y-3">
															<div className="flex items-center justify-between gap-2">
																<p className="text-sm font-semibold text-foreground">
																	{item.name}
																</p>
																<StyledBadge
																	variant={kanbanStatusToBadgeVariant(
																		item.status
																	)}
															>
																{formatKanbanStatus(item.status)}
															</StyledBadge>
														</div>
														<div className="flex items-center justify-between text-xs">
																<span className="text-muted-foreground">
																	{item.activeProjects === 0
																		? "No active projects"
																		: `${item.activeProjects} active ${
																				item.activeProjects === 1
																					? "project"
																					: "projects"
																		  }`}
																</span>
															</div>
															{item.primaryContact && (
																<div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
																	<p className="font-medium text-foreground">
																		{item.primaryContact.name}
																	</p>
																	<p>{item.primaryContact.email}</p>
																</div>
															)}
															<div className="pt-2 border-t border-border/50">
																<StyledButton
																	intent="outline"
																	size="sm"
																	icon={
																		<ExternalLink className="h-3.5 w-3.5" />
																	}
																	label="View Client"
																	showArrow={false}
																	onClick={(e) => {
																		e?.stopPropagation();
																		router.push(`/clients/${item.id}`);
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
						<Tabs
							value={activeTab}
							onValueChange={setActiveTab}
							className="w-full"
						>
							<div className="px-6 pt-4">
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="active">Active Clients</TabsTrigger>
									<TabsTrigger value="archived">Archived Clients</TabsTrigger>
								</TabsList>
							</div>
							<TabsContent value="active" className="mt-0">
								{isActiveEmpty ? (
									<div className="px-6 py-12 text-center">
										<div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
											<Users className="h-12 w-12 text-muted-foreground" />
										</div>
										<h3 className="mb-2 text-lg font-semibold text-foreground">
											No clients yet
										</h3>
										<p className="mx-auto mb-6 max-w-sm text-muted-foreground">
											Create your first client to start organizing relationships
											and tracking activity.
										</p>
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-block">
													<StyledButton
														intent="primary"
														size="md"
														onClick={handleAddClient}
														disabled={!canPerform}
														icon={<Plus className="h-4 w-4" />}
													>
														Add Your First Client
													</StyledButton>
												</span>
											</TooltipTrigger>
											{!canPerform && (
												<TooltipContent>
													<div className="space-y-1">
														<p className="font-semibold">Upgrade Required</p>
														<p>
															{reason || "You've reached your client limit"}
														</p>
														{limit &&
															limit !== "unlimited" &&
															currentUsage !== undefined && (
																<p className="text-muted-foreground">
																	{currentUsage}/{limit} clients
																</p>
															)}
													</div>
												</TooltipContent>
											)}
										</Tooltip>
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
													{table.getRowModel().rows?.length ? (
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
																colSpan={columns.length}
																className="h-24 text-center"
															>
																No clients match your search.
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</div>
										<div className="flex items-center justify-between py-4">
											<div className="text-sm text-muted-foreground">
												{table.getFilteredRowModel().rows.length} of{" "}
												{activeData.length} active clients
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
							</TabsContent>
							<TabsContent value="archived" className="mt-0">
								{isArchivedEmpty ? (
									<div className="px-6 py-12 text-center">
										<div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
											<Archive className="h-12 w-12 text-muted-foreground" />
										</div>
										<h3 className="mb-2 text-lg font-semibold text-foreground">
											No archived clients
										</h3>
										<p className="mx-auto max-w-sm text-muted-foreground">
											Clients you archive will appear here for seven days before
											being permanently deleted.
										</p>
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
													{table.getRowModel().rows?.length ? (
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
																colSpan={columns.length}
																className="h-24 text-center"
															>
																No archived clients match your search.
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</div>
										<div className="flex items-center justify-between py-4">
											<div className="text-sm text-muted-foreground">
												{table.getFilteredRowModel().rows.length} of{" "}
												{archivedData.length} archived clients
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
							</TabsContent>
						</Tabs>
					)}
				</CardContent>
			</Card>

			{/* Archive Confirmation Modal */}
			{clientToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Archive Client"
					itemName={clientToDelete.name}
					itemType="Client"
					isArchive={true}
				/>
			)}

		</div>
	);
}
