"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "next/navigation";
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { DataGrid } from "@/components/ui/data-grid";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/notification-utils";
import { RunStatusBadge } from "./run-status-badge";
import {
	RUN_STATUS_FILTER_ORDER,
	RUN_STATUS_META,
	formatDuration,
	formatTriggerSource,
	type RunRow,
	type RunStatus,
} from "../lib/run-format";

const ALL = "all";
const PAGE_SIZE = 20;

export function RunsTable() {
	const router = useRouter();
	const [statusFilter, setStatusFilter] = useState<RunStatus | typeof ALL>(ALL);

	const { results, status, loadMore } = usePaginatedQuery(
		api.automations.listRuns,
		{ status: statusFilter === ALL ? undefined : statusFilter },
		{ initialNumItems: PAGE_SIZE }
	);

	const columns = useMemo<ColumnDef<RunRow>[]>(
		() => [
			{
				id: "automation",
				header: "Automation",
				size: 260,
				cell: ({ row }) => (
					<button
						type="button"
						onClick={() =>
							router.push(
								`/automations/editor?id=${row.original.automationId}`
							)
						}
						className="flex flex-col items-start text-left cursor-pointer"
					>
						<span className="font-medium text-foreground hover:underline">
							{row.original.automationName}
						</span>
						<span className="text-muted-foreground text-xs">
							{formatTriggerSource(row.original.triggeredBy)}
						</span>
					</button>
				),
			},
			{
				id: "status",
				header: "Status",
				size: 170,
				cell: ({ row }) => (
					<div className="flex items-center gap-1.5">
						<RunStatusBadge status={row.original.status as RunStatus} />
						{row.original.dataTruncated && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge variant="warning" className="gap-1">
										<AlertTriangle className="size-3" aria-hidden />
										Truncated
									</Badge>
								</TooltipTrigger>
								<TooltipContent side="top" className="max-w-xs">
									This run scanned the 1,000 most recent records for at least
									one step; older records were not considered.
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				),
			},
			{
				id: "started",
				header: "Started",
				size: 140,
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground">
						{formatRelativeTime(row.original.triggeredAt)}
					</span>
				),
			},
			{
				id: "duration",
				header: "Duration",
				size: 160,
				cell: ({ row }) => {
					const { activeMs, wallMs } = row.original;
					const showWall =
						activeMs != null && wallMs != null && wallMs - activeMs > 1000;
					return (
						<span
							className="text-sm tabular-nums text-foreground"
							title={
								showWall
									? `Active ${formatDuration(activeMs)} · wall-clock ${formatDuration(
											wallMs
										)} (incl. delays)`
									: undefined
							}
						>
							{formatDuration(activeMs)}
							{showWall && (
								<span className="ml-1.5 text-xs text-muted-foreground">
									· {formatDuration(wallMs)} wall
								</span>
							)}
						</span>
					);
				},
			},
			{
				id: "steps",
				header: "Steps",
				size: 80,
				cell: ({ row }) => (
					<span className="text-sm tabular-nums text-muted-foreground">
						{row.original.nodesExecuted?.length ?? 0}
					</span>
				),
			},
		],
		[router]
	);

	const data = useMemo(() => (results ?? []) as RunRow[], [results]);

	const table = useReactTable({
		data,
		columns,
		manualPagination: true,
		pageCount: -1,
		getRowId: (row) => row._id,
		getCoreRowModel: getCoreRowModel(),
	});

	const isFirstLoad = status === "LoadingFirstPage";

	return (
		<DataGrid
			table={table}
			recordCount={data.length}
			isLoading={isFirstLoad}
			emptyMessage={
				statusFilter === ALL
					? "No runs yet."
					: `No ${RUN_STATUS_META[statusFilter as RunStatus].label.toLowerCase()} runs.`
			}
			tableLayout={{ dense: true, headerSticky: true }}
		>
			<Frame variant="default" className="w-full">
				<FrameHeader className="flex-row items-center justify-between gap-3">
					<div className="flex flex-col gap-px">
						<FrameTitle>Run history</FrameTitle>
						<FrameDescription className="text-xs">
							{isFirstLoad
								? "Loading…"
								: `${data.length} run${data.length === 1 ? "" : "s"} loaded`}
						</FrameDescription>
					</div>
					<Select
						value={statusFilter}
						onValueChange={(v) => setStatusFilter(v as RunStatus | typeof ALL)}
					>
						<SelectTrigger
							size="sm"
							className="w-[150px]"
							aria-label="Filter runs by status"
						>
							<SelectValue placeholder="All statuses" />
						</SelectTrigger>
						<SelectContent position="popper" align="end">
							<SelectItem value={ALL}>All statuses</SelectItem>
							{RUN_STATUS_FILTER_ORDER.map((s) => (
								<SelectItem key={s} value={s}>
									{RUN_STATUS_META[s].label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FrameHeader>

				<FramePanel className="p-0 shadow-none!">
					<ScrollArea>
						<DataGridTable />
						<ScrollBar orientation="horizontal" />
					</ScrollArea>

					{(status === "CanLoadMore" || status === "LoadingMore") && (
						<>
							<Separator />
							<FrameFooter className="items-center justify-center">
								{status === "CanLoadMore" ? (
									<Button
										intent="outline"
										size="sm"
										onPress={() => loadMore(PAGE_SIZE)}
									>
										Load more
									</Button>
								) : (
									<div className="size-5 rounded-full border-2 border-primary border-b-transparent motion-safe:animate-spin" />
								)}
							</FrameFooter>
						</>
					)}
				</FramePanel>
			</Frame>
		</DataGrid>
	);
}
