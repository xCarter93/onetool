import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
// BottomTabBarProps is vendored by expo-router (no standalone @react-navigation/bottom-tabs dep).
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
	Home,
	Users,
	ListChecks,
	Receipt,
	Plus,
	type LucideIcon,
} from "lucide-react-native";
import { fontFamily, shadow, useTokens } from "@/lib/theme";

const INACTIVE = "#9aa4b2";

// The four visible bar tabs in display order. The ＋ FAB is a non-route center
// column rendered between Clients and Tasks.
const TABS: { name: string; label: string; Icon: LucideIcon }[] = [
	{ name: "index", label: "Home", Icon: Home },
	{ name: "clients", label: "Clients", Icon: Users },
	{ name: "tasks", label: "Tasks", Icon: ListChecks },
	{ name: "money", label: "Money", Icon: Receipt },
];

export function FieldKitTabBar({ state, navigation }: BottomTabBarProps) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();

	// Route content for /create is supplied by Plan 24; cast keeps the typed router clean.
	const CREATE: Href = "/create" as Href;

	const renderItem = (tab: (typeof TABS)[number]) => {
		const routeIndex = state.routes.findIndex(
			(r: (typeof state.routes)[number]) => r.name === tab.name,
		);
		const active = routeIndex !== -1 && state.index === routeIndex;
		const color = active ? t.accent : INACTIVE;
		const { Icon } = tab;

		const onPress = () => {
			const route = state.routes[routeIndex];
			if (!route) return;
			const event = navigation.emit({
				type: "tabPress",
				target: route.key,
				canPreventDefault: true,
			});
			if (!active && !event.defaultPrevented) {
				navigation.navigate(route.name);
			}
		};

		return (
			<Pressable
				key={tab.name}
				onPress={onPress}
				style={styles.item}
				accessibilityRole="button"
				accessibilityLabel={tab.label}
				accessibilityState={{ selected: active }}
			>
				{active && (
					<View style={[styles.tick, { backgroundColor: t.accent }]} />
				)}
				<View
					style={[
						styles.iconTile,
						{ backgroundColor: active ? t.accentSoft : "transparent" },
					]}
				>
					<Icon size={22} color={color} strokeWidth={active ? 2.4 : 2} />
				</View>
				<Text style={[styles.label, { color, fontWeight: active ? "700" : "500" }]}>
					{tab.label}
				</Text>
			</Pressable>
		);
	};

	return (
		<View
			style={[
				styles.container,
				{
					borderTopColor: t.line,
					paddingBottom: insets.bottom + 8,
				},
			]}
		>
			{renderItem(TABS[0])}
			{renderItem(TABS[1])}

			{/* Center ＋ FAB column (non-route) */}
			<View style={styles.fabColumn}>
				<Pressable
					// TODO(P24): /create sheet content is supplied by Plan 24.
					onPress={() => router.push(CREATE)}
					style={[styles.fab, { backgroundColor: t.accent }]}
					accessibilityRole="button"
					accessibilityLabel="Create"
				>
					<Plus size={27} color="#fff" strokeWidth={2.6} />
				</Pressable>
				<Text style={styles.createLabel}>Create</Text>
			</View>

			{renderItem(TABS[2])}
			{renderItem(TABS[3])}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		backgroundColor: "#ffffff",
		borderTopWidth: 1,
		flexDirection: "row",
		alignItems: "flex-start",
		paddingTop: 10,
		// NOTE: the container must NOT clip its children, or the raised FAB is cut off.
	},
	item: {
		flex: 1,
		flexDirection: "column",
		alignItems: "center",
		gap: 4,
		paddingVertical: 4,
		position: "relative",
	},
	tick: {
		position: "absolute",
		top: -10,
		width: 22,
		height: 3,
		borderRadius: 3,
	},
	iconTile: {
		width: 40,
		height: 28,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	label: {
		fontFamily: fontFamily.medium,
		fontSize: 10.5,
	},
	fabColumn: {
		width: 80,
		flexShrink: 0,
		flexDirection: "column",
		alignItems: "center",
		gap: 4,
	},
	fab: {
		marginTop: -22,
		width: 56,
		height: 56,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		boxShadow: shadow.fab,
	},
	createLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 10.5,
		color: INACTIVE,
		marginTop: 1,
	},
});
