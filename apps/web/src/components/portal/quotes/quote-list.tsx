"use client";

/**
 * QuoteList — portal-facing quote index. ReUI Frame + DataGrid treatment
 * (matches apps/web/src/app/(workspace)/quotes/page.tsx). Search + filter
 * chips + a prebuilt TanStack table. Row click navigates to the detail page;
 * the action link uses stopPropagation so it does not double-fire navigation.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowRight, FileText, Search } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { formatDate, formatMoney } from "@/lib/portal/format";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
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

type QuoteStatus = "sent" | "approved" | "declined" | "expired";

interface QuoteListRow {
	_id: string;
	quoteNumber?: string;
	title?: string;
	status: QuoteStatus;
	sentAt?: number;
	validUntil?: number;
	total: number;
	approvedAt?: number;
	declinedAt?: number;
}

type Filter = "all" | QuoteStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "sent", label: "Awaiting decision" },
	{ value: "approved", label: "Accepted" },
	{ value: "declined", label: "Declined" },
	{ value: "expired", label: "Expired" },
];

const STATUS_LABEL: Record<QuoteStatus, string> = {
	sent: "Awaiting decision",
	approved: "Accepted",
	declined: "Declined",
	expired: "Expired",
};

function expiryLineFor(q: QuoteListRow): string {
	if (q.status === "sent" && q.validUntil)
		return `Expires ${formatDate(q.validUntil)}`;
	if (q.status === "approved" && q.approvedAt)
		return `Approved ${formatDate(q.approvedAt)}`;
	if (q.status === "declined" && q.declinedAt)
		return `Declined ${formatDate(q.declinedAt)}`;
	if (q.status === "expired") return `Expired ${formatDate(q.validUntil)}`;
	return "";
}

function createColumns(
	clientPortalId: string,
): ColumnDef<QuoteListRow>[] {
	return [
		{
			accessorKey: "quoteNumber",
			header: "Quote",
			cell: ({ row }) => (
				<span className="font-semibold text-primary tabular-nums">
					{row.original.quoteNumber ?? "—"}
				</span>
			),
		},
		{
			accessorKey: "sentAt",
			header: "Sent",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{formatDate(row.original.sentAt)}
				</span>
			),
		},
		{
			accessorKey: "title",
			header: "For",
			cell: ({ row }) => (
				<span className="font-medium text-foreground">
					{row.original.title ?? "Quote"}
				</span>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => {
				const q = row.original;
				const expiryLine = expiryLineFor(q);
				return (
					<div>
						<StatusBadge status={q.status} appearance="soft">
							{STATUS_LABEL[q.status]}
						</StatusBadge>
						{expiryLine && (
							<div className="mt-1 text-[11px] text-muted-foreground">
								{expiryLine}
							</div>
						)}
					</div>
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
				const q = row.original;
				const href = `/portal/c/${clientPortalId}/quotes/${q._id}`;
				const isPending = q.status === "sent";
				return (
					<div
						className="flex items-center justify-end"
						onClick={(e) => e.stopPropagation()}
					>
						<Link
							href={href}
							onKeyDown={(e) => e.stopPropagation()}
							className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
								isPending
									? "bg-primary text-primary-foreground hover:bg-primary/90"
									: "text-muted-foreground hover:bg-muted hover:text-foreground"
							}`}
						>
							{isPending ? "Review" : "View"}
							{isPending && (
								<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
							)}
						</Link>
					</div>
				);
			},
		},
	];
}

export interface QuoteListProps {
	businessName: string;
}

export function QuoteList({ businessName }: QuoteListProps) {
	const params = useParams<{ clientPortalId: string }>();
	const router = useRouter();
	const clientPortalId = params?.clientPortalId ?? "";

	const quotes = useQuery(api.portal.quotes.list, {}) as
		| QuoteListRow[]
		| undefined;

	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<Filter>("all");

	const filtered = useMemo(() => {
		if (!quotes) return [];
		const q = search.trim().toLowerCase();
		return quotes.filter((row) => {
			if (filter !== "all" && row.status !== filter) return false;
			if (!q) return true;
			const haystack = [row.title ?? "", row.quoteNumber ?? ""]
				.join(" ")
				.toLowerCase();
			return haystack.includes(q);
		});
	}, [quotes, search, filter]);

	const isLoading = quotes === undefined;
	const isEmpty = !isLoading && (quotes?.length ?? 0) === 0;
	const isFilterEmpty = !isLoading && !isEmpty && filtered.length === 0;

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
					Quotes
				</h1>
				<p className="text-sm text-muted-foreground">
					Estimates from {businessName} — review, accept, or decline.
				</p>
			</header>

			<Frame className="mt-6">
				<FrameHeader className="flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<FrameTitle className="text-base">Quotes</FrameTitle>
						<FrameDescription>
							Search and filter your quotes
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
								placeholder="Search quotes…"
								aria-label="Search quotes"
								className="pl-9"
							/>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{FILTERS.map((f) => {
								const active = filter === f.value;
								return (
									<button
										key={f.value}
										type="button"
										onClick={() => setFilter(f.value)}
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
					isLoading={isLoading}
					onRowClick={(row) =>
						router.push(`/portal/c/${clientPortalId}/quotes/${row._id}`)
					}
					emptyMessage="No quotes match your filters."
					tableLayout={{ width: "auto", headerBackground: true }}
				>
					<FramePanel className="p-0">
						{isEmpty ? (
							<EmptyState
								size="md"
								icon={<FileText />}
								title="No quotes yet"
								description={`When ${businessName} sends you a quote, it will show up here.`}
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
