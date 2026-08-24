"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import type { Ticket } from "posthog-js";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import type { SupportIntent } from "@/lib/support";
import { cn } from "@/lib/utils";
import {
	INTENT_META,
	intentMeta,
	isUnread,
	ticketStatusBadge,
} from "../lib/support-utils";

interface TicketListProps {
	loading: boolean;
	tickets: Ticket[];
	/** Best-effort ticket id → intent (localStorage + opened threads). */
	intents: Record<string, SupportIntent>;
	hiddenResolvedCount: number;
	showResolved: boolean;
	onShowResolvedChange: (show: boolean) => void;
	selectedTicketId: string | null;
	onSelect: (ticketId: string) => void;
	onNewRequest: (intent: SupportIntent) => void;
	onRefresh: () => void;
	refreshing: boolean;
}

export function TicketList({
	loading,
	tickets,
	intents,
	hiddenResolvedCount,
	showResolved,
	onShowResolvedChange,
	selectedTicketId,
	onSelect,
	onNewRequest,
	onRefresh,
	refreshing,
}: TicketListProps) {
	return (
		<>
			<div className="sticky top-0 z-10 shrink-0 space-y-3 border-b border-border bg-card px-4 pb-3 pt-4">
				<div className="flex items-center justify-between gap-2">
					<h1 className="text-lg font-semibold tracking-tight">Support</h1>
					<div className="flex items-center gap-1.5">
						<Button
							size="sm"
							variant="ghost"
							onClick={onRefresh}
							disabled={refreshing}
							aria-label="Refresh requests"
						>
							<RefreshCw
								className={cn("size-4", refreshing && "animate-spin")}
								aria-hidden="true"
							/>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button size="sm" variant="outline">
										<Plus className="size-4" aria-hidden="true" />
										New request
										<ChevronDown
											className="size-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								{(
									Object.entries(INTENT_META) as Array<
										[SupportIntent, (typeof INTENT_META)[SupportIntent]]
									>
								).map(([intent, meta]) => (
									<DropdownMenuItem
										key={intent}
										onClick={() => onNewRequest(intent)}
									>
										<meta.icon className="size-4" aria-hidden="true" />
										{meta.actionLabel}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				<label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
					<Switch
						checked={showResolved}
						onCheckedChange={onShowResolvedChange}
						aria-label="Show resolved requests"
					/>
					Show resolved
					{!showResolved && hiddenResolvedCount > 0 && (
						<span className="tabular-nums">({hiddenResolvedCount})</span>
					)}
				</label>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{loading ? (
					<TicketListSkeleton />
				) : tickets.length === 0 ? (
					<div className="flex h-full items-center p-4">
						<EmptyState
							size="sm"
							illustration="messages-none"
							title={
								hiddenResolvedCount > 0
									? "No open requests"
									: "No support requests yet"
							}
							description={
								hiddenResolvedCount > 0
									? "Everything's resolved. Flip the toggle above to see past requests."
									: "Questions, bugs, ideas — send us a message and the whole thread lives here."
							}
						/>
					</div>
				) : (
					<ul className="divide-y divide-border/60 py-0.5">
						{tickets.map((ticket) => (
							<li key={ticket.id}>
								<TicketRow
									ticket={ticket}
									intent={intents[ticket.id]}
									selected={selectedTicketId === ticket.id}
									onSelect={onSelect}
								/>
							</li>
						))}
					</ul>
				)}
			</div>
		</>
	);
}

function TicketRow({
	ticket,
	intent,
	selected,
	onSelect,
}: {
	ticket: Ticket;
	intent: SupportIntent | undefined;
	selected: boolean;
	onSelect: (ticketId: string) => void;
}) {
	const unread = isUnread(ticket);
	const meta = intentMeta(intent);
	const badge = ticketStatusBadge(ticket.status);
	const timestamp = ticket.last_message_at ?? ticket.created_at;

	return (
		<button
			type="button"
			onClick={() => onSelect(ticket.id)}
			aria-current={selected ? "true" : undefined}
			className={cn(
				"flex w-full cursor-pointer items-start gap-2.5 border-l-2 py-2.5 pl-3 pr-3 text-left transition-colors duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
				selected
					? "border-l-primary bg-accent"
					: "border-l-transparent hover:bg-accent/60"
			)}
		>
			<span className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<meta.icon className="size-4" aria-hidden="true" />
				{unread && (
					<span
						aria-hidden="true"
						className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-card"
					/>
				)}
			</span>
			{unread && <span className="sr-only">Unread reply.</span>}
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline justify-between gap-2">
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							className={cn(
								"truncate text-sm text-foreground",
								unread ? "font-semibold" : "font-medium"
							)}
						>
							{meta.label}
						</span>
						<StatusBadge role={badge.role} size="sm" className="shrink-0">
							{badge.label}
						</StatusBadge>
					</span>
					<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
						{formatDistanceToNowStrict(new Date(timestamp), {
							addSuffix: true,
						})}
					</span>
				</span>
				<span
					className={cn(
						"line-clamp-1 block text-xs",
						unread ? "font-medium text-foreground" : "text-muted-foreground"
					)}
				>
					{ticket.last_message || "No messages yet"}
				</span>
			</span>
		</button>
	);
}

function TicketListSkeleton() {
	return (
		<div className="space-y-1 p-2">
			{Array.from({ length: 5 }).map((_, i) => (
				<div key={i} className="flex items-start gap-2.5 px-2 py-2.5">
					<Skeleton className="size-7 rounded-md" />
					<div className="flex-1 space-y-1.5">
						<div className="flex items-center justify-between gap-2">
							<Skeleton className="h-3.5 w-28" />
							<Skeleton className="h-3 w-12" />
						</div>
						<Skeleton className="h-3 w-4/5" />
					</div>
				</div>
			))}
		</div>
	);
}
