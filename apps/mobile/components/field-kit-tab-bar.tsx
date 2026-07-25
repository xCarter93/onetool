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
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";
import { ScrollFade } from "@/components/ui";

const INACTIVE = "#8b9096";

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
		const color = active ? t.primaryInk : INACTIVE;
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
				<Icon size={22} color={color} strokeWidth={active ? 2.3 : 2} />
				<Text
					style={[
						styles.label,
						{
							color,
							fontFamily: active ? fontFamily.semibold : fontFamily.medium,
						},
					]}
				>
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
					backgroundColor: t.card,
					borderTopColor: t.line,
					paddingBottom: insets.bottom + 8,
				},
			]}
		>
			{/* Soft fade so scroll content dissolves into the bar above the chrome. */}
			<ScrollFade edge="bottom" />
			{renderItem(TABS[0])}
			{renderItem(TABS[1])}

			{/* Center ＋ FAB column (non-route) */}
			<View style={styles.fabColumn}>
				<Pressable
					// TODO(P24): /create sheet content is supplied by Plan 24.
					onPress={() => router.push(CREATE)}
					style={[styles.fab, { backgroundColor: t.primarySolid }]}
					accessibilityRole="button"
					accessibilityLabel="Create"
				>
					<Plus size={26} color="#fff" strokeWidth={2.4} />
				</Pressable>
			</View>

			{renderItem(TABS[2])}
			{renderItem(TABS[3])}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
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
		gap: 3,
		paddingTop: 5,
		paddingBottom: 4,
	},
	label: {
		fontSize: type.micro,
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
		width: 54,
		height: 54,
		borderRadius: radii.fab,
		alignItems: "center",
		justifyContent: "center",
		boxShadow: shadow.fab,
	},
});
