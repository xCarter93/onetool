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
import { EmptyState } from "@/components/domain/empty-state";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Badge } from "@/components/reui/badge";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";

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
	const isOrgSwitching = useIsOrgSwitching();
	const propertiesData = useQuery(api.clientProperties.listGeocodedWithClients);
	const [selectedProperty, setSelectedProperty] =
		useState<PropertyDetails | null>(null);

	const isLoading = isOrgSwitching || propertiesData === undefined;
	const properties = useMemo(
		() => propertiesData?.properties ?? [],
		[propertiesData]
	);
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

	return (
		<Frame className={cn("h-full w-full", className)}>
			<FramePanel className="flex h-full flex-col gap-3">
				{/* Header */}
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Client Locations
					</h3>
					{!isLoading && totalCount > 0 && (
						<Badge variant="primary-light" size="sm" className="gap-1">
							<MapPin className="size-3" aria-hidden />
							{geocodedCount} of {totalCount} mapped
						</Badge>
					)}
				</div>

				{/* Map surface */}
				<div className="relative min-h-[300px] flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
					{isLoading ? (
						<div
							className="absolute inset-0 flex items-center justify-center"
							role="status"
							aria-live="polite"
							aria-label="Loading client locations"
						>
							<div className="flex gap-1">
								<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
								<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
								<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
							</div>
						</div>
					) : (
						<>
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
									clusterColors={["#38bdf8", "#0ea5e9", "#0284c7"]}
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

							{/* Empty State */}
							{properties.length === 0 && (
								<div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
									<EmptyState
										illustration="client-properties-none"
										title="No properties mapped"
										description="Add addresses to client properties to see them here."
										size="sm"
									/>
								</div>
							)}
						</>
					)}
				</div>
			</FramePanel>
		</Frame>
	);
}
