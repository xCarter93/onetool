"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	formatRelativeTime,
	truncateText,
	stripAuthorIdFromMessage,
} from "@/lib/notification-utils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

export function NotificationBell() {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	// Fetch notifications
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 10,
	});

	const markAsRead = useMutation(api.notifications.markRead);

	const notifications = notificationData?.notifications || [];
	const unreadCount = notificationData?.unreadCount || 0;

	// Handle notification click
	const handleNotificationClick = async (
		notificationId: Id<"notifications">,
		actionUrl?: string,
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

		// Navigate to the entity
		if (actionUrl) {
			router.push(actionUrl);
			setOpen(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					className="relative group rounded-xl p-2.5 transition-all duration-200 hover:ring-2 hover:ring-primary/30"
				>
					<Bell className="h-5 w-5 text-gray-700 dark:text-gray-300" />
					{unreadCount > 0 && (
						<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
							{unreadCount > 9 ? "9+" : unreadCount}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-96 p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
			>
				{/* Header */}
				<div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
							Notifications
						</h3>
						{unreadCount > 0 && (
							<Badge variant="secondary" className="text-xs">
								{unreadCount} unread
							</Badge>
						)}
					</div>
				</div>

				{/* Notifications List */}
				<ScrollArea className="h-[400px]">
					{notifications.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
							<div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
								<Bell className="h-6 w-6 text-gray-400" />
							</div>
							<p className="text-sm text-gray-600 dark:text-gray-400">
								No notifications yet
							</p>
						</div>
					) : (
						<div className="divide-y divide-gray-200 dark:divide-gray-800">
							{notifications.map((notification) => (
								<button
									key={notification._id}
									onClick={() =>
										handleNotificationClick(
											notification._id,
											notification.actionUrl,
											notification.isRead
										)
									}
									className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
										!notification.isRead
											? "bg-blue-50/50 dark:bg-blue-900/10"
											: ""
									}`}
								>
									<div className="flex gap-3">
										<div className="shrink-0 mt-1">
											{!notification.isRead && (
												<div className="w-2 h-2 rounded-full bg-blue-500" />
											)}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
												{notification.title}
											</p>
											<p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
												{truncateText(
													stripAuthorIdFromMessage(notification.message),
													100
												)}
											</p>
											<p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
												{formatRelativeTime(notification._creationTime)}
											</p>
										</div>
									</div>
								</button>
							))}
						</div>
					)}
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
