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
import { BellOff, BellRing, X } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
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
							backgroundColor: pressed ? t.accentMid : t.accentSoft,
							borderColor: t.accent,
						},
					]}
				>
					<BellRing size={18} color={t.accent} />
					<Text style={[styles.enableLabel, { color: t.accent }]}>
						Enable push notifications
					</Text>
				</Pressable>
			) : null}
			{loading ? (
				<View style={styles.state}>
					<ActivityIndicator size="small" color={t.accent} />
				</View>
			) : notifications.length === 0 ? (
				<View style={styles.state}>
					<View style={[styles.emptyTile, { backgroundColor: t.muted }]}>
						<BellOff size={42} color={t.faint} />
					</View>
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
								!n.isRead && { backgroundColor: t.accentSoft },
								pressed && { backgroundColor: t.surface },
							]}
						>
							<View style={styles.dotCol}>
								{!n.isRead ? (
									<View style={[styles.dot, { backgroundColor: t.accent }]} />
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
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + definite height).
	// flex:1 (not flexShrink) so the body's flex:1 list/state resolves a basis.
	padCard: {
		flex: 1,
		paddingTop: 18,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 18,
	},
	titleWrap: {
		flex: 2,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	title: {
		fontSize: 21,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	badge: {
		borderRadius: 999,
		minWidth: 22,
		paddingHorizontal: 6,
		paddingVertical: 2,
		alignItems: "center",
	},
	badgeText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: fontFamily.semibold,
	},
	headerAction: {
		flex: 1,
		alignItems: "flex-end",
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	enableRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		marginHorizontal: 20,
		marginBottom: 14,
		paddingVertical: 12,
		borderRadius: 14,
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
		paddingHorizontal: 32,
		gap: 10,
	},
	emptyTile: {
		width: 72,
		height: 72,
		borderRadius: 36,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
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
		borderRadius: 4,
	},
	rowBody: {
		flex: 1,
	},
	rowTitle: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		marginBottom: 4,
	},
	rowMessage: {
		fontSize: 12,
		lineHeight: 18,
		fontFamily: fontFamily.regular,
		marginBottom: 4,
	},
	rowTime: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
	},
});
