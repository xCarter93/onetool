"use client";

import { useEffect, useMemo, useRef } from "react";
import {
	Map,
	MapControls,
	MapMarker,
	MarkerContent,
	MapRoute,
	useMap,
} from "@/components/ui/map";
import { env } from "@/env";
import { useMediaQuery } from "@/hooks/use-media-query";
import { decodePolyline } from "@/lib/polyline";
import { cn } from "@/lib/utils";
import { Fuel } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";

// Mapbox basemap (not the app-wide CARTO default): route data comes from
// Mapbox APIs, whose terms expect display on Mapbox maps. Served as Static
// Tiles raster — MapLibre cannot resolve the mapbox:// refs inside Mapbox
// vector styles.
function mapboxRasterStyle(styleId: string): StyleSpecification {
	return {
		version: 8,
		sources: {
			"mapbox-tiles": {
				type: "raster",
				tiles: [
					`https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/512/{z}/{x}/{y}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_API_KEY}`,
				],
				tileSize: 512,
				attribution:
					'© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			},
		},
		layers: [{ id: "basemap", type: "raster", source: "mapbox-tiles" }],
	};
}

const MAPBOX_STYLES = {
	light: mapboxRasterStyle("streets-v12"),
	dark: mapboxRasterStyle("dark-v11"),
};

export type MapStop = {
	key: string;
	label: string;
	latitude: number;
	longitude: number;
};

export type MapGasStation = {
	name: string;
	address: string | null;
	latitude: number;
	longitude: number;
};

type RoutingMapProps = {
	start: { latitude: number; longitude: number; label: string } | null;
	stops: MapStop[];
	geometry?: string;
	gasStations: MapGasStation[];
	/** Positions of stops the road network can't reach; alert markers. */
	unreachableIndices?: ReadonlySet<number>;
	className?: string;
};

function MapBoundsHandler({
	points,
}: {
	points: Array<{ latitude: number; longitude: number }>;
}) {
	const { map, isLoaded } = useMap();
	const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
	const duration = reducedMotion ? 0 : 800;
	// Refit whenever the point set changes (stops added/removed, route loaded).
	const signature = points
		.map((p) => `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`)
		.join(";");
	const lastSignature = useRef<string>("");

	useEffect(() => {
		if (!map || !isLoaded || points.length === 0) return;
		if (signature === lastSignature.current) return;
		lastSignature.current = signature;

		if (points.length === 1) {
			map.flyTo({
				center: [points[0].longitude, points[0].latitude],
				zoom: 11,
				duration,
			});
			return;
		}
		const lngs = points.map((p) => p.longitude);
		const lats = points.map((p) => p.latitude);
		map.fitBounds(
			[
				[Math.min(...lngs), Math.min(...lats)],
				[Math.max(...lngs), Math.max(...lats)],
			],
			{ padding: 80, duration, maxZoom: 13 }
		);
	}, [map, isLoaded, points, signature, duration]);

	return null;
}

export function RoutingMap({
	start,
	stops,
	geometry,
	gasStations,
	unreachableIndices,
	className,
}: RoutingMapProps) {
	const routeCoordinates = useMemo(
		() => (geometry ? decodePolyline(geometry) : []),
		[geometry]
	);

	const boundsPoints = useMemo(() => {
		const pts: Array<{ latitude: number; longitude: number }> = [];
		if (start) pts.push(start);
		pts.push(...stops);
		return pts;
	}, [start, stops]);

	return (
		<div
			className={cn(
				"relative h-full w-full overflow-hidden rounded-xl border border-border",
				className
			)}
		>
			<Map
				center={
					start
						? [start.longitude, start.latitude]
						: [-98.5795, 39.8283]
				}
				zoom={start ? 10 : 4}
				styles={MAPBOX_STYLES}
			>
				<MapBoundsHandler points={boundsPoints} />
				<MapControls position="bottom-right" showZoom />

				{routeCoordinates.length >= 2 && (
					<MapRoute
						id="planned-route"
						coordinates={routeCoordinates}
						color="#0ea5e9"
						width={4}
						opacity={0.85}
						interactive={false}
					/>
				)}

				{start && (
					<MapMarker
						longitude={start.longitude}
						latitude={start.latitude}
					>
						<MarkerContent>
							<div
								className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-[10px] font-bold text-white shadow-md"
								title={start.label}
							>
								S
							</div>
						</MarkerContent>
					</MapMarker>
				)}

				{stops.map((stop, index) => (
					<MapMarker
						key={stop.key}
						longitude={stop.longitude}
						latitude={stop.latitude}
					>
						<MarkerContent>
							<div
								className={cn(
									"flex size-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md",
									unreachableIndices?.has(index)
										? "bg-destructive"
										: "bg-sky-600"
								)}
								title={
									unreachableIndices?.has(index)
										? `${stop.label} — unreachable by road`
										: stop.label
								}
							>
								{index + 1}
							</div>
						</MarkerContent>
					</MapMarker>
				))}

				{gasStations.map((station, i) => (
					<MapMarker
						key={`gas-${i}-${station.longitude}-${station.latitude}`}
						longitude={station.longitude}
						latitude={station.latitude}
					>
						<MarkerContent>
							<div
								className="flex size-6 items-center justify-center rounded-full border border-white bg-amber-500 text-white shadow"
								title={`${station.name}${station.address ? ` — ${station.address}` : ""}`}
							>
								<Fuel className="size-3.5" aria-hidden />
							</div>
						</MarkerContent>
					</MapMarker>
				))}
			</Map>
		</div>
	);
}
