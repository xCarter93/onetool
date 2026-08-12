import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { router, type Href } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { ChevronLeft, Fuel, Map, Search } from "lucide-react-native";
import {
	DOCK_CLEARANCE,
	fontFamily,
	radii,
	shadow,
	type,
	useTokens,
} from "@/lib/theme";
import { InkTabHeader, type InkHeaderAction } from "@/components/ink-tab-header";
import { requestSearchFocus } from "@/lib/search-focus";
import { DotGrid } from "@/components/ui";
import { MapboxModule } from "@/lib/mapbox";
import { RouteMap, type GasStation } from "@/components/routes/route-map";
import { RouteSheet } from "@/components/routes/route-sheet";
import { StopCarousel } from "@/components/routes/stop-carousel";
import {
	appleMapsUrl,
	googleMapsRouteUrl,
	googleMapsUrl,
	nextPendingStop,
	stopsInOrder,
	type LngLat,
	type RouteStop,
} from "@/lib/route-run";
import { todayDateId, utcMsFromDateId } from "@/lib/date";

// Routes tab — P4, round 2. Full-bleed native map; the bottom sheet only PICKS
// a route — a selected/running route shows as a floating stop-card carousel
// (swipe stop-to-stop; the camera centers the focused card's stop; the overview
// card fits the whole route, or follows the driver while running).
//
// headerMode "pane" = the iPad shell provides its own PaneHeader.

const WORK_TAB: Href = "/(tabs)/work" as Href;

// Same search jump the other tab roots carry in their ink band. Module scope —
// it closes over the imperative `router`, so it needs no hook and both the map
// screen and the no-module fallback can share one array.
const HEADER_ACTIONS: readonly InkHeaderAction[] = [
	{
		key: "search",
		label: "Search everything",
		icon: Search,
		onPress: () => {
			// Latch, then navigate: Work consumes it once on focus.
			requestSearchFocus();
			router.push(WORK_TAB);
		},
	},
];

export default function RoutesScreen({
	headerMode = "root",
}: {
	headerMode?: "root" | "pane";
} = {}) {
	// The native module ships with the P4 build — older dev clients fall back.
	if (!MapboxModule) return <RoutesUnavailable headerMode={headerMode} />;
	return <RoutesBody headerMode={headerMode} />;
}

/** Carousel index for a route: next pending stop while running, else overview. */
function initialFocus(route: Doc<"routes"> | null | undefined): number {
	if (!route) return 0;
	const running =
		route.kind === "daily" &&
		route.startedAt !== undefined &&
		route.completedAt === undefined;
	if (!running) return 0;
	const next = nextPendingStop(route.stops);
	if (!next) return 0;
	return stopsInOrder(route.stops).findIndex((s) => s.order === next.order) + 1;
}

