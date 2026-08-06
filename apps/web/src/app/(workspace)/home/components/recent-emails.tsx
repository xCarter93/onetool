"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { Frame, FramePanel } from "@/components/reui/frame";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { cn } from "@/lib/utils";

const VISIBLE_THREADS = 5;

/**
 * Compact inbox strip for the home dashboard: the newest client
 * conversations as single-line rows, each deep-linking into /inbox.
 * Owns its Frame so the page renders no empty shell when access is denied.
 */
export function RecentEmails({ className }: { className?: string }) {
	const { can, isLoading: permsLoading } = usePermissions();
	const canView = can("inbox");
	const isOrgSwitching = useIsOrgSwitching();

	// requireLevel throws server-side, so the query must stay skipped until
	// the client knows the caller holds inbox access.
	const threads = useQuery(
		api.emailThreads.listThreadsByOrg,
		canView ? { filter: "all", limit: VISIBLE_THREADS } : "skip"
	);
	const unreadCount = useQuery(
		api.emailThreads.countUnreadThreads,
		canView ? {} : "skip"
	);

	// /home is admin-facing, but a granular-RBAC admin without inbox access
	// simply doesn't get the module.
	if (!permsLoading && !canView) return null;

	const loading =
		permsLoading || isOrgSwitching || threads === undefined;
	const visible = (threads ?? []).slice(0, VISIBLE_THREADS);

	return (
		<Frame className={className}>
			<FramePanel className="grow">
			<div className="mb-6 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<h3 className="text-base font-semibold text-foreground">
						Recent emails
					</h3>
					{typeof unreadCount === "number" && unreadCount > 0 && (
						<Badge variant="primary-light" radius="full">
							{unreadCount} unread
						</Badge>
					)}
				</div>
				<Link
					href="/inbox"
					className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-2 transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Open inbox
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</Link>
			</div>

			{loading ? (
				<RecentEmailsSkeleton />
			) : visible.length === 0 ? (
				<div className="py-2">
					<EmptyState
						size="sm"
						illustration="messages-none"
						title="No email yet"
						description="Client conversations will show up here as they come in."
					/>
				</div>
			) : (
				<ul className="divide-y divide-border/60">
					{visible.map((thread) => {
						const unread = thread.unreadCount > 0;
						const contactName =
							thread.contact?.name?.trim() || "Unknown sender";
						return (
							<li key={thread.threadDocId}>
								<Link
									href={`/inbox?thread=${thread.threadDocId}`}
									className="flex items-center gap-3 py-2.5 transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
								>
									<span
										aria-hidden="true"
										className={cn(
											"size-1.5 shrink-0 rounded-full",
											unread ? "bg-primary" : "bg-transparent"
										)}
									/>
									<span
										className={cn(
											"w-36 shrink-0 truncate text-sm text-foreground sm:w-44",
											unread ? "font-semibold" : "font-medium"
										)}
									>
										{contactName}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm">
										<span
											className={cn(
												"text-foreground",
												unread && "font-medium"
											)}
										>
											{thread.subject || "(no subject)"}
										</span>
										<span className="hidden text-muted-foreground sm:inline">
											{"  "}
											{thread.lastMessageDirection === "outbound"
												? "You: "
												: ""}
											{thread.preview}
										</span>
									</span>
									{thread.clientName && (
										<span className="hidden w-36 shrink-0 truncate text-right text-xs text-muted-foreground lg:block">
											{thread.clientName}
										</span>
									)}
									<time className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
										{formatDistanceToNowStrict(
											new Date(thread.lastMessageAt),
											{ addSuffix: true }
										)}
									</time>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
			</FramePanel>
		</Frame>
	);
}

function RecentEmailsSkeleton() {
	return (
		<div className="divide-y divide-border/60">
			{Array.from({ length: VISIBLE_THREADS }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 py-3">
					<Skeleton className="size-1.5 rounded-full" />
					<Skeleton className="h-3.5 w-36 sm:w-44" />
					<Skeleton className="h-3.5 flex-1" />
					<Skeleton className="h-3 w-20" />
				</div>
			))}
		</div>
	);
}
