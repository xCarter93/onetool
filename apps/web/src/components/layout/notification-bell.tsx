"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import {
	formatRelativeTime,
	truncateText,
	stripAuthorIdFromMessage,
	resolveNotificationHref,
} from "@/lib/notification-utils";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export function NotificationBell() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const isOrgSwitching = useIsOrgSwitching();

	// Fetch notifications
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 10,
	});

	const markAsRead = useMutation(api.notifications.markRead);
	const markAllRead = useMutation(api.notifications.markAllRead);
	const [markingAll, setMarkingAll] = useState(false);

	// Treat the switch grace window as loading so the previous org's unread
	// count and notification list don't flash.
	const isLoading = isOrgSwitching || notificationData === undefined;
	const notifications = isLoading ? [] : notificationData.notifications;
	const unreadCount = isLoading ? 0 : notificationData.unreadCount;

	// Handle notification click. `href` is a pre-resolved, known-good route
	// (or null when the notification isn't navigable).
	const handleNotificationClick = async (
		notificationId: Id<"notifications">,
		href: string | null,
		isRead?: boolean
	) => {
		// Mark as read if not already
		if (!isRead) {
			try {
				await markAsRead({ id: notificationId });
			} catch (error) {
				console.error("Failed to mark notification as read:", error);
			}
		}

		// Navigate only when the notification points at a real page.
		if (href) {
			router.push(href);
			setOpen(false);
		}
	};

	const handleMarkAllRead = async () => {
		if (markingAll || unreadCount === 0) return;
		setMarkingAll(true);
		try {
			await markAllRead({});
		} catch (error) {
			console.error("Failed to mark all notifications as read:", error);
		} finally {
			setMarkingAll(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						aria-label={
							unreadCount > 0
								? `Notifications, ${unreadCount} unread`
								: "Notifications"
						}
						className="relative inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
					/>
				}
			>
				<Bell className="size-5" />
				{unreadCount > 0 && (
					<Badge
						variant="destructive"
						size="xs"
						radius="full"
						className="absolute right-1 top-1 ring-2 ring-sidebar"
					>
						{unreadCount > 9 ? "9+" : unreadCount}
					</Badge>
				)}
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={10}
				className="w-96 rounded-xl border-border p-0 shadow-xl"
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div className="flex items-center gap-2">
						<Bell className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-foreground">
							Notifications
						</h3>
					</div>
					{unreadCount > 0 && (
						<div className="flex items-center gap-1.5">
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
								{unreadCount} new
							</span>
							<button
								type="button"
								onClick={handleMarkAllRead}
								disabled={markingAll}
								className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
							>
								Mark all read
							</button>
						</div>
					)}
				</div>

				{/* Notifications List */}
				<ScrollArea className="h-[400px]">
					{isLoading ? (
						<div className="p-1.5">
							{Array.from({ length: 4 }).map((_, i) => (
								<div
									key={`notification-skeleton-${i}`}
									className="flex gap-3 px-3 py-2.5"
								>
									<Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-3.5 w-40" />
										<Skeleton className="h-3 w-full" />
										<Skeleton className="h-3 w-20" />
									</div>
								</div>
							))}
						</div>
					) : notifications.length === 0 ? (
						<EmptyState
							icon={<Bell />}
							title="You're all caught up"
							description="New notifications will appear here"
							// ScrollArea's viewport doesn't stretch children, so match its height explicitly
							className="h-[400px] justify-center"
						/>
					) : (
						<div className="p-1.5">
							{notifications.map((notification) => {
								const href = resolveNotificationHref(notification);
								return (
									<button
										key={notification._id}
										onClick={() =>
											handleNotificationClick(
												notification._id,
												href,
												notification.isRead
											)
										}
										className={cn(
											"flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
											!notification.isRead && "bg-primary/5"
										)}
									>
										<span
											className={cn(
												"mt-1.5 size-2 shrink-0 rounded-full",
												notification.isRead ? "bg-transparent" : "bg-primary"
											)}
										/>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium text-foreground">
												{notification.title}
											</p>
											<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
												{truncateText(
													stripAuthorIdFromMessage(notification.message),
													100
												)}
											</p>
											<p className="mt-1 text-[11px] text-muted-foreground/80">
												{formatRelativeTime(notification._creationTime)}
											</p>
										</div>
										{/* Chevron marks a notification that navigates somewhere;
										    its absence signals a non-routable, info-only item. */}
										{href && (
											<ChevronRight className="mt-1.5 size-4 shrink-0 self-start text-muted-foreground/50" />
										)}
									</button>
								);
							})}
						</div>
					)}
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
