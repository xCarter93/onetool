import {
	View,
	Text,
	Pressable,
	ScrollView,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Bell, BellRing, Settings, X } from "lucide-react-native";
import { Illustration } from "@/components/illustrations";
import { SectionLabel } from "@/components/canvas";
import {
	fontFamily,
	radii,
	spacing,
	touch,
	type,
	useTokens,
} from "@/lib/theme";
import {
	formatRelativeTime,
	truncateText,
	stripAuthorIdFromMessage,
} from "@/lib/notification-utils";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { normalizeActionUrl } from "@/lib/push-deeplink";
import { usePushRegistration } from "@/lib/use-push-registration";
import { useNotificationData } from "@/lib/use-notification-data";
import { PushPrePrompt } from "@/components/push/PushPrePrompt";

/** Day-bucket label for the group header above a run of same-day notifications. */
function dateGroupLabel(creationTime: number, now: number): string {
	const startOfDay = (ms: number) => {
		const d = new Date(ms);
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	};
	const diffDays = Math.round((startOfDay(now) - startOfDay(creationTime)) / 86_400_000);
	if (diffDays <= 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return "This week";
	return "Earlier";
}

// Notifications form-sheet route — same native sheet type + chrome as /org-switch
// and /day-sheet (sheet options in _layout.tsx). Owns the list query + markRead.
export default function NotificationsSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const notificationData = useNotificationData();
	const markRead = useMutation(api.notifications.markRead);

	const { getPushPermissionStatus, enablePushNotifications } =
		usePushRegistration();
	// Affordance gate: show the enable prompt whenever permission is NOT granted
	// (so "Not now" users — or never-asked users — can opt in here).
	const [pushGranted, setPushGranted] = useState(true);
	const [showEnable, setShowEnable] = useState(false);

	const notifications = useMemo(
		() => notificationData?.notifications ?? [],
		[notificationData],
	);
	const unreadCount = notificationData?.unreadCount ?? 0;
	const loading = notificationData === undefined;
	// Seeded once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	// Group rows by day bucket for the list's date labels, assuming the query
	// already orders notifications newest first.
	const rows = useMemo(() => {
		const out: ({ label: string } | { notification: (typeof notifications)[number] })[] = [];
		let lastGroup: string | null = null;
		for (const n of notifications) {
			const group = dateGroupLabel(n._creationTime, now);
			if (group !== lastGroup) {
				out.push({ label: group });
				lastGroup = group;
			}
			out.push({ notification: n });
		}
		return out;
	}, [notifications, now]);

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
		<View style={[styles.header, { borderBottomColor: t.line }]}>
			<View style={[styles.tile, { backgroundColor: t.secondary }]}>
				<Bell size={18} color={t.frostedInk} strokeWidth={2} />
			</View>
			<View style={styles.headerText}>
				<Text style={[styles.title, { color: t.ink }]} accessibilityRole="header">
					Notifications
				</Text>
				{unreadCount > 0 ? (
					<Text style={[styles.subtitle, { color: t.sub }]}>
						{unreadCount} unread
					</Text>
				) : null}
			</View>
			<View style={styles.headerActions}>
				<Pressable
					onPress={() =>
						// Cast until the generated route types pick up the new file
						// (same idiom as Profile's push to this route).
						router.push("/notification-preferences" as Href)
					}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Notification settings"
					style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: t.secondary }]}
				>
					<Settings size={20} color={t.sub} strokeWidth={2} />
				</Pressable>
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Close"
					style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: t.secondary }]}
				>
					<X size={20} color={t.sub} strokeWidth={2} />
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
					{rows.map((row, i) => {
						if ("label" in row) {
							return (
								<View key={`label-${row.label}-${i}`} style={styles.groupLabel}>
									<SectionLabel title={row.label} />
								</View>
							);
						}
						const n = row.notification;
						const isLastRow = i === rows.length - 1;
						return (
							<Pressable
								key={n._id}
								onPress={() => handlePress(n._id, n.actionUrl, n.isRead)}
								style={({ pressed }) => [
									styles.row,
									{ borderBottomColor: t.lineSoft },
									isLastRow && styles.rowLast,
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
						);
					})}
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
		gap: 12,
		paddingHorizontal: spacing.md,
		paddingBottom: 14,
		borderBottomWidth: 1,
	},
	tile: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontSize: type.h3,
		fontFamily: fontFamily.semibold,
	},
	subtitle: {
		fontSize: type.sm,
		fontFamily: fontFamily.regular,
		marginTop: 1,
	},
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	headerBtn: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	groupLabel: {
		paddingHorizontal: 20,
		paddingTop: 14,
		paddingBottom: 8,
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
