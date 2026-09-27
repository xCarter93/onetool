import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Bell, BellRing, X } from "lucide-react-native";
import { ListRow } from "@/components/ui/list-row";
import { Panel } from "@/components/canvas";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { usePushRegistration } from "@/lib/use-push-registration";
import { PushPrePrompt } from "@/components/push/PushPrePrompt";

type PrefKey = "mentions" | "automations" | "paymentsApprovals";

const ROWS: {
	key: PrefKey;
	icon: "AtSign" | "Workflow" | "CircleDollarSign";
	title: string;
	sub: string;
}[] = [
	{
		key: "mentions",
		icon: "AtSign",
		title: "Mentions",
		sub: "When a teammate mentions you",
	},
	{
		key: "automations",
		icon: "Workflow",
		title: "Automation messages",
		sub: "Messages sent by your workflows",
	},
	{
		key: "paymentsApprovals",
		icon: "CircleDollarSign",
		title: "Payments & approvals",
		sub: "When an invoice is paid or a quote is approved",
	},
];

// Push-preference form sheet — same native sheet type + chrome as /notifications
// (sheet options in _layout.tsx), pushed from that sheet's gear and from Profile.
export default function NotificationPreferencesSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();

	const prefs = useQuery(api.notificationPreferences.get, {});
	const setPrefs = useMutation(api.notificationPreferences.set);
	const loading = prefs === undefined;

	// Local overrides merged over the server row at render time — the Switch flips
	// instantly without a setState-in-effect seed (lint ERROR in apps/mobile).
	const [overrides, setOverrides] = useState<Partial<Record<PrefKey, boolean>>>(
		{},
	);

	const { getPushPermissionStatus, enablePushNotifications } =
		usePushRegistration();
	// Same affordance gate as the notifications sheet: prompt whenever permission
	// is NOT granted, since the toggles below only govern OS-level pushes.
	const [pushGranted, setPushGranted] = useState(true);
	const [showEnable, setShowEnable] = useState(false);

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

	const valueOf = (key: PrefKey) => overrides[key] ?? prefs?.[key] ?? true;

	const handleToggle = async (key: PrefKey, next: boolean) => {
		setOverrides((prev) => ({ ...prev, [key]: next }));
		try {
			await setPrefs({ [key]: next });
		} catch (error) {
			console.error("Failed to save notification preference:", error);
			// Roll back to the server value so the switch never lies.
			setOverrides((prev) => ({ ...prev, [key]: !next }));
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
			</View>
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
	);

	const body = (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
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

			<Text style={[styles.intro, { color: t.sub }]}>
				Choose what gets pushed to you in this organization. These choices
				follow your account across every device you sign in on, and your in-app
				notifications list always shows everything.
			</Text>

			<Panel style={styles.group}>
				{ROWS.map((row) => {
					const value = valueOf(row.key);
					return (
						<ListRow
							key={row.key}
							icon={row.icon}
							title={row.title}
							sub={row.sub}
							showChevron={false}
							last
							right={
								<Switch
									value={value}
									disabled={loading}
									onValueChange={(next) => handleToggle(row.key, next)}
									trackColor={{ false: t.line, true: t.primarySolid }}
									ios_backgroundColor={t.line}
									accessibilityLabel={row.title}
								/>
							}
						/>
					);
				})}
			</Panel>
		</ScrollView>
	);

	const prePrompt = showEnable ? (
		<PushPrePrompt
			onEnable={handleEnable}
			onDismiss={() => setShowEnable(false)}
		/>
	) : null;

	// iPad (Strategy B): centered card, matching /notifications.
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
	headerBtn: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
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
	scroll: {
		flex: 1,
	},
	intro: {
		fontSize: type.meta,
		lineHeight: 18,
		fontFamily: fontFamily.regular,
		paddingHorizontal: 20,
		marginBottom: spacing.md,
	},
	group: {
		marginHorizontal: 20,
	},
});
