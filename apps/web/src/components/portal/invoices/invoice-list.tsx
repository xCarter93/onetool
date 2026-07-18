"use client";

/**
 * InvoiceList — portal-facing invoice index. ReUI Frame + DataGrid treatment
 * (matches apps/web/src/app/(workspace)/invoices/page.tsx). Search + filter
 * chips + a prebuilt TanStack table. Row click navigates to the detail page;
 * the action link uses stopPropagation so it does not double-fire navigation.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Receipt, Search } from "lucide-react";

import { formatDate, formatMoney } from "@/lib/portal/format";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import {
	INVOICE_STATUS_LABEL,
	INVOICE_STATUS_ROLE,
} from "./invoice-paper";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";

// Mirror of PortalInvoiceListItemPublic in portal/invoices.ts. Kept locally
// because the backend module export only flows through Convex codegen at the
// validator level; this gives the component a typed surface without importing
// from server-only code.
export interface PortalInvoiceListItem {
	_id: string;
	invoiceNumber: string;
	status: "sent" | "paid" | "overdue";
	issuedDate: number;
	dueDate: number;
	total: number;
	clientName: string;
	paymentSummary: {
		totalPaid: number;
		totalRemaining: number;
		displayStatus: "awaiting" | "partial" | "paid" | "overdue";
		isLegacy: boolean;
		installmentCount: number;
	};
}

type Filter = "all" | "outstanding" | "paid";

const FILTERS: Array<{ value: Filter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "outstanding", label: "Outstanding" },
	{ value: "paid", label: "Paid" },
];


function createColumns(
	clientPortalId: string,
): ColumnDef<PortalInvoiceListItem>[] {
	return [
		{
			accessorKey: "invoiceNumber",
			header: "Invoice",
			cell: ({ row }) => (
				<span className="font-semibold text-primary tabular-nums">
					#{row.original.invoiceNumber}
				</span>
			),
		},
		{
			accessorKey: "issuedDate",
			header: "Issued",
			cell: ({ row }) => (
				<span className="text-foreground">
					{formatDate(row.original.issuedDate)}
				</span>
			),
		},
		{
			accessorKey: "clientName",
			header: "For",
			cell: ({ row }) => (
				<span className="font-medium text-foreground">
					{row.original.clientName}
				</span>
			),
		},
		{
			accessorKey: "dueDate",
			header: "Due",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{formatDate(row.original.dueDate)}
				</span>
			),
		},
		{
			accessorKey: "paymentSummary",
			header: "Status",
			cell: ({ row }) => {
				const displayStatus = row.original.paymentSummary.displayStatus;
				return (
					<StatusBadge role={INVOICE_STATUS_ROLE[displayStatus]} appearance="soft">
						{INVOICE_STATUS_LABEL[displayStatus]}
					</StatusBadge>
				);
			},
		},
		{
			accessorKey: "total",
			header: () => <div className="text-right">Total</div>,
			cell: ({ row }) => (
				<div className="text-right font-semibold tabular-nums">
					{formatMoney(row.original.total)}
				</div>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const inv = row.original;
				const href = `/portal/c/${clientPortalId}/invoices/${inv._id}`;
				const isLegacy = inv.paymentSummary.isLegacy;
				const showPayNow =
					!isLegacy && inv.paymentSummary.displayStatus !== "paid";
				return (
					<div
						className="flex items-center justify-end"
						onClick={(e) => e.stopPropagation()}
					>
						{showPayNow ? (
							<Link
								href={href}
								onKeyDown={(e) => e.stopPropagation()}
								className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
							>
								Pay now
							</Link>
						) : (
							<Link
								href={href}
								onKeyDown={(e) => e.stopPropagation()}
								className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
							>
								View
							</Link>
						)}
					</div>
				);
			},
		},
	];
}

export interface InvoiceListProps {
	invoices: PortalInvoiceListItem[];
	clientPortalId: string;
	businessName: string;
}

export function InvoiceList({
	invoices,
	clientPortalId,
	businessName,
}: InvoiceListProps) {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [filterStatus, setFilterStatus] = useState<Filter>("all");

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return invoices.filter((row) => {
			if (filterStatus === "outstanding") {
				if (row.paymentSummary.displayStatus === "paid") return false;
			} else if (filterStatus === "paid") {
				if (row.paymentSummary.displayStatus !== "paid") return false;
			}
			if (!q) return true;
			const haystack = [row.invoiceNumber, row.clientName]
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [invoices, search, filterStatus]);

	const isEmpty = invoices.length === 0;
	const isFilterEmpty = !isEmpty && filtered.length === 0;

	const columns = useMemo(
		() => createColumns(clientPortalId),
		[clientPortalId],
	);

	const table = useReactTable({
		data: filtered,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div>
			<header className="flex flex-col gap-1">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
					{businessName}
				</p>
				<h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">
					Invoices
				</h1>
				<p className="text-sm text-muted-foreground">
					All your invoices — paid and outstanding.
				</p>
			</header>

			<Frame className="mt-6">
				<FrameHeader className="flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<FrameTitle className="text-base">Invoices</FrameTitle>
						<FrameDescription>
							Search and filter your invoices
						</FrameDescription>
					</div>
					<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
						<div className="relative w-full sm:w-64">
							<Search
								className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								type="search"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search invoices…"
								aria-label="Search invoices"
								className="pl-9"
							/>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{FILTERS.map((f) => {
								const active = filterStatus === f.value;
								return (
									<button
										key={f.value}
										type="button"
										onClick={() => setFilterStatus(f.value)}
										aria-pressed={active}
										className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
											active
												? "border-primary bg-primary text-primary-foreground"
												: "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
										}`}
									>
										{f.label}
									</button>
								);
							})}
						</div>
					</div>
				</FrameHeader>

				<DataGrid
					table={table}
					recordCount={filtered.length}
					onRowClick={(row) =>
						router.push(`/portal/c/${clientPortalId}/invoices/${row._id}`)
					}
					emptyMessage="No invoices match your filters."
					tableLayout={{ width: "auto", headerBackground: true }}
				>
					<FramePanel className="p-0">
						{isEmpty ? (
							<EmptyState
								size="md"
								icon={<Receipt />}
								title="No invoices yet"
								description={`When ${businessName} sends you an invoice, you'll see it here.`}
							/>
						) : isFilterEmpty ? (
							<EmptyState
								size="md"
								icon={<Search />}
								title="Nothing here right now"
								description="Try a different filter, or clear the search."
							/>
						) : (
							<div className="overflow-x-auto">
								<DataGridContainer>
									<DataGridTable />
								</DataGridContainer>
							</div>
						)}
					</FramePanel>
				</DataGrid>
			</Frame>
		</div>
	);
}
