// Pure route-builder draft logic (manual route builder screen). No RN/Convex
// imports — unit-testable in the node vitest environment. Mirrors the web
// routing page's draft shape (apps/web routing/page.tsx `StopDraft`/`StartDraft`)
// but ids are plain strings (screens only route with them — see work-search.ts).

export type DraftStopStatus = "pending" | "visited" | "skipped";

export type DraftStop = {
	/** Stable local identity for list rendering/reorder — never sent to the server. */
	key: string;
	propertyId?: string;
	taskId?: string;
	projectId?: string;
	label: string;
	latitude: number;
	longitude: number;
	status?: DraftStopStatus;
	visitedAt?: number;
};

export type DraftStart = {
	kind: "org" | "manual";
	label: string;
	latitude: number;
	longitude: number;
};

export type RouteDraft = {
	name: string;
	kind: "daily" | "saved";
	start: DraftStart | null;
	roundTrip: boolean;
	stops: DraftStop[];
};

/** Directions API allows 25 coordinates: start + stops + return-to-start (routes.ts MAX_STOPS). */
export const MAX_STOPS = 23;

/** The geocoded-property picker row shape (clientProperties.listGeocodedWithClients). */
export type GeocodedProperty = {
	_id: string;
	clientId: string;
	clientCompanyName: string;
	propertyName?: string;
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	formattedAddress?: string;
	latitude: number;
	longitude: number;
};

/** Manual-address input (AddressAutocomplete.native's AddressValue, coords required here). */
export type ManualStopAddress = {
	streetAddress: string;
	city: string;
	state: string;
	formattedAddress?: string;
	latitude: number;
	longitude: number;
};

/** The wire stop shape (routes.ts stopValidator) — server-assigned `order`, no `key`. */
export type WireStop = {
	propertyId?: string;
	taskId?: string;
	projectId?: string;
	label: string;
	latitude: number;
	longitude: number;
	order: number;
	status?: DraftStopStatus;
	visitedAt?: number;
};

/** The subset of a saved route's fields the builder loads into a draft. */
export type RouteLike = {
	name: string;
	kind?: "daily" | "saved";
	start: DraftStart;
	roundTrip: boolean;
	stops: WireStop[];
};

let keySeq = 0;
function newKey(): string {
	keySeq += 1;
	return `stop_${keySeq}`;
}

export function newDraft(): RouteDraft {
	return { name: "", kind: "daily", start: null, roundTrip: true, stops: [] };
}

/** Loads an existing saved route into an editable draft (kind/date are not editable — see routes.update). */
export function fromRoute(route: RouteLike): RouteDraft {
	const stops = [...route.stops]
		.sort((a, b) => a.order - b.order)
		.map((s) => ({
			key: newKey(),
			propertyId: s.propertyId,
			taskId: s.taskId,
			projectId: s.projectId,
			label: s.label,
			latitude: s.latitude,
			longitude: s.longitude,
			status: s.status,
			visitedAt: s.visitedAt,
		}));
	return {
		name: route.name,
		kind: route.kind ?? "saved",
		start: route.start,
		roundTrip: route.roundTrip,
		stops,
	};
}

/** Appends a property-backed stop. Caller checks `canAddStop` first. */
export function addPropertyStop(
	draft: RouteDraft,
	property: GeocodedProperty
): RouteDraft {
	const stop: DraftStop = {
		key: newKey(),
		propertyId: property._id,
		label: property.propertyName ?? property.streetAddress,
		latitude: property.latitude,
		longitude: property.longitude,
	};
	return { ...draft, stops: [...draft.stops, stop] };
}

/** Appends a manual-address stop. Null-coordinate rejection is the caller's job. */
export function addManualStop(
	draft: RouteDraft,
	address: ManualStopAddress
): RouteDraft {
	const stop: DraftStop = {
		key: newKey(),
		label:
			address.formattedAddress ??
			[address.streetAddress, address.city].filter(Boolean).join(", "),
		latitude: address.latitude,
		longitude: address.longitude,
	};
	return { ...draft, stops: [...draft.stops, stop] };
}

export function removeStop(draft: RouteDraft, key: string): RouteDraft {
	return { ...draft, stops: draft.stops.filter((s) => s.key !== key) };
}

/** Moves a stop up (-1) or down (+1); clamps at the ends (no-op past an edge). */
export function moveStop(draft: RouteDraft, key: string, dir: -1 | 1): RouteDraft {
	const index = draft.stops.findIndex((s) => s.key === key);
	if (index === -1) return draft;
	const target = index + dir;
	if (target < 0 || target >= draft.stops.length) return draft;
	const stops = [...draft.stops];
	[stops[index], stops[target]] = [stops[target], stops[index]];
	return { ...draft, stops };
}

export function canAddStop(draft: RouteDraft): boolean {
	return draft.stops.length < MAX_STOPS;
}

/** Server-bound stop list — order re-derived from array index, `key` stripped. */
export function toWireStops(draft: RouteDraft): WireStop[] {
	return draft.stops.map((s, i) => ({
		propertyId: s.propertyId,
		taskId: s.taskId,
		projectId: s.projectId,
		label: s.label,
		latitude: s.latitude,
		longitude: s.longitude,
		order: i,
		status: s.status,
		visitedAt: s.visitedAt,
	}));
}

export function usedPropertyIds(draft: RouteDraft): Set<string> {
	return new Set(
		draft.stops.flatMap((s) => (s.propertyId ? [s.propertyId] : []))
	);
}

/** Filters the org's geocoded properties for the "add a stop" picker: excludes
 * already-used ids, then matches `query` (case-insensitive) against company
 * name / property name / street address. Empty query returns all unused rows. */
export function filterProperties(
	list: GeocodedProperty[],
	query: string,
	usedIds: ReadonlySet<string>
): GeocodedProperty[] {
	const unused = list.filter((p) => !usedIds.has(p._id));
	const q = query.trim().toLowerCase();
	if (!q) return unused;
	return unused.filter((p) =>
		[p.clientCompanyName, p.propertyName, p.streetAddress]
			.filter(Boolean)
			.some((field) => field!.toLowerCase().includes(q))
	);
}
