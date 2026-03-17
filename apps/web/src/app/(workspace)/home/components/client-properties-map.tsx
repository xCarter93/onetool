"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Map,
	MapClusterLayer,
	MapControls,
	useMap,
} from "@/components/ui/map";
import { MapDetailSidebar } from "./map-detail-sidebar";
import type { PropertyDetails } from "./map-detail-sidebar";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientPropertiesMapProps = {
	className?: string;
};

function MapBoundsHandler({
	properties,
}: {
	properties: Array<{ latitude: number; longitude: number }>;
}) {
	const { map, isLoaded } = useMap();
	const hasFitted = useRef(false);

	useEffect(() => {
		if (!map || !isLoaded || hasFitted.current || properties.length === 0)
			return;

		// Calculate bounds
		const lngs = properties.map((p) => p.longitude);
		const lats = properties.map((p) => p.latitude);

		const minLng = Math.min(...lngs);
		const maxLng = Math.max(...lngs);
		const minLat = Math.min(...lats);
		const maxLat = Math.max(...lats);

		// Add padding
		const padding = 50;

		if (properties.length === 1) {
			// Single property - center on it with zoom (further out)
			map.flyTo({
				center: [properties[0].longitude, properties[0].latitude],
				zoom: 11,
				duration: 1000,
			});
		} else {
			// Multiple properties - fit bounds with lower max zoom
			map.fitBounds(
				[
					[minLng, minLat],
					[maxLng, maxLat],
				],
				{
					padding,
					duration: 1000,
					maxZoom: 12,
				}
			);
		}

		hasFitted.current = true;
	}, [map, isLoaded, properties]);

	return null;
}

export default function ClientPropertiesMap({
	className,
}: ClientPropertiesMapProps) {
	const propertiesData = useQuery(api.clientProperties.listGeocodedWithClients);
	const [selectedProperty, setSelectedProperty] =
		useState<PropertyDetails | null>(null);

	const isLoading = propertiesData === undefined;
	const properties = propertiesData?.properties ?? [];
	const totalCount = propertiesData?.totalCount ?? 0;
	const geocodedCount = propertiesData?.geocodedCount ?? 0;

	// Calculate center from properties or use default
	const defaultCenter = useMemo(() => {
		if (properties.length === 0) {
			return { lng: -98.5795, lat: 39.8283 }; // Center of US
		}
		const avgLng =
			properties.reduce((sum, p) => sum + p.longitude, 0) / properties.length;
		const avgLat =
			properties.reduce((sum, p) => sum + p.latitude, 0) / properties.length;
		return { lng: avgLng, lat: avgLat };
	}, [properties]);

	// Convert properties to GeoJSON FeatureCollection for clustering
	const geojsonData = useMemo(
		() => ({
			type: "FeatureCollection" as const,
			features: properties.map((p) => ({
				type: "Feature" as const,
				geometry: {
					type: "Point" as const,
					coordinates: [p.longitude, p.latitude] as [number, number],
				},
				properties: {
					id: p._id,
					clientId: p.clientId,
					clientCompanyName: p.clientCompanyName,
					address:
						p.formattedAddress ||
						`${p.streetAddress}, ${p.city}, ${p.state} ${p.zipCode}`,
					propertyName: p.propertyName,
				},
			})),
		}),
		[properties]
	);

	if (isLoading) {
		return (
			<div
				className={cn(
					"absolute inset-0 rounded-none overflow-hidden flex items-center justify-center",
					className
				)}
			>
				<div className="flex gap-1">
					<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
					<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
					<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"absolute inset-0 rounded-none overflow-hidden",
				className
			)}
		>
			<Map
				center={[defaultCenter.lng, defaultCenter.lat]}
				zoom={properties.length === 0 ? 4 : 6}
				scrollZoom={false}
			>
				<MapBoundsHandler properties={properties} />
				<MapControls position="bottom-right" showZoom />

				<MapClusterLayer
					data={geojsonData}
					clusterMaxZoom={14}
					clusterRadius={50}
					clusterColors={[
						"#38bdf8",
						"#0ea5e9",
						"#0284c7",
					]}
					clusterThresholds={[10, 50]}
					pointColor="#0ea5e9"
					onPointClick={(feature) => {
						setSelectedProperty({
							id: feature.properties.id,
							clientId: feature.properties.clientId,
							clientCompanyName: feature.properties.clientCompanyName,
							address: feature.properties.address,
							propertyName: feature.properties.propertyName,
						});
					}}
				/>
			</Map>

			{/* Detail Sidebar */}
			<MapDetailSidebar
				property={selectedProperty}
				onClose={() => setSelectedProperty(null)}
			/>

			{/* Stats Overlay */}
			<div className="absolute top-3 left-3 z-10">
				<div className="bg-background/90 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-sm">
					<div className="flex items-center gap-2">
						<MapPin className="h-4 w-4 text-primary" />
						<span className="text-sm font-medium">
							{geocodedCount} of {totalCount} properties mapped
						</span>
					</div>
				</div>
			</div>

			{/* Empty State */}
			{properties.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="text-center space-y-2">
						<MapPin className="h-8 w-8 text-muted-foreground mx-auto" />
						<p className="text-sm text-muted-foreground font-medium">
							No properties mapped
						</p>
						<p className="text-xs text-muted-foreground/70">
							Add addresses to client properties to see them here.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
