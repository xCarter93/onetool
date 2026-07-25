import { describe, expect, it } from "vitest";
import {
	MAX_STOPS,
	addManualStop,
	addPropertyStop,
	canAddStop,
	filterProperties,
	fromRoute,
	moveStop,
	newDraft,
	removeStop,
	toWireStops,
	usedPropertyIds,
	type GeocodedProperty,
	type RouteDraft,
	type RouteLike,
} from "./route-builder";

const property = (over: Partial<GeocodedProperty> & { _id: string }): GeocodedProperty => ({
	clientId: "client1",
	clientCompanyName: "Acme Cleaning",
	streetAddress: "1 Main St",
	city: "Springfield",
	state: "IL",
	zipCode: "62704",
	latitude: 39.8,
	longitude: -89.6,
	...over,
});

describe("newDraft", () => {
	it("starts empty, daily, round trip, no start", () => {
		const draft = newDraft();
		expect(draft).toEqual({
			name: "",
			kind: "daily",
			start: null,
			roundTrip: true,
			stops: [],
		});
	});
});

describe("fromRoute", () => {
	it("sorts stops by order and assigns a local key", () => {
		const route: RouteLike = {
			name: "Morning loop",
			kind: "saved",
			start: { kind: "org", label: "HQ", latitude: 1, longitude: 2 },
			roundTrip: false,
			stops: [
				{ label: "B", latitude: 3, longitude: 4, order: 1 },
				{ label: "A", latitude: 5, longitude: 6, order: 0 },
			],
		};
		const draft = fromRoute(route);
		expect(draft.name).toBe("Morning loop");
		expect(draft.kind).toBe("saved");
		expect(draft.roundTrip).toBe(false);
		expect(draft.stops.map((s) => s.label)).toEqual(["A", "B"]);
		expect(new Set(draft.stops.map((s) => s.key)).size).toBe(2);
	});

	it("defaults kind to saved when the route predates the kind column", () => {
		const route: RouteLike = {
			name: "Legacy",
			start: { kind: "manual", label: "X", latitude: 0, longitude: 0 },
			roundTrip: true,
			stops: [],
		};
		expect(fromRoute(route).kind).toBe("saved");
	});

	it("preserves taskId/projectId/status/visitedAt passthrough", () => {
		const route: RouteLike = {
			name: "R",
			kind: "daily",
			start: { kind: "org", label: "HQ", latitude: 1, longitude: 2 },
			roundTrip: true,
			stops: [
				{
					label: "Stop",
					latitude: 1,
					longitude: 1,
					order: 0,
					taskId: "task1",
					projectId: "proj1",
					status: "visited",
					visitedAt: 123,
				},
			],
		};
		const [stop] = fromRoute(route).stops;
		expect(stop.taskId).toBe("task1");
		expect(stop.projectId).toBe("proj1");
		expect(stop.status).toBe("visited");
		expect(stop.visitedAt).toBe(123);
	});
});

describe("addPropertyStop", () => {
	it("appends a stop using propertyName, falling back to streetAddress", () => {
		const draft = newDraft();
		const withName = addPropertyStop(
			draft,
			property({ _id: "p1", propertyName: "Warehouse" })
		);
		expect(withName.stops).toHaveLength(1);
		expect(withName.stops[0].label).toBe("Warehouse");
		expect(withName.stops[0].propertyId).toBe("p1");

		const withoutName = addPropertyStop(draft, property({ _id: "p2" }));
		expect(withoutName.stops[0].label).toBe("1 Main St");
	});

	it("does not mutate the original draft", () => {
		const draft = newDraft();
		addPropertyStop(draft, property({ _id: "p1" }));
		expect(draft.stops).toHaveLength(0);
	});
});

describe("addManualStop", () => {
	it("prefers formattedAddress for the label", () => {
		const draft = addManualStop(newDraft(), {
			streetAddress: "2 Elm St",
			city: "Metropolis",
			state: "NY",
			formattedAddress: "2 Elm St, Metropolis, NY",
			latitude: 1,
			longitude: 2,
		});
		expect(draft.stops[0].label).toBe("2 Elm St, Metropolis, NY");
		expect(draft.stops[0].propertyId).toBeUndefined();
	});

	it("falls back to street + city when formattedAddress is absent", () => {
		const draft = addManualStop(newDraft(), {
			streetAddress: "2 Elm St",
			city: "Metropolis",
			state: "NY",
			latitude: 1,
			longitude: 2,
		});
		expect(draft.stops[0].label).toBe("2 Elm St, Metropolis");
	});
});

describe("removeStop", () => {
	it("removes only the matching key", () => {
		let draft = addPropertyStop(newDraft(), property({ _id: "p1" }));
		draft = addPropertyStop(draft, property({ _id: "p2" }));
		const keep = draft.stops[1].key;
		draft = removeStop(draft, draft.stops[0].key);
		expect(draft.stops).toHaveLength(1);
		expect(draft.stops[0].key).toBe(keep);
	});
});

