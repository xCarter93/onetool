"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { PermissionGate } from "@/components/domain/permission-gate";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import type { AddressData } from "@/components/ui/address-autocomplete";
import { RoutingMap } from "./components/routing-map";
import {
	StopListPanel,
	type GasDeviation,
	type GeocodedProperty,
	type StopDraft,
} from "./components/stop-list-panel";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

type StartDraft = {
	kind: "org" | "manual";
	label: string;
	latitude: number;
	longitude: number;
};

type GasStation = {
	name: string;
	address: string | null;
	latitude: number;
	longitude: number;
};

function stopsFromRoute(route: Doc<"routes">): StopDraft[] {
	return [...route.stops]
		.sort((a, b) => a.order - b.order)
		.map((s, i) => ({
			key: `${s.propertyId ?? `${s.latitude},${s.longitude}`}-${i}`,
			propertyId: s.propertyId,
			label: s.label,
			latitude: s.latitude,
			longitude: s.longitude,
		}));
}

function RoutingWorkspace() {
	const { hasPremiumAccess, isLoading: accessLoading } = useFeatureAccess();
	const toast = useToast();

	const savedRoutes = useQuery(api.routes.list);
	const organization = useQuery(api.organizations.get);
	const propertiesData = useQuery(api.clientProperties.listGeocodedWithClients);

	const createRoute = useMutation(api.routes.create);
	const updateRoute = useMutation(api.routes.update);
	const removeRoute = useMutation(api.routes.remove);
	const computeRoute = useAction(api.routingActions.computeRoute);
	const searchGas = useAction(api.routingActions.searchGasAlongRoute);

	const [selectedRouteId, setSelectedRouteId] =
		useState<Id<"routes"> | null>(null);
	const [draftName, setDraftName] = useState("");
	const [draftStart, setDraftStart] = useState<StartDraft | null>(null);
	const [draftRoundTrip, setDraftRoundTrip] = useState(true);
	const [draftStops, setDraftStops] = useState<StopDraft[]>([]);
	const [dirty, setDirty] = useState(false);
	const [computing, setComputing] = useState(false);
	// Positions (display order) of stops the last compute flagged as
	// unreachable by road. Index-based because stop keys regenerate when the
	// draft/saved views swap; a failed compute never reorders stops.
	const [unreachableIndices, setUnreachableIndices] = useState<
		ReadonlySet<number>
	>(new Set());

	const [gasEnabled, setGasEnabled] = useState(false);
	const [gasDeviation, setGasDeviation] = useState<GasDeviation>("10");
	const [gasLoading, setGasLoading] = useState(false);
	const [gasStations, setGasStations] = useState<GasStation[]>([]);
	// Geometry the current gas results belong to; hides stale pins after edits.
	const [gasForGeometry, setGasForGeometry] = useState<string | null>(null);

	const selectedRoute = useMemo(
		() => savedRoutes?.find((r) => r._id === selectedRouteId) ?? null,
		[savedRoutes, selectedRouteId]
	);

	const orgStart: StartDraft | null = useMemo(() => {
		if (organization?.latitude == null || organization.longitude == null) {
			return null;
		}
		const label =
			[organization.addressStreet, organization.addressCity]
				.filter(Boolean)
				.join(", ") ||
			organization.name ||
			"Business address";
		return {
			kind: "org",
			label,
			latitude: organization.latitude,
			longitude: organization.longitude,
		};
	}, [organization]);

	// Saved doc is the display source until the user edits (dirty).
	const displayStops =
		!dirty && selectedRoute ? stopsFromRoute(selectedRoute) : draftStops;
	const displayStart =
		!dirty && selectedRoute
			? (selectedRoute.start as StartDraft)
			: (draftStart ?? orgStart);
	const displayRoundTrip =
		!dirty && selectedRoute ? selectedRoute.roundTrip : draftRoundTrip;
	const displayName = !dirty && selectedRoute ? selectedRoute.name : draftName;

	const properties: GeocodedProperty[] = useMemo(
		() =>
			(propertiesData?.properties ?? []).flatMap((p) =>
				p.latitude != null && p.longitude != null
					? [
							{
								_id: p._id,
								clientCompanyName: p.clientCompanyName,
								propertyName: p.propertyName ?? undefined,
								streetAddress: p.streetAddress,
								city: p.city,
								state: p.state,
								zipCode: p.zipCode,
								formattedAddress: p.formattedAddress ?? undefined,
								latitude: p.latitude,
								longitude: p.longitude,
							},
						]
					: []
			),
		[propertiesData]
	);

	// Editing helpers: snapshot current display values into the draft, apply
	// the change, and mark dirty — so edits on a saved route fork from it.
	const beginEdit = useCallback(() => {
		if (!dirty) {
			setDraftName(displayName);
			setDraftStart(displayStart);
			setDraftRoundTrip(displayRoundTrip);
			setDraftStops(displayStops);
			setDirty(true);
		}
	}, [dirty, displayName, displayStart, displayRoundTrip, displayStops]);

	const editStops = (stops: StopDraft[]) => {
		beginEdit();
		setDraftStops(stops);
		setDirty(true);
		setUnreachableIndices(new Set());
	};

	const resetToNewRoute = () => {
		setSelectedRouteId(null);
		setDraftName("");
		setDraftStart(null);
		setDraftRoundTrip(true);
		setDraftStops([]);
		setDirty(false);
		setUnreachableIndices(new Set());
		setGasEnabled(false);
		setGasStations([]);
		setGasForGeometry(null);
	};

	const selectRoute = (routeId: Id<"routes">) => {
		setSelectedRouteId(routeId);
		setDirty(false);
		setUnreachableIndices(new Set());
		setGasEnabled(false);
		setGasStations([]);
		setGasForGeometry(null);
	};

	const fetchGasStations = useCallback(
		async (
			routeId: Id<"routes">,
			deviation: GasDeviation,
			geometry: string
		) => {
			setGasLoading(true);
			try {
				const stations = await searchGas({
					routeId,
					timeDeviationMinutes: Number(deviation) as 5 | 10 | 15,
				});
				setGasStations(stations);
				setGasForGeometry(geometry);
			} catch (error) {
				toast.error(
					"Gas station search failed",
					error instanceof Error ? error.message : undefined
				);
				setGasEnabled(false);
			} finally {
				setGasLoading(false);
			}
		},
		[searchGas, toast]
	);

	const handleCompute = async (optimize: boolean) => {
		if (!displayStart) {
			toast.warning("Set a start location first");
			return;
		}
		if (displayStops.length === 0) return;

		setComputing(true);
		setUnreachableIndices(new Set());
		try {
			const payload = {
				name: displayName.trim() || "Untitled route",
				start: displayStart,
				roundTrip: displayRoundTrip,
				stops: displayStops.map((s, i) => ({
					propertyId: s.propertyId,
					label: s.label,
					latitude: s.latitude,
					longitude: s.longitude,
					order: i,
				})),
			};

			let routeId = selectedRouteId;
			if (!routeId) {
				routeId = await createRoute(payload);
				setSelectedRouteId(routeId);
			} else if (dirty) {
				await updateRoute({ routeId, ...payload });
			}
			setDirty(false);

			const result = await computeRoute({ routeId, optimize });
			if (!result.applied) {
				toast.warning(
					"Route changed while computing",
					"The result was discarded. Try again."
				);
				return;
			}

			if (gasEnabled) {
				// Refresh gas results for the new geometry once the doc updates;
				// simplest correct behavior is to re-run the search now.
				const fresh = await searchGas({
					routeId,
					timeDeviationMinutes: Number(gasDeviation) as 5 | 10 | 15,
				});
				setGasStations(fresh);
				setGasForGeometry("pending-refresh");
			}
		} catch (error) {
			const data =
				error instanceof ConvexError
					? (error.data as { code?: string; stopIndices?: number[] })
					: null;
			if (data?.code === "unreachable_stops" && data.stopIndices) {
				// Indices refer to the order-sorted stops, which is display order.
				setUnreachableIndices(new Set(data.stopIndices));
				toast.error(
					"Some stops can't be reached by road",
					"They're flagged in the stop list — remove them or fix their addresses, then recompute."
				);
				return;
			}
			toast.error(
				"Route computation failed",
				error instanceof Error ? error.message : undefined
			);
		} finally {
			setComputing(false);
		}
	};

	const handleGasToggle = (enabled: boolean) => {
		setGasEnabled(enabled);
		if (!enabled) {
			setGasStations([]);
			setGasForGeometry(null);
			return;
		}
		if (selectedRouteId && selectedRoute?.geometry) {
			void fetchGasStations(
				selectedRouteId,
				gasDeviation,
				selectedRoute.geometry
			);
		}
	};

	const handleGasDeviationChange = (deviation: GasDeviation) => {
		setGasDeviation(deviation);
		if (gasEnabled && selectedRouteId && selectedRoute?.geometry) {
			void fetchGasStations(
				selectedRouteId,
				deviation,
				selectedRoute.geometry
			);
		}
	};

	const handleDeleteRoute = async () => {
		if (!selectedRouteId) return;
		try {
			await removeRoute({ routeId: selectedRouteId });
			resetToNewRoute();
			toast.success("Route deleted");
		} catch (error) {
			toast.error(
				"Could not delete route",
				error instanceof Error ? error.message : undefined
			);
		}
	};

	// Stale gas pins are hidden once the route geometry moves on.
	const visibleGasStations =
		!dirty &&
		gasEnabled &&
		(gasForGeometry === selectedRoute?.geometry ||
			gasForGeometry === "pending-refresh")
			? gasStations
			: [];

	const routeGeometry =
		!dirty && selectedRoute?.geometry ? selectedRoute.geometry : undefined;

	if (!accessLoading && !hasPremiumAccess) {
		return (
			<div className="flex h-full min-h-[60vh] items-center justify-center p-6">
				<EmptyState
					illustration="access-restricted"
					title="Routing is a Business plan feature"
					description="Plan optimized multi-stop routes between client properties with the Business plan."
					action={
						<Button
							size="sm"
							render={<Link href="/organization/profile?tab=billing" />}
						>
							View plans
						</Button>
					}
					size="md"
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 p-6">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="h-6 w-1.5 rounded-full bg-linear-to-b from-primary to-primary/60" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Routing</h1>
						<p className="text-sm text-muted-foreground">
							Plan the most efficient route between your stops
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="outline" size="sm" className="gap-1.5">
									{selectedRoute ? selectedRoute.name : "Saved routes"}
									<ChevronDown className="size-3.5" aria-hidden />
								</Button>
							}
						/>
						<DropdownMenuContent align="end" className="min-w-56">
							{(savedRoutes ?? []).length === 0 ? (
								<DropdownMenuItem disabled>
									No saved routes yet
								</DropdownMenuItem>
							) : (
								(savedRoutes ?? []).map((route) => (
									<DropdownMenuItem
										key={route._id}
										onClick={() => selectRoute(route._id)}
									>
										{route.name}
									</DropdownMenuItem>
								))
							)}
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={resetToNewRoute}
					>
						<Plus className="size-3.5" aria-hidden />
						New route
					</Button>
					{selectedRouteId && (
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Delete route"
							onClick={handleDeleteRoute}
						>
							<Trash2 className="size-4" aria-hidden />
						</Button>
					)}
				</div>
			</div>

			{/* Workspace: panel + map */}
			<div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
				<div className="w-full shrink-0 rounded-xl border border-border bg-background lg:w-[26rem] lg:overflow-hidden">
					<StopListPanel
						name={displayName}
						onNameChange={(name) => {
							beginEdit();
							setDraftName(name);
							setDirty(true);
						}}
						startLabel={displayStart?.label ?? null}
						onUseOrgStart={
							orgStart
								? () => {
										beginEdit();
										setDraftStart(orgStart);
										setDirty(true);
									}
								: null
						}
						onManualStart={(address: AddressData) => {
							beginEdit();
							setDraftStart({
								kind: "manual",
								label:
									address.formattedAddress ||
									`${address.streetAddress}, ${address.city}`,
								latitude: address.latitude!,
								longitude: address.longitude!,
							});
							setDirty(true);
						}}
						roundTrip={displayRoundTrip}
						onRoundTripChange={(roundTrip) => {
							beginEdit();
							setDraftRoundTrip(roundTrip);
							setDirty(true);
						}}
						stops={displayStops}
						onStopsChange={editStops}
						unreachableIndices={unreachableIndices}
						properties={properties}
						route={dirty ? null : selectedRoute}
						dirty={dirty}
						computing={computing}
						onCompute={(optimize) => void handleCompute(optimize)}
						gasEnabled={gasEnabled}
						onGasToggle={handleGasToggle}
						gasDeviation={gasDeviation}
						onGasDeviationChange={handleGasDeviationChange}
						gasLoading={gasLoading}
						gasCount={visibleGasStations.length}
					/>
				</div>
				<div className="min-h-[420px] flex-1">
					<RoutingMap
						start={displayStart}
						stops={displayStops}
						geometry={routeGeometry}
						gasStations={visibleGasStations}
						unreachableIndices={unreachableIndices}
					/>
				</div>
			</div>
		</div>
	);
}

export default function RoutingPage() {
	return (
		<PermissionGate object="clients" level="view">
			<RoutingWorkspace />
		</PermissionGate>
	);
}
