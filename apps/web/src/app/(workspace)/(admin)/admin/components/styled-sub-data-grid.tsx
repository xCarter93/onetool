"use client";

import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
	ColumnDef,
	ExpandedState,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	PaginationState,
	SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { SquareMinus, SquarePlus, Crown, Building2, Search } from "lucide-react";

interface UserData {
	id: string;
	firstName: string | null;
	lastName: string | null;
	emailAddresses: Array<{ emailAddress: string }>;
	imageUrl: string;
	lastSignInAt: number | null;
	createdAt: number;
	publicMetadata: Record<string, unknown>;
}

interface OrgWithUsers {
	org: {
		id: string;
		name: string;
		slug: string | null;
		createdAt: number;
		publicMetadata: Record<string, unknown>;
	};
	hasPremium: boolean;
	users: Array<{
		user: UserData;
		role: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	}>;
}

interface StyledSubDataGridProps {
	orgsWithUsers: OrgWithUsers[];
	onUserClick: (userData: {
		user: UserData;
		role: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	}) => void;
	onOrgClick: (orgData: OrgWithUsers) => void;
}

// Sub-table component for organization users
function OrgUsersSubTable({
	users,
	onUserClick,
}: {
	users: OrgWithUsers["users"];
	onUserClick: (userData: OrgWithUsers["users"][0]) => void;
}) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const columns = useMemo<ColumnDef<OrgWithUsers["users"][0]>[]>(
		() => [
			{
				accessorKey: "user",
				header: ({ column }) => (
					<DataGridColumnHeader title="User" column={column} />
				),
				cell: ({ row }) => {
					const userData = row.original;
					return (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onUserClick(userData);
							}}
							className="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Avatar className="size-8">
								<AvatarImage
									src={userData.user.imageUrl}
									alt={`${userData.user.firstName ?? ""} ${userData.user.lastName ?? ""}`}
								/>
								<AvatarFallback>
									{userData.user.firstName?.charAt(0) ?? "?"}
									{userData.user.lastName?.charAt(0) ?? ""}
								</AvatarFallback>
							</Avatar>
							<div className="space-y-px text-left">
								<div className="font-medium text-foreground">
									{userData.user.firstName} {userData.user.lastName}
								</div>
								<div className="text-sm text-muted-foreground">
									{userData.user.emailAddresses[0]?.emailAddress}
								</div>
							</div>
						</button>
					);
				},
				enableSorting: true,
				size: 250,
			},
			{
				accessorKey: "role",
				header: ({ column }) => (
					<DataGridColumnHeader title="Role" column={column} />
				),
				cell: ({ row }) => {
					return (
						<Badge variant="outline" className="text-xs capitalize">
							{row.original.role}
						</Badge>
					);
				},
				enableSorting: true,
				size: 100,
			},
			{
				id: "premium",
				header: ({ column }) => (
					<DataGridColumnHeader title="Premium" column={column} />
				),
				cell: ({ row }) => {
					const userData = row.original;
					const isPremium =
						userData.hasDirectPremium || userData.hasOrgPremium;
					if (!isPremium) return <span className="text-muted-foreground">-</span>;
					return (
						<Badge variant="success" className="gap-1">
							<Crown className="h-3 w-3" />
							{userData.hasOrgPremium && !userData.hasDirectPremium
								? "Via Org"
								: "Direct"}
						</Badge>
					);
				},
				enableSorting: false,
				size: 120,
			},
			{
				accessorKey: "user.lastSignInAt",
				header: ({ column }) => (
					<DataGridColumnHeader title="Last Sign In" column={column} />
				),
				cell: ({ row }) => {
					const lastSignIn = row.original.user.lastSignInAt;
					if (!lastSignIn) return <span className="text-muted-foreground">Never</span>;
					return new Date(lastSignIn).toLocaleDateString();
				},
				enableSorting: true,
				size: 120,
			},
		],
		[onUserClick]
	);

	const table = useReactTable({
		data: users,
		columns,
		pageCount: Math.ceil(users.length / pagination.pageSize),
		state: {
			sorting,
			pagination,
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getRowId: (row) => row.user.id,
	});

	return (
		<div className="bg-muted/30 p-4">
			<DataGrid
				table={table}
				recordCount={users.length}
				tableLayout={{
					cellBorder: true,
					rowBorder: true,
					headerBackground: true,
					headerBorder: true,
				}}
			>
				<div className="w-full space-y-2.5">
					<div className="bg-card rounded-lg border border-muted-foreground/20">
						<DataGridContainer>
							<ScrollArea>
								<DataGridTable />
								<ScrollBar orientation="horizontal" />
							</ScrollArea>
						</DataGridContainer>
					</div>
					{users.length > 10 && <DataGridPagination className="pb-1.5" />}
				</div>
			</DataGrid>
		</div>
	);
}

