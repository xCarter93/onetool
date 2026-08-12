import {
	View,
	Text,
	Pressable,
	ScrollView,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { useEffect, useState } from "react";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { BellRing, Settings, X } from "lucide-react-native";
import { Illustration } from "@/components/illustrations";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";
import {
	formatRelativeTime,
	truncateText,
	stripAuthorIdFromMessage,
} from "@/lib/notification-utils";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { normalizeActionUrl } from "@/lib/push-deeplink";
import { usePushRegistration } from "@/lib/use-push-registration";
import { PushPrePrompt } from "@/components/push/PushPrePrompt";

// Notifications form-sheet route — same native sheet type + chrome as /org-switch
// and /day-sheet (sheet options in _layout.tsx). Owns the list query + markRead.
export default function NotificationsSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 50,
	});
	const markRead = useMutation(api.notifications.markRead);

	const { getPushPermissionStatus, enablePushNotifications } =
		usePushRegistration();
	// Affordance gate: show the enable prompt whenever permission is NOT granted
	// (so "Not now" users — or never-asked users — can opt in here).
	const [pushGranted, setPushGranted] = useState(true);
	const [showEnable, setShowEnable] = useState(false);

	const notifications = notificationData?.notifications ?? [];
	const unreadCount = notificationData?.unreadCount ?? 0;
	const loading = notificationData === undefined;

	useEffect(() => {
		let active = true;
		getPushPermissionStatus().then(({ status }) => {
			if (active) setPushGranted(status === "granted");
		});
		return () => {
			active = false;
		};
	}, [getPushPermissionStatus]);

	const handleEnable = async () => {
		try {
			await enablePushNotifications();
			const { status } = await getPushPermissionStatus();
			setPushGranted(status === "granted");
		} catch (error) {
			console.error("Failed to enable push notifications:", error);
		} finally {
			setShowEnable(false); // always close the overlay, even on throw
		}
	};

	const handlePress = async (
		id: Id<"notifications">,
		actionUrl?: string,
		isRead?: boolean,
	) => {
		if (!isRead) {
			try {
				await markRead({ id });
			} catch (error) {
				console.error("Failed to mark notification as read:", error);
			}
		}
		if (actionUrl) {
			const target = normalizeActionUrl(actionUrl);
			if (target.startsWith("/")) {
				router.back();
				router.push(target as Href);
			}
		}
	};

	const header = (
		<View style={styles.header}>
			<View style={styles.titleWrap}>
				<Text style={[styles.title, { color: t.ink }]}>Notifications</Text>
				{unreadCount > 0 ? (
					<View style={[styles.badge, { backgroundColor: t.danger }]}>
						<Text style={styles.badgeText}>
							{unreadCount > 9 ? "9+" : unreadCount}
						</Text>
					</View>
				) : null}
			</View>
			<View style={styles.headerAction}>
				<Pressable
					onPress={() =>
						// Cast until the generated route types pick up the new file
						// (same idiom as Profile's push to this route).
						router.push("/notification-preferences" as Href)
					}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Notification settings"
					style={styles.closeBtn}
				>
					<Settings size={22} color={t.sub} />
				</Pressable>
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Close"
					style={styles.closeBtn}
				>
					<X size={22} color={t.sub} />
				</Pressable>
			</View>
		</View>
	);

	const body = (
		<>
			{!pushGranted ? (
				<Pressable
					onPress={() => setShowEnable(true)}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.enableRow,
						{
							backgroundColor: pressed ? t.frostedBgPressed : t.frostedBg,
							borderColor: t.frostedBorder,
						},
					]}
				>
					<BellRing size={18} color={t.frostedInk} />
					<Text style={[styles.enableLabel, { color: t.frostedInk }]}>
						Enable push notifications
					</Text>
				</Pressable>
			) : null}
			{loading ? (
				<View style={styles.state}>
					<ActivityIndicator size="small" color={t.sub} />
				</View>
			) : notifications.length === 0 ? (
				<View style={styles.state}>
					{/* Sheet body sits on t.card — knockout must match it. */}
					<Illustration name="all-caught-up" knockout={t.card} />
					<Text style={[styles.emptyTitle, { color: t.ink }]}>
						No notifications
					</Text>
					<Text style={[styles.emptySub, { color: t.sub }]}>
						You&apos;re all caught up.
					</Text>
				</View>
			) : (
				<ScrollView
					style={styles.list}
					contentContainerStyle={{ paddingBottom: 24 }}
				>
					{notifications.map((n, i) => (
						<Pressable
							key={n._id}
							onPress={() => handlePress(n._id, n.actionUrl, n.isRead)}
							style={({ pressed }) => [
								styles.row,
								{ borderBottomColor: t.line },
								i === notifications.length - 1 && styles.rowLast,
								!n.isRead && { backgroundColor: t.secondary },
								pressed && { backgroundColor: t.surface },
							]}
						>
							<View style={styles.dotCol}>
								{!n.isRead ? (
									<View style={[styles.dot, { backgroundColor: t.dot }]} />
								) : null}
							</View>
							<View style={styles.rowBody}>
								<Text
									style={[styles.rowTitle, { color: t.ink }]}
									numberOfLines={1}
								>
									{n.title}
								</Text>
								<Text
									style={[styles.rowMessage, { color: t.sub }]}
									numberOfLines={2}
								>
									{truncateText(stripAuthorIdFromMessage(n.message), 100)}
								</Text>
								<Text style={[styles.rowTime, { color: t.faint }]}>
									{formatRelativeTime(n._creationTime)}
								</Text>
							</View>
						</Pressable>
					))}
				</ScrollView>
			)}
		</>
	);

	// Enable-prompt overlay (the affordance opens it on demand). Reuses the soft
	// pre-prompt component; Enable here fires the real iOS prompt.
	const prePrompt = showEnable ? (
		<PushPrePrompt onEnable={handleEnable} onDismiss={() => setShowEnable(false)} />
	) : null;

	// iPad (Strategy B): centered card; maxHeight 86% so a long list scrolls within it.
	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="86%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					{header}
					{body}
				</View>
				{prePrompt}
			</CenteredModal>
		);
	}

	// iPhone — existing bottom sheet, byte-identical.
	return (
		<>
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom },
			]}
		>
			<View style={[styles.grabber, { backgroundColor: t.border }]} />
			{header}
			{body}
		</View>
		{prePrompt}
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: radii.sheet,
		borderTopRightRadius: radii.sheet,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + definite height).
	// flex:1 (not flexShrink) so the body's flex:1 list/state resolves a basis.
	padCard: {
		flex: 1,
		paddingTop: spacing.gutter,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: radii.pill,
		marginTop: 10,
		marginBottom: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: spacing.gutter,
	},
	titleWrap: {
		flex: 2,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
	},
	title: {
		fontSize: type.h2,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	badge: {
		borderRadius: radii.pill,
		minWidth: 22,
		paddingHorizontal: 6,
		paddingVertical: 2,
		alignItems: "center",
	},
	badgeText: {
		color: "#fff",
		fontSize: type.micro,
		fontFamily: fontFamily.semibold,
	},
	headerAction: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
	},
	closeBtn: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	enableRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		marginHorizontal: 20,
		marginBottom: 14,
		paddingVertical: 12,
		minHeight: touch.min,
		borderRadius: radii["4xl"],
		borderWidth: 1,
	},
	enableLabel: {
		fontSize: type.sm,
		fontFamily: fontFamily.semibold,
	},
	state: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
		gap: 10,
	},
	emptyTitle: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
		textAlign: "center",
	},
	emptySub: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
	list: {
		flex: 1,
	},
	row: {
		flexDirection: "row",
		gap: 12,
		paddingHorizontal: 20,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	rowLast: {
		borderBottomWidth: 0,
	},
	dotCol: {
		width: 8,
		alignItems: "center",
		paddingTop: 6,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: radii.xs,
	},
	rowBody: {
		flex: 1,
	},
	rowTitle: {
		fontSize: type.rowTitle,
		fontFamily: fontFamily.semibold,
		marginBottom: spacing.xs,
	},
	rowMessage: {
		fontSize: type.meta,
		lineHeight: 18,
		fontFamily: fontFamily.regular,
		marginBottom: spacing.xs,
	},
	rowTime: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
	},
});
