import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fuel } from "lucide-react-native";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { MapboxModule } from "@/lib/mapbox";
import {
	boundsFor,
	decodePolyline,
	routeLineFeature,
	stopsInOrder,
	type LngLat,
} from "@/lib/route-run";
import { fontFamily, useTokens } from "@/lib/theme";

// Camera padding keeps the fitted route clear of the floating header (top) and
// the bottom sheet's collapsed snap (bottom).
const FIT_PADDING = {
	paddingTop: 110,
	paddingBottom: 300,
	paddingLeft: 48,
	paddingRight: 48,
};

const STOP_PIN = 26;

export type GasStation = {
	name: string;
	address: string | null;
	latitude: number;
	longitude: number;
};

export function RouteMap({
	route,
	following,
	focus,
	gasStations,
}: {
	route: Doc<"routes"> | null;
	/** Running state: camera tracks the user instead of the fitted route. */
	following: boolean;
	/** A focused stop's coords win over follow/fit (carousel paging). */
	focus?: LngLat | null;
	gasStations?: GasStation[];
}) {
	const t = useTokens();

	// No manual memoization — the React Compiler handles it.
	const line = route?.geometry ? routeLineFeature(route.geometry) : null;
	const coords: LngLat[] = !route
		? []
		: route.geometry
			? decodePolyline(route.geometry, 5)
			: [
					[route.start.longitude, route.start.latitude],
					...route.stops.map((s): LngLat => [s.longitude, s.latitude]),
				];
	const bounds = boundsFor(coords);

	if (!MapboxModule) return null;
	const { MapView, Camera, LocationPuck, ShapeSource, LineLayer, PointAnnotation } =
		MapboxModule;

	const stops = route ? stopsInOrder(route.stops) : [];

	return (
		<MapView
			style={StyleSheet.absoluteFill}
			styleURL="mapbox://styles/mapbox/streets-v12"
			scaleBarEnabled={false}
			logoPosition={{ top: 8, left: 8 }}
			attributionPosition={{ top: 8, right: 8 }}
		>
			<Camera
				followUserLocation={!focus && (following || !route)}
				followZoomLevel={following ? 15 : 12}
				{...(focus
					? {
							centerCoordinate: focus,
							zoomLevel: 13.5,
							animationDuration: 450,
						}
					: !following && bounds
						? {
								bounds: {
									ne: bounds.ne,
									sw: bounds.sw,
									...FIT_PADDING,
								},
								animationDuration: 600,
							}
						: {})}
			/>
			<LocationPuck puckBearing="heading" puckBearingEnabled />
			{line ? (
				<ShapeSource id="route-line" shape={line}>
					{/* Casing under the colored line keeps it legible on busy streets. */}
					<LineLayer
						id="route-line-casing"
						style={{
							lineColor: "#ffffff",
							lineWidth: 7,
							lineCap: "round",
							lineJoin: "round",
						}}
					/>
					<LineLayer
						id="route-line-main"
						style={{
							lineColor: t.primarySolid,
							lineWidth: 4,
							lineCap: "round",
							lineJoin: "round",
						}}
					/>
				</ShapeSource>
			) : null}
			{route ? (
				<PointAnnotation
					id="route-start"
					coordinate={[route.start.longitude, route.start.latitude]}
				>
					<View
						style={[
							styles.pin,
							{ backgroundColor: t.ink, borderColor: "#ffffff" },
						]}
					>
						<Text style={styles.pinLabel}>S</Text>
					</View>
				</PointAnnotation>
			) : null}
			{(gasStations ?? []).map((station, i) => (
				<PointAnnotation
					key={`gas-${i}`}
					id={`gas-${i}`}
					coordinate={[station.longitude, station.latitude]}
				>
					<View
						style={[
							styles.gasPin,
							{ backgroundColor: t.warning, borderColor: "#ffffff" },
						]}
					>
						<Fuel size={11} color="#ffffff" strokeWidth={2.5} />
					</View>
				</PointAnnotation>
			))}
			{stops.map((stop, i) => {
				const visited = stop.status === "visited";
				const skipped = stop.status === "skipped";
				return (
					<PointAnnotation
						key={`stop-${stop.order}`}
						id={`stop-${stop.order}`}
						coordinate={[stop.longitude, stop.latitude]}
					>
						<View
							style={[
								styles.pin,
								{
									backgroundColor: visited
										? t.success
										: skipped
											? t.sub
											: t.primarySolid,
									borderColor: "#ffffff",
									opacity: skipped ? 0.7 : 1,
								},
							]}
						>
							<Text style={styles.pinLabel}>
								{visited ? "✓" : i + 1}
							</Text>
						</View>
					</PointAnnotation>
				);
			})}
		</MapView>
	);
}

const styles = StyleSheet.create({
	pin: {
		width: STOP_PIN,
		height: STOP_PIN,
		borderRadius: STOP_PIN / 2,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	pinLabel: {
		color: "#ffffff",
		fontFamily: fontFamily.semibold,
		fontSize: 12,
	},
	gasPin: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
});
