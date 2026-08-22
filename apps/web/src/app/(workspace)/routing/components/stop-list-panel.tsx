"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/reui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
import { ListProvider } from "@/components/shared/sortable-list";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { cn } from "@/lib/utils";
import {
	Bookmark,
	Building2,
	CalendarCheck,
	Check,
	Fuel,
	Loader2,
	Lock,
	MapPin,
	Plus,
	Sparkles,
	X,
} from "lucide-react";

export type StopDraft = {
	/** dnd + React key; stable per row */
	key: string;
	propertyId?: Id<"clientProperties">;
	// Passthrough fields (daily routes): preserved on save, never edited here
	taskId?: Id<"tasks">;
	projectId?: Id<"projects">;
	status?: "pending" | "visited" | "skipped";
	visitedAt?: number;
	label: string;
	latitude: number;
	longitude: number;
};

export type GeocodedProperty = {
	_id: Id<"clientProperties">;
	clientCompanyName?: string;
	propertyName?: string;
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	formattedAddress?: string;
	latitude: number;
	longitude: number;
};

export type GasDeviation = "5" | "10" | "15";

type StopListPanelProps = {
	name: string;
	onNameChange: (name: string) => void;
	startLabel: string | null;
	onUseOrgStart: (() => void) | null;
	onManualStart: (address: AddressData) => void;
	roundTrip: boolean;
	onRoundTripChange: (roundTrip: boolean) => void;
	stops: StopDraft[];
	onStopsChange: (stops: StopDraft[]) => void;
	/** Positions of stops the last compute flagged as unreachable by road. */
	unreachableIndices: ReadonlySet<number>;
	properties: GeocodedProperty[];
	route: Doc<"routes"> | null;
	/** Kind of the selected persisted route; null when building a new one. */
	routeKind: "daily" | "saved" | null;
	dirty: boolean;
	saving: boolean;
	onSave: () => void;
	onDiscard: () => void;
	/** Daily-route check-off; null hides the control (saved routes, dirty drafts). */
	onStopStatusChange:
		| ((order: number, status: "pending" | "visited") => void)
		| null;
	computing: boolean;
	onCompute: (optimize: boolean) => void;
	gasEnabled: boolean;
	onGasToggle: (enabled: boolean) => void;
	gasDeviation: GasDeviation;
	onGasDeviationChange: (deviation: GasDeviation) => void;
	gasLoading: boolean;
	gasCount: number | null;
	/** Free-plan soft preview: reads render, every write/compute path is off. */
	previewOnly: boolean;
};