function RoutesBody({ headerMode }: { headerMode: "root" | "pane" }) {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const isPane = headerMode === "pane";

	const routes = useQuery(api.routes.list);
	const me = useQuery(api.users.current);
	const orgUsers = useQuery(api.users.listByOrg);
	const premium = useQuery(api.permissions.hasPremiumAccess);

	const startRoute = useMutation(api.routes.startRoute);
	const completeRoute = useMutation(api.routes.completeRoute);
	const setStopStatus = useMutation(api.routes.setStopStatus);
	const copyToDaily = useMutation(api.routes.copyToDaily);
	const seedFromSchedule = useMutation(api.routes.seedFromSchedule);
	const computeRoute = useAction(api.routingActions.computeRoute);
	const searchGas = useAction(api.routingActions.searchGasAlongRoute);

	const [selectedId, setSelectedId] = useState<Id<"routes"> | null>(null);
	const [focusIndex, setFocusIndex] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [googleMaps, setGoogleMaps] = useState(false);
	// Gas pins are only valid for the geometry they were searched against.
	const [gas, setGas] = useState<{
		stations: GasStation[];
		geometry: string;
	} | null>(null);
	const [gasLoading, setGasLoading] = useState(false);

	// One-shot resume: reopen an in-progress run when the screen mounts.
	const [resumed, setResumed] = useState(false);
	if (!resumed && routes !== undefined) {
		const running = routes.find(
			(r) =>
				r.kind === "daily" &&
				r.startedAt !== undefined &&
				r.completedAt === undefined
		);
		if (running) {
			setSelectedId(running._id);
			setFocusIndex(initialFocus(running));
		}
		setResumed(true);
	}

	useEffect(() => {
		// Foreground-only by design (§11): never request background permission.
		Location.requestForegroundPermissionsAsync().catch(() => {});
		let active = true;
		Linking.canOpenURL("comgooglemaps://")
			.then((ok) => {
				if (active) setGoogleMaps(ok);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	const todayMs = utcMsFromDateId(todayDateId());
	const all = routes ?? [];
	const assigneeRank = (r: Doc<"routes">): number =>
		r.assigneeUserId === me?._id ? 0 : r.assigneeUserId === undefined ? 1 : 2;
	const daily = all
		.filter((r) => r.kind === "daily" && r.date === todayMs)
		.sort((a, b) => assigneeRank(a) - assigneeRank(b));
	const saved = all.filter((r) => r.kind !== "daily");

	const selected = all.find((r) => r._id === selectedId) ?? null;
	const running =
		selected !== null &&
		selected.kind === "daily" &&
		selected.startedAt !== undefined &&
		selected.completedAt === undefined;

	const orderedStops = selected ? stopsInOrder(selected.stops) : [];
	const focusedStop =
		focusIndex > 0 ? (orderedStops[focusIndex - 1] ?? null) : null;
	const focus: LngLat | null = focusedStop
		? [focusedStop.longitude, focusedStop.latitude]
		: null;

	const selectRoute = (id: Id<"routes"> | null) => {
		setError(null);
		setGas(null);
		setSelectedId(id);
		setFocusIndex(initialFocus(all.find((r) => r._id === id)));
	};

	const run = async (fn: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await fn();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Something went wrong");
		} finally {
			setBusy(false);
		}
	};

	const onSetStatus = (
		order: number,
		status: "visited" | "skipped" | "pending"
	) =>
		run(async () => {
			if (!selected) return;
			await setStopStatus({ routeId: selected._id, order, status });
			if (running && status !== "pending") {
				// Auto-advance: focus the next pending card, or the overview
				// (which offers Finish) when the day is done.
				const stops = orderedStops.map((s) =>
					s.order === order ? { ...s, status } : s
				);
				const next = nextPendingStop(stops);
				setFocusIndex(
					next
						? stops.findIndex((s) => s.order === next.order) + 1
						: 0
				);
			}
		});

	const onSeedSchedule = () =>
		run(async () => {
			// Daily-singleton assignee rule shared with web: me when the org
			// has >1 member, org-wide otherwise. Divergence targets a
			// different route doc than the one this screen lists.
			const multiMember = (orgUsers?.length ?? 0) > 1;
			const seeded = await seedFromSchedule({
				date: todayMs,
				assigneeUserId: multiMember ? me?._id : undefined,
			});
			setSelectedId(seeded.routeId);
			setFocusIndex(0);
			setGas(null);
			await computeRoute({ routeId: seeded.routeId, optimize: false });
		});

	const onUseToday = () =>
		run(async () => {
			if (!selected) return;
			const dailyId = await copyToDaily({
				routeId: selected._id,
				date: todayMs,
				assigneeUserId: me?._id,
			});
			setSelectedId(dailyId);
			setFocusIndex(0);
			// Fresh copies have no directions yet — compute in stop order.
			await computeRoute({ routeId: dailyId, optimize: false });
		});

	const onToggleGas = () =>
		run(async () => {
			if (!selected?.geometry) return;
			if (gas) {
				setGas(null);
				return;
			}
			setGasLoading(true);
			try {
				const stations = await searchGas({
					routeId: selected._id,
					timeDeviationMinutes: 10,
				});
				setGas({ stations, geometry: selected.geometry });
			} finally {
				setGasLoading(false);
			}
		});

	const onNavigate = (stop: RouteStop, app: "apple" | "google") => {
		const url =
			app === "google"
				? googleMapsUrl(stop.latitude, stop.longitude)
				: appleMapsUrl(stop.latitude, stop.longitude);
		Linking.openURL(url).catch(() => {});
	};

	const openBuilder = (routeId?: Id<"routes">) =>
		router.push({
			pathname: "/route-edit" as never,
			params: routeId ? { routeId } : {},
		});

	const gasStations =
		gas && selected?.geometry === gas.geometry ? gas.stations : undefined;
	// Whole-route handoff (Google only — Apple Maps has no waypoint URL).
	const googleHandoff =
		googleMaps && selected
			? googleMapsRouteUrl(selected.start, selected.stops, selected.roundTrip)
			: null;
	// The band (iPhone) and the pane header (iPad) are both in normal flow and
	// already clear the safe area, so the chips only need a gutter off the map's
	// own top edge.
	const controlsTop = 12;
	// The floating dock takes no layout height — the sheet and the carousel lift
	// clear of it. iPad panes have no dock (the shell replaces Tabs).
	const dockInset = isPane ? 12 : DOCK_CLEARANCE + insets.bottom;

	return (
		<View style={styles.screen}>
			{running ? <KeepAwakeWhileRunning /> : null}
			{/* The band is normal flow (solid, rounded foot) — the map starts
			    BELOW it, so nothing inside the map area offsets by insets.top. */}
			{!isPane ? <InkTabHeader orgChip actions={HEADER_ACTIONS} /> : null}
			<View style={styles.mapArea}>
				<RouteMap
					route={selected}
					following={running && focusIndex === 0}
					focus={focus}
					gasStations={gasStations}
				/>
				{selected ? (
					<View
						style={[styles.controls, { top: controlsTop }]}
						pointerEvents="box-none"
					>
						<FloatChip
							onPress={() => selectRoute(null)}
							label="All routes"
							icon={
								<ChevronLeft
									size={14}
									color={t.ink}
									strokeWidth={2.25}
								/>
							}
						/>
						{selected.geometry !== undefined && premium !== false ? (
							<FloatChip
								onPress={onToggleGas}
								label={
									gasLoading
										? "Gas…"
										: gasStations
											? `Gas (${gasStations.length})`
											: "Gas"
								}
								active={gasStations !== undefined}
								icon={
									<Fuel
										size={13}
										color={gasStations ? "#ffffff" : t.ink}
										strokeWidth={2.25}
									/>
								}
							/>
						) : null}
					</View>
				) : null}
			</View>
			{/* Sheet + carousel stay at the SCREEN root: their bottom math (dock
			    clearance, gorhom snap points) is measured against the full screen. */}
			{selected ? (
				<StopCarousel
					route={selected}
					running={running}
					premium={premium}
					busy={busy}
					error={error}
					googleMaps={googleMaps}
					focusIndex={focusIndex}
					bottomInset={dockInset}
					onFocusChange={setFocusIndex}
					onStart={() =>
						run(async () => {
							if (selected) {
								await startRoute({ routeId: selected._id });
								setFocusIndex(initialFocus({ ...selected, startedAt: Date.now(), completedAt: undefined }));
							}
						})
					}
					onFinish={() =>
						run(async () => {
							if (selected) {
								await completeRoute({ routeId: selected._id });
								setFocusIndex(0);
							}
						})
					}
					onUseToday={onUseToday}
					onCompute={() =>
						run(async () => {
							if (selected) {
								await computeRoute({
									routeId: selected._id,
									optimize: false,
								});
							}
						})
					}
					onEdit={() => selected && openBuilder(selected._id)}
					onSetStatus={onSetStatus}
					onNavigate={onNavigate}
					onSendGoogle={
						googleHandoff
							? () => {
									Linking.openURL(googleHandoff.url).catch(
										() => {}
									);
								}
							: undefined
					}
					sendGoogleNote={
						googleHandoff && googleHandoff.dropped > 0
							? `Google Maps fits the next ${googleHandoff.included} stops — ${googleHandoff.dropped} left off.`
							: null
					}
				/>
			) : (
				<RouteSheet
					daily={daily}
					saved={saved}
					premium={premium}
					busy={busy}
					error={error}
					onSelect={selectRoute}
					onCreate={() => openBuilder()}
					onSeedSchedule={onSeedSchedule}
					bottomInset={dockInset}
				/>
			)}
		</View>
	);
}

function FloatChip({
	label,
	icon,
	onPress,
	active,
}: {
	label: string;
	icon: React.ReactNode;
	onPress: () => void;
	active?: boolean;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => [
				styles.chip,
				{
					backgroundColor: active ? t.primarySolid : t.card,
					borderColor: active ? t.primarySolid : t.border,
					opacity: pressed ? 0.8 : 1,
				},
			]}
		>
			{icon}
			<Text
				style={[styles.chipLabel, { color: active ? "#ffffff" : t.ink }]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

/** Hook holder: keep-awake must only be active while a run is live. */
function KeepAwakeWhileRunning() {
	useKeepAwake();
	return null;
}

/** Pre-P4-build fallback — the old placeholder, with honest copy. */
function RoutesUnavailable({ headerMode }: { headerMode: "root" | "pane" }) {
	const t = useTokens();
	return (
		<View style={[styles.screen, { backgroundColor: t.bg }]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{headerMode !== "pane" ? (
				<InkTabHeader orgChip actions={HEADER_ACTIONS} />
			) : null}
			<View style={styles.fallbackBody}>
				<View style={[styles.mark, { backgroundColor: t.muted }]}>
					<Map size={26} color={t.sub} strokeWidth={2} />
				</View>
				<Text style={[styles.fallbackTitle, { color: t.ink }]}>
					The map needs an app update
				</Text>
				<Text style={[styles.fallbackCopy, { color: t.sub }]}>
					Update OneTool to the latest version to see your routes on
					the map.
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	mapArea: {
		flex: 1,
	},
	controls: {
		position: "absolute",
		left: 16,
		right: 16,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 12,
		height: 34,
		borderRadius: 17,
		borderWidth: 1,
		boxShadow: shadow.floatChip,
	},
	chipLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	fallbackBody: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingHorizontal: 40,
		paddingBottom: 60,
	},
	mark: {
		width: 56,
		height: 56,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	fallbackTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	fallbackCopy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
		textAlign: "center",
	},
});
