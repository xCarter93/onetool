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
import { Badge } from "@/components/reui/badge";
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
import { DataGrid } from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/notification-utils";
import { RunStatusBadge } from "./run-status-badge";
import {
	RUN_STATUS_FILTER_ORDER,
	RUN_STATUS_META,
	formatDuration,
	formatTriggerSource,
	summarizeLoopFailures,
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
				cell: ({ row }) => {
					const status = row.original.status as RunStatus;
					const loopFailed =
						status === "completed_with_errors"
							? summarizeLoopFailures(row.original.loopSummary).failed
							: 0;
					// A skip records WHY in `error`, but the badge alone reads like an
					// engine fault — surface the stored reason on hover.
					const skipReason =
						status === "skipped" ? row.original.error : undefined;
					return (
						<div className="flex flex-wrap items-center gap-1.5">
							{skipReason ? (
								<Tooltip>
									<TooltipTrigger render={<span tabIndex={0} />}>
										<RunStatusBadge status={status} />
									</TooltipTrigger>
									<TooltipContent side="top" className="max-w-xs">
										{skipReason}
									</TooltipContent>
								</Tooltip>
							) : (
								<RunStatusBadge status={status} />
							)}
							{row.original.dataTruncated && (
								<Tooltip>
									<TooltipTrigger render={<Badge variant="warning" className="gap-1" />}>
										<AlertTriangle className="size-3" aria-hidden />
										Truncated
									</TooltipTrigger>
									<TooltipContent side="top" className="max-w-xs">
										At least one step stopped scanning at the 5,000 most recent
										records; older records were not considered.
									</TooltipContent>
								</Tooltip>
							)}
							{loopFailed > 0 && (
								<Tooltip>
									<TooltipTrigger render={<Badge variant="warning" className="gap-1" />}>
										<AlertTriangle className="size-3" aria-hidden />
										{loopFailed} failed
									</TooltipTrigger>
									<TooltipContent side="top" className="max-w-xs">
										{loopFailed} item{loopFailed === 1 ? "" : "s"} failed during this
										run — open the automation to see which.
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					);
				},
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
						<SelectContent alignItemWithTrigger={false} align="end">
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
										variant="outline"
										size="sm"
										onClick={() => loadMore(PAGE_SIZE)}
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
