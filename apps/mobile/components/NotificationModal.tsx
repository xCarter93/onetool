import {
	View,
	Text,
	Modal,
	Pressable,
	ScrollView,
	ActivityIndicator,
	Dimensions,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "expo-router";
import { colors, spacing, styles, fontFamily } from "@/lib/theme";
import { Bell, X, BellOff } from "lucide-react-native";
import {
	formatRelativeTime,
	truncateText,
	stripAuthorIdFromMessage,
} from "@/lib/notification-utils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface NotificationModalProps {
	visible: boolean;
	onClose: () => void;
}

export function NotificationModal({
	visible,
	onClose,
}: NotificationModalProps) {
	const router = useRouter();

	// Fetch notifications
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 50,
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

		// Navigate to the entity if URL is provided
		if (actionUrl) {
			router.push(actionUrl);
			onClose();
		}
	};

	return (
		<Modal
			animationType="slide"
			transparent={true}
			visible={visible}
			onRequestClose={onClose}
		>
			<View
				style={{
					flex: 1,
					justifyContent: "flex-end",
					backgroundColor: "rgba(0, 0, 0, 0.5)",
				}}
			>
				<View
					style={{
						backgroundColor: "#ffffff",
						borderTopLeftRadius: 20,
						borderTopRightRadius: 20,
						height: SCREEN_HEIGHT * 0.75, // 75% of screen height
						maxHeight: SCREEN_HEIGHT * 0.75,
					}}
				>
					{/* Header */}
					<View
						style={{
							flexDirection: "row",
							justifyContent: "space-between",
							alignItems: "center",
							paddingHorizontal: spacing.md,
							paddingVertical: spacing.md,
							borderBottomWidth: 1,
							borderBottomColor: colors.border,
						}}
					>
						<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
							<Text style={[styles.heading, { fontSize: 16 }]}>
								Notifications
							</Text>
							{unreadCount > 0 && (
								<View
									style={{
										backgroundColor: colors.danger,
										borderRadius: 10,
										paddingHorizontal: 8,
										paddingVertical: 2,
										minWidth: 24,
										alignItems: "center",
									}}
								>
									<Text
										style={{
											color: "#fff",
											fontSize: 11,
											fontFamily: fontFamily.semibold,
										}}
									>
										{unreadCount > 9 ? "9+" : unreadCount}
									</Text>
								</View>
							)}
						</View>
						<Pressable onPress={onClose} style={{ padding: 4 }}>
							<X size={24} color={colors.foreground} />
						</Pressable>
					</View>

					{/* Notifications List */}
					{!notificationData ? (
						<View
							style={{
								flex: 1,
								justifyContent: "center",
								alignItems: "center",
							}}
						>
							<ActivityIndicator size="large" color={colors.primary} />
						</View>
					) : notifications.length === 0 ? (
						<View
							style={{
								flex: 1,
								justifyContent: "center",
								alignItems: "center",
								paddingHorizontal: spacing.xl,
							}}
						>
							<View
								style={{
									width: 96,
									height: 96,
									backgroundColor: colors.muted,
									borderRadius: 48,
									alignItems: "center",
									justifyContent: "center",
									marginBottom: spacing.lg,
								}}
							>
								<BellOff size={48} color={colors.mutedForeground} />
							</View>
							<Text
								style={[
									styles.heading,
									{ fontSize: 18, marginBottom: spacing.sm },
								]}
							>
								No notifications
							</Text>
							<Text
								style={[
									styles.mutedText,
									{ textAlign: "center", fontSize: 13 },
								]}
							>
								You're all caught up! We'll notify you when something important
								happens.
							</Text>
						</View>
					) : (
						<ScrollView
							style={{ flex: 1 }}
							contentContainerStyle={{ paddingBottom: spacing.md }}
						>
							{notifications.map((notification, index) => (
								<Pressable
									key={notification._id}
									onPress={() =>
										handleNotificationClick(
											notification._id,
											notification.actionUrl,
											notification.isRead
										)
									}
									style={{
										paddingHorizontal: spacing.md,
										paddingVertical: spacing.md,
										borderBottomWidth:
											index < notifications.length - 1 ? 1 : 0,
										borderBottomColor: colors.border,
										backgroundColor: !notification.isRead
											? "rgba(0, 166, 244, 0.10)" // primary color with 10% opacity, matching web
											: "transparent",
									}}
								>
									<View style={{ flexDirection: "row", gap: 12 }}>
										{/* Unread indicator */}
										<View style={{ width: 8, alignItems: "center" }}>
											{!notification.isRead && (
												<View
													style={{
														width: 8,
														height: 8,
														borderRadius: 4,
														backgroundColor: colors.primary,
														marginTop: 6,
													}}
												/>
											)}
										</View>

										{/* Notification content */}
										<View style={{ flex: 1 }}>
											<Text
												style={{
													fontSize: 13,
													fontFamily: fontFamily.semibold,
													color: colors.foreground,
													marginBottom: 4,
												}}
											>
												{notification.title}
											</Text>
											<Text
												style={{
													fontSize: 12,
													color: colors.mutedForeground,
													marginBottom: 4,
													lineHeight: 18,
												}}
												numberOfLines={2}
											>
												{truncateText(
													stripAuthorIdFromMessage(notification.message),
													100
												)}
											</Text>
											<Text
												style={{
													fontSize: 11,
													color: colors.mutedForeground,
												}}
											>
												{formatRelativeTime(notification._creationTime)}
											</Text>
										</View>
									</View>
								</Pressable>
							))}
						</ScrollView>
					)}
				</View>
			</View>
		</Modal>
	);
}

