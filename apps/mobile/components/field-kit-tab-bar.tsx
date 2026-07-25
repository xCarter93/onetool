import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
// BottomTabBarProps is vendored by expo-router (no standalone @react-navigation/bottom-tabs dep).
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
	CalendarCheck,
	Briefcase,
	Route as RouteIcon,
	Activity,
	Sparkles,
	type LucideIcon,
} from "lucide-react-native";
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";
import { ScrollFade } from "@/components/ui";

// 10.5px labels need 4.5:1 — #8b9096 measured 3.22:1 on white, so inactive
// items take the secondary ink ramp (5.96:1).

// Tabs are MODES, not entities — new record types land inside Work, new
// day-surfaces inside Today, so the bar never runs out of slots again.
// Symmetric 2+2 around the center assistant FAB (a non-route column).
const TABS: { name: string; label: string; Icon: LucideIcon }[] = [
	{ name: "index", label: "Today", Icon: CalendarCheck },
	{ name: "work", label: "Work", Icon: Briefcase },
	{ name: "routes", label: "Routes", Icon: RouteIcon },
	{ name: "activity", label: "Activity", Icon: Activity },
];

export function FieldKitTabBar({ state, navigation }: BottomTabBarProps) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();

	// Form-sheet route, not yet in the generated route types.
	const ASSISTANT: Href = "/assistant" as Href;

	// Bar height is dynamic (safe-area dependent), so the notch path is built
	// from a measured size rather than a fixed viewBox.
	const [barSize, setBarSize] = React.useState({ width: 0, height: 0 });
	const onBarLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		setBarSize((prev) =>
			prev.width === width && prev.height === height
				? prev
				: { width, height },
		);
	};
	const { fillPath, strokePath } = React.useMemo(
		() => buildTabBarPath(barSize.width, barSize.height),
		[barSize.width, barSize.height],
	);

	const renderItem = (tab: (typeof TABS)[number]) => {
		const routeIndex = state.routes.findIndex(
			(r: (typeof state.routes)[number]) => r.name === tab.name,
		);
		const active = routeIndex !== -1 && state.index === routeIndex;
		// A glyph only needs 3:1, so the icon keeps the lighter blue; the LABEL
		// needs 4.5:1, so it takes the deeper frostedInk.
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
				style={[styles.container, { paddingBottom: insets.bottom + 8 }]}
				onLayout={onBarLayout}
			>
				{/* Opaque below the notch band, so the bar is never transparent while
				    waiting for the first onLayout. The container itself can't carry a
				    background — that would fill the notch back in. */}
				<View
					style={[styles.baseFill, { backgroundColor: t.card }]}
					pointerEvents="none"
				/>
				{/* Fill + hairline in one SVG so the top edge can curve into the FAB
				    notch — a straight borderTopWidth can't follow an arc. */}
				{barSize.width > 0 && (
					<Svg
						width={barSize.width}
						height={barSize.height}
						style={StyleSheet.absoluteFill}
						pointerEvents="none"
					>
						<Path d={fillPath} fill={t.card} />
						<Path
							d={strokePath}
							fill="none"
							stroke={t.line}
							strokeWidth={STROKE_WIDTH}
						/>
					</Svg>
				)}
				{/* Soft fade so scroll content dissolves into the bar above the chrome. */}
				<ScrollFade edge="bottom" />
				{renderItem(TABS[0])}
				{renderItem(TABS[1])}
				{/* Reserved center slot — the FAB floats above it, so the caption lives
				    here and the bar keeps all five columns labelled. An unlabelled glyph
				    in the most prominent slot reads as "create" to everyone. */}
				<View style={styles.fabSlot}>
					<Text style={[styles.fabLabel, { color: t.sub }]}>Assistant</Text>
				</View>
				{renderItem(TABS[2])}
				{renderItem(TABS[3])}
			</View>

			{/* The center column is the ASSISTANT, not create — manual creation moved
			    to each surface's contextual header ＋. */}
			<View style={styles.fabLayer} pointerEvents="box-none">
				<Pressable
					onPress={() => router.push(ASSISTANT)}
					style={[styles.fab, { backgroundColor: t.primarySolid }]}
					accessibilityRole="button"
					accessibilityLabel="Assistant"
				>
					<Sparkles size={25} color="#fff" strokeWidth={2.2} />
				</Pressable>
			</View>
		</View>
	);
}

/** How far the FAB rises above the bar's top edge. */
const FAB_OVERHANG = 22;
const FAB_SIZE = 54;

// Notch geometry — tune these to reshape the cutout independently of the FAB.
const NOTCH_WIDTH = 80; // total width of the cutout (comfortably clears FAB_SIZE + gap)
const NOTCH_DEPTH = FAB_OVERHANG; // how far the notch dips so the FAB nests in it
const SHOULDER_PULL = 0.55; // 0-1 of half-width; higher = gentler entry off the flat edge
const TROUGH_PULL = 0.35; // 0-1 of half-width; higher = flatter notch floor
const STROKE_WIDTH = 1; // hairline width, matches the old borderTopWidth

/**
 * Builds the tab bar's fill (full rect with a notch bitten out of the top
 * edge) and a separate stroke-only path for just that top edge, so the
 * hairline follows the curve instead of drawing straight across it.
 */
function buildTabBarPath(width: number, height: number) {
	const cx = width / 2;
	const half = NOTCH_WIDTH / 2;
	const shoulderPull = half * SHOULDER_PULL;
	const troughPull = half * TROUGH_PULL;
	const leftShoulder = cx - half;
	const rightShoulder = cx + half;

	// Stroke is centred on the path — offset the top edge down by half its
	// width, or the top half of the hairline gets clipped above y=0.
	const topEdge = (y: number) =>
		`M 0 ${y} L ${leftShoulder} ${y} ` +
		`C ${leftShoulder + shoulderPull} ${y} ${cx - troughPull} ${y + NOTCH_DEPTH} ${cx} ${y + NOTCH_DEPTH} ` +
		`C ${cx + troughPull} ${y + NOTCH_DEPTH} ${rightShoulder - shoulderPull} ${y} ${rightShoulder} ${y} ` +
		`L ${width} ${y}`;

	return {
		fillPath: `${topEdge(0)} L ${width} ${height} L 0 ${height} Z`,
		strokePath: topEdge(STROKE_WIDTH / 2),
	};
}

const styles = StyleSheet.create({
	// The negative margin cancels the padding's flow height, so the scene behind
	// grows to fill the overhang band — the page canvas (dot grid) shows through
	// the transparent strip instead of ending above it. The FAB stays inside the
	// wrap's BOUNDS (hit-testing works); only the wrap's flow position shifts.
	wrap: {
		paddingTop: FAB_OVERHANG,
		marginTop: -FAB_OVERHANG,
	},
	container: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingTop: 10,
	},
	// Starts below the notch band; the SVG owns everything above it.
	baseFill: {
		position: "absolute",
		top: NOTCH_DEPTH,
		left: 0,
		right: 0,
		bottom: 0,
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
		alignItems: "center",
		// Mirrors an item's icon+gap stack so the caption baselines align.
		paddingTop: 5 + 22 + 3,
		paddingBottom: 4,
	},
	fabLabel: {
		fontSize: type.micro,
		fontFamily: fontFamily.medium,
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
