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

// 10.5px labels need 4.5:1 — #8b9096 measured 3.22:1 on white.
const INACTIVE = "#5f646b";

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
		// A glyph only needs 3:1, so the icon keeps the lighter blue; the LABEL
		// needs 4.5:1, so it takes the deeper frostedInk.
		const iconColor = active ? t.primaryInk : INACTIVE;
		const labelColor = active ? t.frostedInk : INACTIVE;
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
				<Icon size={22} color={iconColor} strokeWidth={active ? 2.3 : 2} />
				<Text
					style={[
						styles.label,
						{
							color: labelColor,
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
		// The raised FAB must live inside its parent's BOUNDS, not escape them via a
		// negative margin: RN does not hit-test children painted outside the parent,
		// so the overhanging top of the old margin-based FAB rendered but swallowed
		// no touches (and hitSlop cannot cross the boundary either). This wrapper
		// reserves FAB_OVERHANG of height above the bar and is `box-none` so the
		// reserved strip stays transparent to touches on content behind it.
		<View style={styles.wrap} pointerEvents="box-none">
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
				{/* Reserved center slot — the FAB itself is positioned by the wrapper. */}
				<View style={styles.fabSlot} />
				{renderItem(TABS[2])}
				{renderItem(TABS[3])}
			</View>

			<View style={styles.fabLayer} pointerEvents="box-none">
				<Pressable
					onPress={() => router.push(CREATE)}
					style={[styles.fab, { backgroundColor: t.primarySolid }]}
					accessibilityRole="button"
					accessibilityLabel="Create"
				>
					<Plus size={26} color="#fff" strokeWidth={2.4} />
				</Pressable>
			</View>
		</View>
	);
}

/** How far the FAB rises above the bar's top edge. */
const FAB_OVERHANG = 22;
const FAB_SIZE = 54;

const styles = StyleSheet.create({
	wrap: {
		paddingTop: FAB_OVERHANG,
	},
	container: {
		borderTopWidth: 1,
		flexDirection: "row",
		alignItems: "flex-start",
		paddingTop: 10,
	},
	fabLayer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 1,
	},
	fabSlot: {
		width: 80,
		flexShrink: 0,
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
	fab: {
		width: FAB_SIZE,
		height: FAB_SIZE,
		borderRadius: radii.fab,
		alignItems: "center",
		justifyContent: "center",
		boxShadow: shadow.fab,
	},
});
