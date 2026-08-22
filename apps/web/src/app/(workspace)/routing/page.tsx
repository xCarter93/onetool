"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { PermissionGate } from "@/components/domain/permission-gate";
import { EmptyState } from "@/components/domain/empty-state";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { LearnMoreLink } from "@/components/help/learn-more";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/select";
import { todayUtcMidnightMs } from "@/lib/dates";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePublishScreenContext } from "@/components/assistant/use-screen-context";
import { usePublishCurrentRecord } from "@/components/assistant/use-current-record";
import type { AddressData } from "@/components/ui/address-autocomplete";
import { RoutingMap } from "./components/routing-map";
import {
	StopListPanel,
	type GasDeviation,
	type GeocodedProperty,
	type StopDraft,
} from "./components/stop-list-panel";
import {
	CalendarCheck,
	CalendarPlus,
	ChevronDown,
	Plus,
	Trash2,
} from "lucide-react";

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
			taskId: s.taskId,
			projectId: s.projectId,
			status: s.status,
			visitedAt: s.visitedAt,
			label: s.label,
			latitude: s.latitude,
			longitude: s.longitude,
		}));
}

type RoutingView = "today" | "saved";

function RoutingWorkspace() {
	const { allows, isLoading: accessLoading } = useEntitlements();
	// Free-plan soft preview: reads still render, every write/compute path is
	// off. Stays false while entitlements load so business users never flash it.
	const previewOnly = !accessLoading && !allows("routing");
	const toast = useToast();

	const savedRoutes = useQuery(api.routes.list);
	const organization = useQuery(api.organizations.get);
	const propertiesData = useQuery(api.clientProperties.listGeocodedWithClients);
	const currentUser = useQuery(api.users.current);
	const members = useQuery(api.users.listByOrg);

	const createRoute = useMutation(api.routes.create);
	const updateRoute = useMutation(api.routes.update);
	const removeRoute = useMutation(api.routes.remove);
	const seedFromSchedule = useMutation(api.routes.seedFromSchedule);
	const copyToDaily = useMutation(api.routes.copyToDaily);
	const setStopStatus = useMutation(api.routes.setStopStatus);
	const updateTask = useMutation(api.tasks.update);
	const computeRoute = useAction(api.routingActions.computeRoute);
	const searchGas = useAction(api.routingActions.searchGasAlongRoute);

	const [view, setView] = useState<RoutingView>("today");
	// null until members load; then "me" in multi-member orgs, org-wide solo (D3)
	const [assignee, setAssignee] = useState<Id<"users"> | "everyone" | null>(
		null
	);
	const [seeding, setSeeding] = useState(false);
	const [selectedRouteId, setSelectedRouteId] =
		useState<Id<"routes"> | null>(null);
	const [draftName, setDraftName] = useState("");
	const [draftStart, setDraftStart] = useState<StartDraft | null>(null);
	const [draftRoundTrip, setDraftRoundTrip] = useState(true);
	const [draftStops, setDraftStops] = useState<StopDraft[]>([]);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
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

	// Default the assignee once org members load (render-time, runs once)
	if (assignee === null && members !== undefined && currentUser !== undefined) {
		setAssignee(
			members.length > 1 && currentUser ? currentUser._id : "everyone"
		);
	}

	const today = todayUtcMidnightMs();
	const assigneeUserId =
		assignee === null || assignee === "everyone" ? undefined : assignee;
	const dailyRoute = useMemo(
		() =>
			savedRoutes?.find(
				(r) =>
					r.kind === "daily" &&
					r.date === today &&
					r.assigneeUserId === assigneeUserId
			) ?? null,
		[savedRoutes, today, assigneeUserId]
	);
	// Legacy pre-kind rows read as saved
	const savedLibrary = useMemo(
		() => (savedRoutes ?? []).filter((r) => r.kind !== "daily"),
		[savedRoutes]
	);

	// Assistant screen context: view parameters and IDs only, never data
	usePublishScreenContext(() => ({
		routingView: view,
		routeId: selectedRouteId ?? undefined,
		routeKind: selectedRoute ? (selectedRoute.kind ?? "saved") : undefined,
		assigneeUserId,
		hasUnsavedChanges: dirty,
	}));

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

	// "In context" pill in the assistant panel (no record ID in the URL here)
	usePublishCurrentRecord(
		selectedRoute || dirty
			? {
					kindLabel: "Route",
					name: displayName.trim() || "Untitled route",
					status: dirty
						? "unsaved changes"
						: selectedRoute?.kind === "daily"
							? `${displayStops.filter((s) => s.status === "visited").length} of ${displayStops.length} visited`
							: "saved",
				}
			: null
	);

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

	// Keep the Today view pointed at the daily singleton once it loads/changes
	if (
		view === "today" &&
		!dirty &&
		dailyRoute &&
		selectedRouteId !== dailyRoute._id
	) {
		setSelectedRouteId(dailyRoute._id);
	}

	const switchView = (next: RoutingView) => {
		if (next === view) return;
		setView(next);
		if (next === "today" && dailyRoute) {
			selectRoute(dailyRoute._id);
		} else {
			resetToNewRoute();
		}
	};

	const handleAssigneeChange = (value: Id<"users"> | "everyone") => {
		setAssignee(value);
		const nextAssignee = value === "everyone" ? undefined : value;
		const nextDaily = savedRoutes?.find(
			(r) =>
				r.kind === "daily" &&
				r.date === today &&
				r.assigneeUserId === nextAssignee
		);
		if (nextDaily) selectRoute(nextDaily._id);
		else resetToNewRoute();
	};

	const handleSeed = async () => {
		if (previewOnly) return;
		setSeeding(true);
		try {
			const result = await seedFromSchedule({ date: today, assigneeUserId });
			selectRoute(result.routeId);
			const detail = [
				result.skippedNoAddress > 0
					? `${result.skippedNoAddress} skipped (no mapped address)`
					: null,
				result.truncated > 0
					? `${result.truncated} dropped (stop limit)`
					: null,
			]
				.filter(Boolean)
				.join(" · ");
			toast.success(
				`Planned ${result.stopCount} ${result.stopCount === 1 ? "stop" : "stops"} from the schedule`,
				detail || undefined
			);
		} catch (error) {
			toast.error(
				"Couldn't plan from the schedule",
				error instanceof Error ? error.message : undefined
			);
		} finally {
			setSeeding(false);
		}
	};

	const handleUseToday = async () => {
		if (previewOnly || !selectedRouteId) return;
		try {
			const routeId = await copyToDaily({
				routeId: selectedRouteId,
				date: today,
				assigneeUserId,
			});
			setView("today");
			selectRoute(routeId);
			toast.success("Added to today's route");
		} catch (error) {
			toast.error(
				"Couldn't use this route today",
				error instanceof Error ? error.message : undefined
			);
		}
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

	// Persist the current draft (create or update). Returns null when the
	// draft isn't saveable yet; shared by Save and the compute buttons.
	const persistDraft = async (): Promise<Id<"routes"> | null> => {
		if (previewOnly) return null;
		if (!displayStart) {
			toast.warning("Set a start location first");
			return null;
		}
		if (displayStops.length === 0) return null;

		const payload = {
			name: displayName.trim() || "Untitled route",
			start: displayStart,
			roundTrip: displayRoundTrip,
			stops: displayStops.map((s, i) => ({
				propertyId: s.propertyId,
				taskId: s.taskId,
				projectId: s.projectId,
				status: s.status,
				visitedAt: s.visitedAt,
				label: s.label,
				latitude: s.latitude,
				longitude: s.longitude,
				order: i,
			})),
		};

		let routeId = selectedRouteId;
		if (!routeId) {
			routeId = await createRoute({
				...payload,
				kind: view === "today" ? "daily" : "saved",
				date: view === "today" ? today : undefined,
				assigneeUserId: view === "today" ? assigneeUserId : undefined,
			});
			setSelectedRouteId(routeId);
		} else if (dirty) {
			await updateRoute({ routeId, ...payload });
		}
		setDirty(false);
		return routeId;
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const routeId = await persistDraft();
			if (routeId) toast.success("Route saved");
		} catch (error) {
			toast.error(
				"Couldn't save the route",
				error instanceof Error ? error.message : undefined
			);
		} finally {
			setSaving(false);
		}
	};

	const handleDiscard = () => {
		if (selectedRouteId) {
			// Fall back to the saved doc as the display source
			setDirty(false);
			setUnreachableIndices(new Set());
		} else {
			resetToNewRoute();
		}
	};

	const handleStopStatus = async (
		order: number,
		status: "pending" | "visited"
	) => {
		if (previewOnly || !selectedRouteId) return;
		const stop = displayStops[order];
		try {
			await setStopStatus({ routeId: selectedRouteId, order, status });
			if (status === "visited" && stop?.taskId) {
				const taskId = stop.taskId;
				toast.success("Stop marked visited", undefined, {
					action: {
						label: "Mark task done too",
						onClick: () => {
							void updateTask({ id: taskId, status: "completed" });
						},
					},
				});
			}
		} catch (error) {
			toast.error(
				"Couldn't update the stop",
				error instanceof Error ? error.message : undefined
			);
		}
	};

	const handleCompute = async (optimize: boolean) => {
		if (previewOnly) return;
		setComputing(true);
		setUnreachableIndices(new Set());
		try {
			const routeId = await persistDraft();
			if (!routeId) return;

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
				// simplest correct behavior is to re-run the search now. Goes through
				// the shared helper so a gas failure reports itself rather than
				// surfacing as "Route computation failed".
				await fetchGasStations(routeId, gasDeviation, "pending-refresh");
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
		if (previewOnly) return;
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
		if (previewOnly || !selectedRouteId) return;
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

	// Stale gas pins are hidden once the route geometry moves on. Also hidden
	// in preview (a mid-session downgrade flips previewOnly with pins in state).
	const visibleGasStations =
		!previewOnly &&
		!dirty &&
		gasEnabled &&
		(gasForGeometry === selectedRoute?.geometry ||
			gasForGeometry === "pending-refresh")
			? gasStations
			: [];

	const routeGeometry =
		!previewOnly && !dirty && selectedRoute?.geometry
			? selectedRoute.geometry
			: undefined;

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
				<div className="flex flex-wrap items-center gap-2">
					<SegmentedControl<RoutingView>
						value={view}
						onValueChange={switchView}
						options={[
							{ value: "today", label: "Today" },
							{ value: "saved", label: "Saved routes" },
						]}
					/>
					{view === "today" ? (
						<>
							{(members?.length ?? 0) > 1 && (
								<Select<Id<"users"> | "everyone">
									value={assignee ?? "everyone"}
									onValueChange={(value) =>
										handleAssigneeChange(value as Id<"users"> | "everyone")
									}
								>
									<SelectTrigger className="h-8 w-44" aria-label="Route assignee">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(members ?? []).map((member) => (
											<SelectItem key={member._id} value={member._id}>
												{member._id === currentUser?._id
													? "My route"
													: member.name || member.email}
											</SelectItem>
										))}
										<SelectItem value="everyone">Whole team</SelectItem>
									</SelectContent>
								</Select>
							)}
							{!previewOnly && (
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => void handleSeed()}
									disabled={seeding}
								>
									<CalendarPlus className="size-3.5" aria-hidden />
									{seeding
										? "Planning…"
										: dailyRoute
											? "Re-plan from schedule"
											: "Plan from schedule"}
								</Button>
							)}
							{!previewOnly && dailyRoute && selectedRouteId === dailyRoute._id && (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Delete today's route"
									onClick={handleDeleteRoute}
								>
									<Trash2 className="size-4" aria-hidden />
								</Button>
							)}
						</>
					) : (
						<>
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
									{savedLibrary.length === 0 ? (
										<DropdownMenuItem disabled>
											No saved routes yet
										</DropdownMenuItem>
									) : (
										savedLibrary.map((route) => (
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
							{!previewOnly && selectedRouteId && !dirty && (
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => void handleUseToday()}
								>
									<CalendarCheck className="size-3.5" aria-hidden />
									Use today
								</Button>
							)}
							{!previewOnly && (
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={resetToNewRoute}
								>
									<Plus className="size-3.5" aria-hidden />
									New route
								</Button>
							)}
							{!previewOnly && selectedRouteId && (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Delete route"
									onClick={handleDeleteRoute}
								>
									<Trash2 className="size-4" aria-hidden />
								</Button>
							)}
						</>
					)}
				</div>
			</div>

			{/* Today with no route yet: offer the two on-ramps instead of the editor */}
			{view === "today" && !dailyRoute && !dirty ? (
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<EmptyState
						illustration="route-none"
						illustrationSize="hero"
						title="No route for today yet"
						description={
							previewOnly
								? "Optimized routing is part of the Business plan. Upgrade to build a route from today's schedule."
								: "Build one from today's scheduled tasks and projects, or reuse a saved route."
						}
						action={
							<div className="flex flex-col items-center gap-2">
								<div className="flex items-center gap-2">
									{previewOnly ? (
										<Button
											size="sm"
											render={<Link href="/organization/profile?tab=billing" />}
										>
											View plans
										</Button>
									) : (
										<Button
											size="sm"
											className="gap-1.5"
											onClick={() => void handleSeed()}
											disabled={seeding}
										>
											<CalendarPlus className="size-3.5" aria-hidden />
											{seeding ? "Planning…" : "Plan from schedule"}
										</Button>
									)}
									<Button
										variant="outline"
										size="sm"
										onClick={() => switchView("saved")}
									>
										Browse saved routes
									</Button>
								</div>
								{previewOnly && (
									<LearnMoreLink
										article="routing/planning-a-route"
										label="Learn how routing works"
									/>
								)}
							</div>
						}
						size="md"
					/>
				</div>
			) : (
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
						routeKind={
							selectedRoute
								? selectedRoute.kind === "daily"
									? "daily"
									: "saved"
								: null
						}
						dirty={dirty}
						saving={saving}
						onSave={() => void handleSave()}
						onDiscard={handleDiscard}
						onStopStatusChange={
							!previewOnly && !dirty && selectedRoute?.kind === "daily"
								? (order, status) => void handleStopStatus(order, status)
								: null
						}
						computing={computing}
						onCompute={(optimize) => void handleCompute(optimize)}
						gasEnabled={gasEnabled}
						onGasToggle={handleGasToggle}
						gasDeviation={gasDeviation}
						onGasDeviationChange={handleGasDeviationChange}
						gasLoading={gasLoading}
						gasCount={visibleGasStations.length}
						previewOnly={previewOnly}
					/>
				</div>
				<div className="min-h-[420px] flex-1">
					<RoutingMap
						start={displayStart}
						stops={displayStops}
						geometry={routeGeometry}
						gasStations={visibleGasStations}
						unreachableIndices={unreachableIndices}
						previewOnly={previewOnly}
					/>
				</div>
			</div>
			)}
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