export function StyledSubDataGrid({
	orgsWithUsers,
	onUserClick,
	onOrgClick,
}: StyledSubDataGridProps) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 25,
	});
	const [sorting, setSorting] = useState<SortingState>([]);
	const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
	const [globalFilter, setGlobalFilter] = useState("");

	const columns = useMemo<ColumnDef<OrgWithUsers>[]>(
		() => [
			{
				id: "expand",
				header: () => null,
				cell: ({ row }) => {
					return row.getCanExpand() ? (
						<Button
							onClick={row.getToggleExpandedHandler()}
							size="sq-sm"
							intent="plain"
						>
							{row.getIsExpanded() ? <SquareMinus /> : <SquarePlus />}
						</Button>
					) : null;
				},
				size: 50,
				enableResizing: false,
				meta: {
					expandedContent: (row: OrgWithUsers) => (
						<OrgUsersSubTable users={row.users} onUserClick={onUserClick} />
					),
				},
			},
			{
				accessorKey: "org.name",
				id: "organization",
				header: ({ column }) => (
					<DataGridColumnHeader
						title="Organization"
						visibility={true}
						column={column}
					/>
				),
				cell: ({ row }) => {
					return (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onOrgClick(row.original);
							}}
							className="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Building2 className="h-5 w-5 text-primary" />
							</div>
							<div className="space-y-px text-left">
								<div className="font-medium text-foreground flex items-center gap-2">
									{row.original.org.name}
									{row.original.hasPremium && (
										<Badge variant="success" className="gap-1">
											<Crown className="h-3 w-3" />
											Premium
										</Badge>
									)}
								</div>
								{row.original.org.slug && (
									<div className="text-sm text-muted-foreground">
										{row.original.org.slug}
									</div>
								)}
							</div>
						</button>
					);
				},
				enableSorting: true,
				enableHiding: true,
				enableResizing: true,
				size: 300,
				filterFn: "includesString",
			},
			{
				id: "members",
				header: ({ column }) => (
					<DataGridColumnHeader
						title="Members"
						visibility={true}
						column={column}
					/>
				),
				cell: ({ row }) => {
					const count = row.original.users.length;
					return (
						<div
							className="text-sm font-medium text-foreground hover:text-primary cursor-pointer"
							onClick={() => row.getToggleExpandedHandler()()}
						>
							{count} {count === 1 ? "member" : "members"}
						</div>
					);
				},
				enableSorting: true,
				enableHiding: true,
				enableResizing: true,
				size: 120,
				sortingFn: (rowA, rowB) => {
					return rowA.original.users.length - rowB.original.users.length;
				},
			},
			{
				accessorKey: "org.createdAt",
				id: "createdAt",
				header: ({ column }) => (
					<DataGridColumnHeader
						title="Created"
						visibility={true}
						column={column}
					/>
				),
				cell: ({ row }) => {
					return new Date(row.original.org.createdAt).toLocaleDateString();
				},
				enableSorting: true,
				enableHiding: true,
				enableResizing: true,
				size: 120,
			},
		],
		[onOrgClick, onUserClick]
	);

	const table = useReactTable({
		columns,
		data: orgsWithUsers,
		pageCount: Math.ceil((orgsWithUsers?.length || 0) / pagination.pageSize),
		getRowId: (row) => row.org.id,
		getRowCanExpand: (row) =>
			Boolean(row.original.users && row.original.users.length > 0),
		state: {
			pagination,
			sorting,
			expanded: expandedRows,
			globalFilter,
		},
		columnResizeMode: "onChange",
		onPaginationChange: setPagination,
		onSortingChange: setSorting,
		onExpandedChange: setExpandedRows,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		globalFilterFn: (row, _columnId, filterValue) => {
			const searchTerm = filterValue.toLowerCase();
			const orgName = row.original.org.name.toLowerCase();
			const orgSlug = row.original.org.slug?.toLowerCase() || "";

			// Search in org name and slug
			if (orgName.includes(searchTerm) || orgSlug.includes(searchTerm)) {
				return true;
			}

			// Search in user names and emails
			return row.original.users.some((userData) => {
				const fullName = `${userData.user.firstName || ""} ${userData.user.lastName || ""}`.toLowerCase();
				const email = userData.user.emailAddresses[0]?.emailAddress.toLowerCase() || "";
				return fullName.includes(searchTerm) || email.includes(searchTerm);
			});
		},
	});

	return (
		<div className="space-y-4">
			{/* Search Bar */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Search organizations, members, or emails..."
					value={globalFilter}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="pl-9"
				/>
			</div>

			{/* Data Grid */}
			<DataGrid
				table={table}
				recordCount={orgsWithUsers?.length || 0}
				tableLayout={{
					columnsResizable: true,
					columnsVisibility: true,
				}}
			>
				<div className="w-full space-y-2.5">
					<div className="bg-card rounded-lg border">
						<DataGridContainer>
							<ScrollArea>
								<DataGridTable />
								<ScrollBar orientation="horizontal" />
							</ScrollArea>
						</DataGridContainer>
					</div>
					<DataGridPagination />
				</div>
			</DataGrid>
		</div>
	);
}
