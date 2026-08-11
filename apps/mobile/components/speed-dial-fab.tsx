import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	FadeIn,
	FadeInDown,
	FadeOut,
	FadeOutDown,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import {
	Building2,
	FileText,
	Folder,
	ClipboardCheck,
	Plus,
	type LucideIcon,
} from "lucide-react-native";
import {
	dock,
	fontFamily,
	hero,
	radii,
	recordTint,
	shadow,
	type,
	useTokens,
} from "@/lib/theme";
import { usePermissions } from "@/lib/use-permissions";
import { hapticImpact, hapticSelect } from "@/lib/haptics";

// Speed-dial capture fan (3.0 slice 5, Jobber-pattern: labeled satellites over
// a washed backdrop, most-used action nearest the thumb). The dock's center orb
// stays the ASSISTANT — this is the one create entry point, floating above the
// dock's right end on every tab screen.

type SatelliteKey = "project" | "task" | "client" | "quote";

const SATELLITES: {
	key: SatelliteKey;
	label: string;
	Icon: LucideIcon;
	tint: { bg: string; fg: string };
	href: string;
}[] = [
	// Rendered top-to-bottom; Project sits last = nearest the thumb.
	{
		key: "quote",
		label: "New quote",
		Icon: FileText,
		tint: recordTint.quote,
		href: "/quote/new",
	},
	{
		key: "client",
		label: "New client",
		Icon: Building2,
		tint: recordTint.client,
		href: "/(tabs)/clients/new",
	},
	{
		key: "task",
		label: "New task",
		Icon: ClipboardCheck,
		tint: recordTint.task,
		href: "/tasks/form",
	},
	{
		key: "project",
		label: "New project",
		Icon: Folder,
		tint: recordTint.project,
		href: "/project/new",
	},
];

// Which permission object each satellite needs at "modify".
const SATELLITE_OBJECT: Record<SatelliteKey, "projects" | "tasks" | "clients" | "quotes"> = {
	project: "projects",
	task: "tasks",
	client: "clients",
	quote: "quotes",
};

// Layout-animation objects built once at module scope (never in render — New
// Architecture nativeID gotcha) and indexed by visual position bottom-up so the
// stagger rises from the FAB.
const ENTER_BY_ROW = [0, 1, 2, 3].map((i) =>
	FadeInDown.delay(i * 40).springify().damping(16),
);
const EXIT = FadeOutDown.duration(110);
const BACKDROP_IN = FadeIn.duration(150);
const BACKDROP_OUT = FadeOut.duration(110);

export function SpeedDialFab() {
	const t = useTokens();
	const router = useRouter();
	const pathname = usePathname();
	const insets = useSafeAreaInsets();
	const reducedMotion = useReducedMotion();
	const { can, isLoading } = usePermissions();
	const [open, setOpen] = useState(false);
	const rotation = useSharedValue(0);

	const visible = useMemo(
		() => SATELLITES.filter((s) => can(SATELLITE_OBJECT[s.key], "modify")),
		[can],
	);

	const plusStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value * 45}deg` }],
	}));

	// Plain functions, not useCallback: listing `rotation` as a hook dep trips
	// react-hooks/immutability when its .value is written.
	const setRotation = (to: number) => {
		rotation.value = withTiming(to, { duration: 160 });
	};

	const toggle = () => {
		const next = !open;
		setOpen(next);
		setRotation(next ? 1 : 0);
		hapticImpact();
	};

	const close = () => {
		setOpen(false);
		setRotation(0);
	};

	const onSatellite = (href: string) => {
		hapticSelect();
		close();
		router.push(href as never);
	};

	// Tab ROOTS only — clients/projects/activity/profile and the create/detail
	// screens live inside the (tabs) navigator too, and the FAB floating over a
	// create form (or client detail's own "+ New project") is noise.
	const onTabRoot =
		pathname === "/" ||
		pathname === "/work" ||
		pathname === "/money" ||
		pathname === "/routes";

	// Nothing to create (or permissions still resolving) — no dead chrome.
	if (!onTabRoot || isLoading || visible.length === 0) return null;

	const fabBottom =
		Math.max(insets.bottom, dock.bottomInset) + dock.height + 14;

	return (
		<>
			{open && (
				<Animated.View
					style={StyleSheet.absoluteFill}
					entering={reducedMotion ? undefined : BACKDROP_IN}
					exiting={reducedMotion ? undefined : BACKDROP_OUT}
				>
					{/* Washed blur backdrop — tap anywhere to dismiss. */}
					<Pressable
						style={StyleSheet.absoluteFill}
						onPress={close}
						accessibilityRole="button"
						accessibilityLabel="Close create menu"
					>
						<BlurView
							intensity={18}
							tint="light"
							style={StyleSheet.absoluteFill}
						/>
						<View
							style={[
								StyleSheet.absoluteFill,
								{ backgroundColor: "rgba(246,247,248,.72)" },
							]}
						/>
					</Pressable>

					<View
						style={[styles.fan, { bottom: fabBottom + dock.orbSize + 18 }]}
						pointerEvents="box-none"
					>
						{visible.map((s, i) => {
							// Stagger rises from the FAB: last row animates first.
							const row = visible.length - 1 - i;
							const { Icon } = s;
							return (
								<Animated.View
									key={s.key}
									entering={reducedMotion ? undefined : ENTER_BY_ROW[row]}
									exiting={reducedMotion ? undefined : EXIT}
									style={styles.satRow}
								>
									<Pressable
										onPress={() => onSatellite(s.href)}
										accessibilityRole="button"
										accessibilityLabel={s.label}
										style={({ pressed }) => [
											styles.satPress,
											pressed && { opacity: 0.7 },
										]}
									>
										<View style={[styles.satLabelPill, { backgroundColor: t.card }]}>
											<Text style={[styles.satLabel, { color: t.ink }]}>
												{s.label}
											</Text>
										</View>
										<View
											style={[styles.satCircle, { backgroundColor: s.tint.bg }]}
										>
											<Icon size={20} color={s.tint.fg} strokeWidth={2.1} />
										</View>
									</Pressable>
								</Animated.View>
							);
						})}
					</View>
				</Animated.View>
			)}

			<View
				style={[styles.fabWrap, { bottom: fabBottom }]}
				pointerEvents="box-none"
			>
				<Pressable
					onPress={toggle}
					accessibilityRole="button"
					accessibilityLabel={open ? "Close create menu" : "Create"}
					accessibilityState={{ expanded: open }}
					style={styles.fab}
				>
					<Animated.View style={plusStyle}>
						<Plus size={24} color={hero.text} strokeWidth={2.4} />
					</Animated.View>
				</Pressable>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	fabWrap: {
		position: "absolute",
		right: dock.sideInset + 2,
		alignItems: "flex-end",
	},
	fab: {
		width: 52,
		height: 52,
		borderRadius: radii.fab,
		backgroundColor: hero.ink,
		alignItems: "center",
		justifyContent: "center",
		boxShadow: shadow.lg,
	},
	fan: {
		position: "absolute",
		right: dock.sideInset + 2,
		alignItems: "flex-end",
		gap: 14,
	},
	satRow: {
		alignItems: "flex-end",
	},
	satPress: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 44,
	},
	satLabelPill: {
		paddingVertical: 7,
		paddingHorizontal: 14,
		borderRadius: radii.pill,
		boxShadow: shadow.md,
	},
	satLabel: {
		fontSize: type.rowTitle,
		fontFamily: fontFamily.semibold,
	},
	satCircle: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
		boxShadow: shadow.sm,
	},
});