function formatDistance(meters: number): string {
	return `${(meters / 1609.344).toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return `${hours} hr ${minutes % 60} min`;
}

function propertyDisplayAddress(p: GeocodedProperty): string {
	return (
		p.formattedAddress ?? `${p.streetAddress}, ${p.city}, ${p.state} ${p.zipCode}`
	);
}

function PropertyPicker({
	properties,
	usedPropertyIds,
	onPick,
}: {
	properties: GeocodedProperty[];
	usedPropertyIds: Set<string>;
	onPick: (property: GeocodedProperty) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const available = properties.filter((p) => !usedPropertyIds.has(p._id));
		const q = search.trim().toLowerCase();
		if (!q) return available;
		return available.filter((p) =>
			[p.clientCompanyName, p.propertyName, propertyDisplayAddress(p)]
				.filter(Boolean)
				.some((s) => s!.toLowerCase().includes(q))
		);
	}, [properties, usedPropertyIds, search]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" className="gap-1.5">
						<Building2 className="size-3.5" aria-hidden />
						Client property
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-80 p-2">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search properties…"
					className="mb-2 h-8"
					autoFocus
				/>
				<div className="max-h-64 space-y-0.5 overflow-y-auto">
					{filtered.length === 0 ? (
						<p className="px-2 py-4 text-center text-xs text-muted-foreground">
							{properties.length === 0
								? "No geocoded properties yet. Add addresses to client properties first."
								: "No matching properties."}
						</p>
					) : (
						filtered.map((p) => (
							<button
								key={p._id}
								type="button"
								className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
								onClick={() => {
									onPick(p);
									setOpen(false);
									setSearch("");
								}}
							>
								<span className="block truncate text-sm font-medium">
									{p.propertyName ?? p.clientCompanyName ?? "Property"}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{p.clientCompanyName && p.propertyName
										? `${p.clientCompanyName} · `
										: ""}
									{propertyDisplayAddress(p)}
								</span>
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Inline (not popover-wrapped) address entry: the Mapbox autofill suggestion
 * list portals outside a popover, so clicking a suggestion would dismiss it
 * before the selection lands.
 */
function InlineAddressEntry({
	label,
	onSelect,
	onCancel,
}: {
	label: string;
	onSelect: (address: AddressData) => boolean;
	onCancel: () => void;
}) {
	const [value, setValue] = useState("");
	const [noCoordinates, setNoCoordinates] = useState(false);

	return (
		<div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
			<div className="flex items-center justify-between">
				<Label className="text-xs">{label}</Label>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Cancel"
					onClick={onCancel}
				>
					<X className="size-3.5" aria-hidden />
				</Button>
			</div>
			<AddressAutocomplete
				value={value}
				onChange={(v) => {
					setValue(v);
					setNoCoordinates(false);
				}}
				onAddressSelect={(address) => {
					const added = onSelect(address);
					if (added) {
						setValue("");
					} else {
						setNoCoordinates(true);
					}
				}}
				placeholder="Start typing an address…"
			/>
			{noCoordinates && (
				<p className="text-xs text-destructive">
					Couldn&apos;t pin that address on the map — try a more specific
					address.
				</p>
			)}
		</div>
	);
}

export function StopListPanel({
	name,
	onNameChange,
	startLabel,
	onUseOrgStart,
	onManualStart,
	roundTrip,
	onRoundTripChange,
	stops,
	onStopsChange,
	unreachableIndices,
	properties,
	route,
	routeKind,
	dirty,
	saving,
	onSave,
	onDiscard,
	onStopStatusChange,
	computing,
	onCompute,
	gasEnabled,
	onGasToggle,
	gasDeviation,
	onGasDeviationChange,
	gasLoading,
	gasCount,
	previewOnly,
}: StopListPanelProps) {
	const [entryMode, setEntryMode] = useState<null | "start" | "stop">(null);

	const usedPropertyIds = useMemo(
		() => new Set(stops.flatMap((s) => (s.propertyId ? [s.propertyId] : []))),
		[stops]
	);

	const hasComputedResult = !previewOnly && !dirty && route?.geometry != null;
	const legs = hasComputedResult ? (route?.legs ?? null) : null;

	const sortableItems = useMemo(
		() => stops.map((s) => ({ ...s, id: s.key })),
		[stops]
	);

	const renderStopRow = (
		item: StopDraft & { id: string },
		index: number
	) => (
		<div className="flex min-w-0 items-center gap-2.5">
			{onStopStatusChange && !unreachableIndices.has(index) ? (
				<button
					type="button"
					aria-label={
						item.status === "visited"
							? `Mark ${item.label} not visited`
							: `Mark ${item.label} visited`
					}
					className={cn(
						"group/check flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white transition-colors",
						item.status === "visited"
							? "bg-emerald-600 hover:bg-emerald-700"
							: "bg-sky-600 hover:bg-emerald-600"
					)}
					onClick={() =>
						onStopStatusChange(
							index,
							item.status === "visited" ? "pending" : "visited"
						)
					}
				>
					{item.status === "visited" ? (
						<Check className="size-3.5" aria-hidden />
					) : (
						<>
							<span className="group-hover/check:hidden">
								{index + 1}
							</span>
							<Check
								className="hidden size-3.5 group-hover/check:block"
								aria-hidden
							/>
						</>
					)}
				</button>
			) : (
				<span
					className={cn(
						"flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
						unreachableIndices.has(index)
							? "bg-destructive"
							: "bg-sky-600"
					)}
				>
					{index + 1}
				</span>
			)}
			<div className="min-w-0 flex-1">
				<span
					className={cn(
						"block truncate text-sm",
						item.status === "visited" &&
							"text-muted-foreground line-through"
					)}
				>
					{item.label}
				</span>
				{unreachableIndices.has(index) ? (
					<span className="block text-xs text-destructive">
						Unreachable by road — remove it or fix the address
					</span>
				) : (
					legs &&
					legs[index] && (
						<span className="block text-xs text-muted-foreground">
							{formatDistance(legs[index].distanceMeters)} ·{" "}
							{formatDuration(legs[index].durationSeconds)} from
							previous
						</span>
					)
				)}
			</div>
			{!previewOnly && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Remove ${item.label}`}
					onClick={() =>
						onStopsChange(stops.filter((s) => s.key !== item.key))
					}
				>
					<X className="size-3.5" aria-hidden />
				</Button>
			)}
		</div>
	);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			{/* Route name */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="route-name" className="text-xs">
						Route name
					</Label>
					<div className="flex items-center gap-1.5">
						{routeKind === "daily" ? (
							<Badge variant="primary-light" size="sm" className="gap-1">
								<CalendarCheck className="size-3" aria-hidden />
								Today&apos;s route
							</Badge>
						) : routeKind === "saved" ? (
							<Badge variant="secondary" size="sm" className="gap-1">
								<Bookmark className="size-3" aria-hidden />
								Saved route
							</Badge>
						) : (
							<Badge variant="outline" size="sm">
								Not saved yet
							</Badge>
						)}
					</div>
				</div>
				<Input
					id="route-name"
					value={name}
					onChange={(e) => onNameChange(e.target.value)}
					placeholder="e.g. Thursday north loop"
					disabled={previewOnly}
				/>
			</div>

			{/* Start location */}
			<div className="space-y-1.5">
				<Label className="text-xs">Start location</Label>
				<div className="flex items-center gap-2">
					<div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
						<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
							S
						</span>
						<span className="truncate text-sm">
							{startLabel ?? "No start location set"}
						</span>
					</div>
					{!previewOnly && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								setEntryMode(entryMode === "start" ? null : "start")
							}
						>
							Change
						</Button>
					)}
				</div>
				{!previewOnly && entryMode === "start" && (
					<div className="space-y-2">
						{onUseOrgStart && (
							<Button
								variant="outline"
								size="sm"
								className="w-full"
								onClick={() => {
									onUseOrgStart();
									setEntryMode(null);
								}}
							>
								Use business address
							</Button>
						)}
						<InlineAddressEntry
							label="Start from another address"
							onSelect={(address) => {
								if (address.latitude == null || address.longitude == null) {
									return false;
								}
								onManualStart(address);
								setEntryMode(null);
								return true;
							}}
							onCancel={() => setEntryMode(null)}
						/>
					</div>
				)}
				<div className="flex items-center justify-between pt-1">
					<Label htmlFor="round-trip" className="text-xs font-normal">
						Return to start (round trip)
					</Label>
					<Switch
						id="round-trip"
						size="sm"
						checked={roundTrip}
						disabled={previewOnly}
						onCheckedChange={(checked) => onRoundTripChange(checked === true)}
					/>
				</div>
			</div>

			{/* Stops */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-xs">
						Stops{" "}
						<span className="text-muted-foreground">
							{onStopStatusChange
								? `(${stops.filter((s) => s.status === "visited").length} of ${stops.length} visited)`
								: `(${stops.length})`}
						</span>
					</Label>
					<div className={cn("flex gap-1.5", previewOnly && "hidden")}>
						<PropertyPicker
							properties={properties}
							usedPropertyIds={usedPropertyIds}
							onPick={(p) =>
								onStopsChange([
									...stops,
									{
										key: crypto.randomUUID(),
										propertyId: p._id,
										label:
											p.propertyName ??
											p.clientCompanyName ??
											propertyDisplayAddress(p),
										latitude: p.latitude,
										longitude: p.longitude,
									},
								])
							}
						/>
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() =>
								setEntryMode(entryMode === "stop" ? null : "stop")
							}
						>
							<MapPin className="size-3.5" aria-hidden />
							Address
						</Button>
					</div>
				</div>

				{!previewOnly && entryMode === "stop" && (
					<InlineAddressEntry
						label="Add a stop by address"
						onSelect={(address) => {
							if (address.latitude == null || address.longitude == null) {
								return false;
							}
							onStopsChange([
								...stops,
								{
									key: crypto.randomUUID(),
									label:
										address.formattedAddress ||
										`${address.streetAddress}, ${address.city}`,
									latitude: address.latitude,
									longitude: address.longitude,
								},
							]);
							setEntryMode(null);
							return true;
						}}
						onCancel={() => setEntryMode(null)}
					/>
				)}

				{stops.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
						<Plus
							className="mx-auto mb-2 size-5 text-muted-foreground"
							aria-hidden
						/>
						<p className="text-sm text-muted-foreground">
							Add stops from client properties or by address.
						</p>
					</div>
				) : (
					previewOnly ? (
						<div className="flex flex-col gap-2">
							{sortableItems.map((item, index) => (
								<div
									key={item.id}
									className="flex items-center gap-3 rounded-lg border bg-background p-2 shadow-sm ring-1 ring-border/30"
								>
									<div className="min-w-0 flex-1">{renderStopRow(item, index)}</div>
								</div>
							))}
						</div>
					) : (
						<ListProvider
							items={sortableItems}
							onReorder={(items) => onStopsChange(items)}
							itemClassName="p-2"
							renderItem={renderStopRow}
						/>
					)
				)}
			</div>

			{/* Save bar: edits persist only on Save (or on compute below) */}
			{dirty && !previewOnly && (
				<div className="flex items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
					<span className="text-xs font-medium text-foreground">
						Unsaved changes
					</span>
					<div className="flex gap-1.5">
						<Button
							variant="ghost"
							size="sm"
							onClick={onDiscard}
							disabled={saving}
						>
							Discard
						</Button>
						<Button
							size="sm"
							disabled={saving || stops.length === 0 || !startLabel}
							onClick={onSave}
						>
							{saving ? (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							) : null}
							{routeKind ? "Save changes" : "Save route"}
						</Button>
					</div>
				</div>
			)}

			{/* Compute */}
			<div className="flex gap-2">
				<Button
					className="flex-1 gap-1.5"
					disabled={previewOnly || computing || stops.length === 0 || !startLabel}
					onClick={() => onCompute(true)}
				>
					{computing ? (
						<Loader2 className="size-4 animate-spin" aria-hidden />
					) : (
						<Sparkles className="size-4" aria-hidden />
					)}
					Optimize order
				</Button>
				<Button
					variant="outline"
					className="flex-1"
					disabled={previewOnly || computing || stops.length === 0 || !startLabel}
					onClick={() => onCompute(false)}
				>
					Route as listed
				</Button>
			</div>

			{/* Summary — locked preview on the free plan (no compute ever ran) */}
			{previewOnly ? (
				<div className="relative overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
					<div
						aria-hidden
						className="pointer-events-none select-none space-y-2 blur-[3px]"
					>
						<Badge variant="primary-light" size="sm">
							Optimized
						</Badge>
						<div className="flex items-baseline gap-4">
							<div>
								<p className="text-lg font-semibold">-- --</p>
								<p className="text-xs text-muted-foreground">Drive time</p>
							</div>
							<div>
								<p className="text-lg font-semibold">-- mi</p>
								<p className="text-xs text-muted-foreground">Distance</p>
							</div>
						</div>
					</div>
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 px-4 text-center">
						<p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
							<Lock className="size-3.5 shrink-0" aria-hidden />
							Optimized ordering and drive times are part of the Business plan
						</p>
						<Button
							size="sm"
							render={<Link href="/organization/profile?tab=billing" />}
						>
							View plans
						</Button>
					</div>
				</div>
			) : null}

			{hasComputedResult && route && (
				<div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
					<div className="flex items-center gap-2">
						<Badge variant="primary-light" size="sm">
							{route.optimized
								? route.approximate
									? "Optimized (approximate)"
									: "Optimized"
								: "Manual order"}
						</Badge>
					</div>
					<div className="flex items-baseline gap-4">
						<div>
							<p className="text-lg font-semibold">
								{formatDuration(route.totalDurationSeconds ?? 0)}
							</p>
							<p className="text-xs text-muted-foreground">Drive time</p>
						</div>
						<div>
							<p className="text-lg font-semibold">
								{formatDistance(route.totalDistanceMeters ?? 0)}
							</p>
							<p className="text-xs text-muted-foreground">Distance</p>
						</div>
					</div>

					{/* Gas stations */}
					<div className="space-y-2 border-t border-border/60 pt-2">
						<div className="flex items-center justify-between">
							<Label
								htmlFor="gas-toggle"
								className="flex items-center gap-1.5 text-xs font-normal"
							>
								<Fuel className="size-3.5 text-amber-500" aria-hidden />
								Gas stations along route
								{gasLoading && (
									<Loader2
										className="size-3 animate-spin text-muted-foreground"
										aria-hidden
									/>
								)}
								{!gasLoading && gasEnabled && gasCount != null && (
									<span className="text-muted-foreground">({gasCount})</span>
								)}
							</Label>
							<Switch
								id="gas-toggle"
								size="sm"
								checked={gasEnabled}
								onCheckedChange={(checked) => onGasToggle(checked === true)}
							/>
						</div>
						<div
							className={cn(
								"flex items-center justify-between gap-2",
								!gasEnabled && "pointer-events-none opacity-50"
							)}
						>
							<span className="text-xs text-muted-foreground">Max detour</span>
							<SegmentedControl
								value={gasDeviation}
								onValueChange={onGasDeviationChange}
								options={[
									{ value: "5", label: "5 min" },
									{ value: "10", label: "10 min" },
									{ value: "15", label: "15 min" },
								]}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