describe("moveStop", () => {
	function threeStops(): RouteDraft {
		let draft = newDraft();
		draft = addPropertyStop(draft, property({ _id: "p1" }));
		draft = addPropertyStop(draft, property({ _id: "p2" }));
		draft = addPropertyStop(draft, property({ _id: "p3" }));
		return draft;
	}

	it("swaps a stop down", () => {
		const draft = threeStops();
		const key = draft.stops[0].key;
		const moved = moveStop(draft, key, 1);
		expect(moved.stops.map((s) => s.propertyId)).toEqual(["p2", "p1", "p3"]);
	});

	it("swaps a stop up", () => {
		const draft = threeStops();
		const key = draft.stops[2].key;
		const moved = moveStop(draft, key, -1);
		expect(moved.stops.map((s) => s.propertyId)).toEqual(["p1", "p3", "p2"]);
	});

	it("clamps at the top edge (no-op)", () => {
		const draft = threeStops();
		const key = draft.stops[0].key;
		const moved = moveStop(draft, key, -1);
		expect(moved).toBe(draft);
	});

	it("clamps at the bottom edge (no-op)", () => {
		const draft = threeStops();
		const key = draft.stops[2].key;
		const moved = moveStop(draft, key, 1);
		expect(moved).toBe(draft);
	});

	it("is a no-op for an unknown key", () => {
		const draft = threeStops();
		expect(moveStop(draft, "nope", 1)).toBe(draft);
	});
});

describe("canAddStop", () => {
	it("allows up to MAX_STOPS", () => {
		let draft = newDraft();
		for (let i = 0; i < MAX_STOPS; i++) {
			expect(canAddStop(draft)).toBe(true);
			draft = addPropertyStop(draft, property({ _id: `p${i}` }));
		}
		expect(draft.stops).toHaveLength(MAX_STOPS);
		expect(canAddStop(draft)).toBe(false);
	});
});

describe("toWireStops", () => {
	it("re-derives order from array index and strips key", () => {
		let draft = newDraft();
		draft = addPropertyStop(draft, property({ _id: "p1" }));
		draft = addPropertyStop(draft, property({ _id: "p2" }));
		const wire = toWireStops(draft);
		expect(wire).toEqual([
			{
				propertyId: "p1",
				taskId: undefined,
				projectId: undefined,
				label: "1 Main St",
				latitude: 39.8,
				longitude: -89.6,
				order: 0,
				status: undefined,
				visitedAt: undefined,
			},
			{
				propertyId: "p2",
				taskId: undefined,
				projectId: undefined,
				label: "1 Main St",
				latitude: 39.8,
				longitude: -89.6,
				order: 1,
				status: undefined,
				visitedAt: undefined,
			},
		]);
		expect((wire[0] as unknown as { key?: string }).key).toBeUndefined();
	});

	it("re-derives order after a reorder", () => {
		let draft = newDraft();
		draft = addPropertyStop(draft, property({ _id: "p1" }));
		draft = addPropertyStop(draft, property({ _id: "p2" }));
		draft = moveStop(draft, draft.stops[0].key, 1);
		const wire = toWireStops(draft);
		expect(wire.map((s) => [s.propertyId, s.order])).toEqual([
			["p2", 0],
			["p1", 1],
		]);
	});
});

describe("usedPropertyIds", () => {
	it("collects only property-backed stops", () => {
		let draft = newDraft();
		draft = addPropertyStop(draft, property({ _id: "p1" }));
		draft = addManualStop(draft, {
			streetAddress: "X",
			city: "Y",
			state: "Z",
			latitude: 0,
			longitude: 0,
		});
		expect(usedPropertyIds(draft)).toEqual(new Set(["p1"]));
	});
});

describe("filterProperties", () => {
	const list = [
		property({ _id: "p1", clientCompanyName: "Acme Cleaning", propertyName: "Warehouse" }),
		property({ _id: "p2", clientCompanyName: "Bright Landscaping", streetAddress: "42 Oak Ave" }),
		property({ _id: "p3", clientCompanyName: "Acme Cleaning", propertyName: "HQ" }),
	];

	it("excludes used ids", () => {
		const result = filterProperties(list, "", new Set(["p1"]));
		expect(result.map((p) => p._id)).toEqual(["p2", "p3"]);
	});

	it("returns all unused rows for an empty query", () => {
		expect(filterProperties(list, "   ", new Set())).toHaveLength(3);
	});

	it("matches company name, property name, or street address case-insensitively", () => {
		expect(filterProperties(list, "acme", new Set()).map((p) => p._id)).toEqual([
			"p1",
			"p3",
		]);
		expect(filterProperties(list, "warehouse", new Set()).map((p) => p._id)).toEqual([
			"p1",
		]);
		expect(filterProperties(list, "oak", new Set()).map((p) => p._id)).toEqual([
			"p2",
		]);
	});
});
