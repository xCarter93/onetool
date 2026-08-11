import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname, type Href } from "expo-router";
// BottomTabBarProps is vendored by expo-router (no standalone @react-navigation/bottom-tabs dep).
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
	CalendarCheck,
	Briefcase,
	Route as RouteIcon,
	Wallet,
	Sparkles,
	type LucideIcon,
} from "lucide-react-native";
import { dock, fontFamily, shadow, useTokens } from "@/lib/theme";

// 3.0 floating glass dock (design canvas 1a–1e). Slots: Today · Work ·
// [assistant orb] · Money · Routes — Money is promoted from a hidden route
// (the 3.0 promise is actionable money); Activity moves off the dock and
// on-ramps from Today's hero. Tabs are still MODES, not entities.
const TABS: { name: string; label: string; Icon: LucideIcon }[] = [
	{ name: "index", label: "Today", Icon: CalendarCheck },
	{ name: "work", label: "Work", Icon: Briefcase },
	{ name: "money", label: "Money", Icon: Wallet },
	{ name: "routes", label: "Routes", Icon: RouteIcon },
];

export function GlassDock({ state, navigation }: BottomTabBarProps) {
	const t = useTokens();
	const router = useRouter();
	const pathname = usePathname();
	const insets = useSafeAreaInsets();

	// Form-sheet route, not yet in the generated route types.
	const ASSISTANT: Href = "/assistant" as Href;

	const renderItem = (tab: (typeof TABS)[number]) => {
		const routeIndex = state.routes.findIndex(
			(r: (typeof state.routes)[number]) => r.name === tab.name,
		);
		const active = routeIndex !== -1 && state.index === routeIndex;
		// Glyphs need 3:1 (lighter blue passes); 10px labels need 4.5:1, so the
		// label takes the deeper frostedInk — same split as the 2.0 bar.
		const iconColor = active ? t.primaryInk : t.sub;
		const labelColor = active ? t.frostedInk : t.sub;
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
				<Icon size={20} color={iconColor} strokeWidth={active ? 2.3 : 2} />
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
		// Out of flow so scenes get full height and content scrolls under the
		// glass. The wrap reserves the orb's rise INSIDE its bounds — RN does not
		// hit-test children painted outside the parent (2.0 FAB lesson).
		<View
			style={[
				styles.wrap,
				{ bottom: Math.max(insets.bottom, dock.bottomInset) },
			]}
			pointerEvents="box-none"
		>
			{/* Pill background: clipped rounded blur + frost. The orb lives in the
			    unclipped items layer, or the radius clip would behead it. */}
			<View style={styles.pill} pointerEvents="none">
				<BlurView
					intensity={40}
					tint="light"
					style={StyleSheet.absoluteFill}
				/>
				<View style={[StyleSheet.absoluteFill, { backgroundColor: dock.bg }]} />
			</View>

			<View style={styles.row} pointerEvents="box-none">
				{renderItem(TABS[0])}
				{renderItem(TABS[1])}
				{/* Center orb — the ASSISTANT, not create. No label: the gradient
				    squircle + sparkle is the app's one unlabelled glyph (a11y label
				    carries it), per the 1a spec. */}
				<View style={styles.orbSlot}>
					<Pressable
						// ctx tells the assistant which screen it was opened over.
						onPress={() =>
							router.push({
								pathname: ASSISTANT as never,
								params: { ctx: pathname },
							})
						}
						accessibilityRole="button"
						accessibilityLabel="Assistant"
						style={styles.orb}
					>
						<LinearGradient
							colors={dock.orbGradient}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 1 }}
							style={StyleSheet.absoluteFill}
						/>
						<Sparkles size={22} color="#fff" strokeWidth={2.2} />
					</Pressable>
				</View>
				{renderItem(TABS[2])}
				{renderItem(TABS[3])}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		left: dock.sideInset,
		right: dock.sideInset,
		height: dock.height + dock.orbRise,
		justifyContent: "flex-end",
	},
	pill: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: dock.height,
		borderRadius: dock.radius,
		borderWidth: 1,
		borderColor: dock.border,
		overflow: "hidden",
		boxShadow: dock.shadow,
	},
	row: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: dock.height + dock.orbRise,
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		paddingHorizontal: 16,
	},
	item: {
		width: 54,
		height: dock.height,
		alignItems: "center",
		justifyContent: "center",
		gap: 3,
	},
	orbSlot: {
		width: 56,
		alignItems: "center",
		// Canvas spec: a vertically-centred orb shifted up 16px, i.e. its top
		// breaks the pill's edge by (60-50)/2 + 16 - 5 = 11px.
		paddingBottom: (dock.height - dock.orbSize) / 2 + dock.orbRise,
	},
	orb: {
		width: dock.orbSize,
		height: dock.orbSize,
		borderRadius: dock.orbRadius,
		borderWidth: 3,
		borderColor: dock.orbRing,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		boxShadow: shadow.fab,
	},
	label: {
		fontSize: 10,
	},
});
