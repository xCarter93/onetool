import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
	applyStopEdits,
	assistantTools,
	isAllowedWorkspacePath,
	resolveRouteFromList,
} from "./assistantTools";
import type { Doc, Id } from "./_generated/dataModel";

describe("isAllowedWorkspacePath", () => {
	it("accepts workspace list and detail paths", () => {
		expect(isAllowedWorkspacePath("/home")).toBe(true);
		expect(isAllowedWorkspacePath("/clients")).toBe(true);
		expect(isAllowedWorkspacePath("/clients/import")).toBe(true);
		expect(isAllowedWorkspacePath("/clients/jd7abc123XYZ_-")).toBe(true);
		expect(isAllowedWorkspacePath("/projects/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/quotes/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/invoices/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/tasks")).toBe(true);
		expect(isAllowedWorkspacePath("/reports/new")).toBe(true);
		expect(isAllowedWorkspacePath("/organization/profile")).toBe(true);
		expect(isAllowedWorkspacePath("/routing")).toBe(true);
	});

	it("rejects /routing subpaths", () => {
		expect(isAllowedWorkspacePath("/routing/xyz")).toBe(false);
	});

	// Client/project/quote creation moved into dialogs; the routes are gone. The
	// id patterns would otherwise still match "new" and route the user to a 404.
	it("rejects the retired /new creation routes", () => {
		expect(isAllowedWorkspacePath("/clients/new")).toBe(false);
		expect(isAllowedWorkspacePath("/projects/new")).toBe(false);
		expect(isAllowedWorkspacePath("/quotes/new")).toBe(false);
	});

	it("rejects external, malformed, and unlisted paths", () => {
		expect(isAllowedWorkspacePath("https://evil.example")).toBe(false);
		expect(isAllowedWorkspacePath("//evil.example")).toBe(false);
		expect(isAllowedWorkspacePath("/admin")).toBe(false);
		expect(isAllowedWorkspacePath("/organization/complete")).toBe(false);
		expect(isAllowedWorkspacePath("/clients/../admin")).toBe(false);
		expect(isAllowedWorkspacePath("/clients/id/extra")).toBe(false);
		expect(isAllowedWorkspacePath("clients")).toBe(false);
		expect(isAllowedWorkspacePath("/clients?x=1")).toBe(false);
		expect(isAllowedWorkspacePath("")).toBe(false);
	});
});

// @convex-dev/agent injects ctx by spreading {...tool, ctx} (wrapTools) and the
// AI SDK calls execute as a method, so the handler reads ctx off `this`. The
// withPermissionFallback wrapper must forward `this` — calling the original
// execute bare loses it and every tool throws
// "Cannot read properties of undefined (reading 'ctx')".
describe("assistantTools permission-fallback wrapper", () => {
	function invokeAsAgentRuntime(
		tool: unknown,
		ctx: unknown,
		input: unknown
	): Promise<unknown> {
		const injected: Record<string, unknown> = {
			...(tool as Record<string, unknown>),
			ctx,
		};
		const execute = injected.execute as (
			this: unknown,
			...args: unknown[]
		) => Promise<unknown>;
		return execute.call(injected, input, {
			toolCallId: "call_1",
			messages: [],
		});
	}

	it("forwards the runtime-injected ctx to the tool handler", async () => {
		const stats = { activeClients: 7 };
		const ctx = { runQuery: async () => stats };
		await expect(
			invokeAsAgentRuntime(assistantTools.getBusinessStats, ctx, {})
		).resolves.toEqual(stats);
	});

	it("converts FORBIDDEN ConvexErrors into a structured no_permission result", async () => {
		const ctx = {
			runQuery: async () => {
				throw new ConvexError({ code: "FORBIDDEN", object: "clients" });
			},
		};
		await expect(
			invokeAsAgentRuntime(assistantTools.getBusinessStats, ctx, {})
		).resolves.toMatchObject({
			error: "no_permission",
			object: "clients",
		});
	});

	it("rethrows non-permission errors", async () => {
		const ctx = {
			runQuery: async () => {
				throw new Error("boom");
			},
		};
		await expect(
			invokeAsAgentRuntime(assistantTools.getBusinessStats, ctx, {})
		).rejects.toThrow("boom");
	});
});

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

type RouteDoc = Doc<"routes">;

function fakeRoute(overrides: Partial<RouteDoc> & { name: string }): RouteDoc {
	return {
		_id: overrides.name as unknown as Id<"routes">,
		_creationTime: 0,
		orgId: "org1" as unknown as Id<"organizations">,
		status: "draft",
		start: { kind: "org", label: "HQ", latitude: 0, longitude: 0 },
		roundTrip: true,
		stops: [],
		createdBy: "user1" as unknown as Id<"users">,
		...overrides,
	} as RouteDoc;
}

describe("resolveRouteFromList", () => {
	const dailyOrgWide = fakeRoute({ name: "Daily route — 2026-07-23", kind: "daily", date: 100 });
	const dailyForAlice = fakeRoute({
		name: "Daily route — 2026-07-23 (Alice)",
		kind: "daily",
		date: 100,
		assigneeUserId: "alice" as unknown as Id<"users">,
	});
	const savedNorth = fakeRoute({ name: "North Loop" });
	const savedNorthside = fakeRoute({ name: "Northside Circuit" });
	const routes = [dailyOrgWide, dailyForAlice, savedNorth, savedNorthside];

	it("resolves the org-wide daily route by date with no assignee", () => {
		const result = resolveRouteFromList(routes, { date: 100 });
		expect(result).toEqual({ found: true, route: dailyOrgWide });
	});

	it("resolves a per-assignee daily route", () => {
		const result = resolveRouteFromList(routes, {
			date: 100,
			assigneeUserId: "alice" as unknown as Id<"users">,
		});
		expect(result).toEqual({ found: true, route: dailyForAlice });
	});

	it("reports not_found when no daily route matches", () => {
		const result = resolveRouteFromList(routes, { date: 999 });
		expect(result).toEqual({ found: false, reason: "not_found" });
	});

	it("matches a saved route by exact name (case-insensitive)", () => {
		const result = resolveRouteFromList(routes, { savedRouteName: "north loop" });
		expect(result).toEqual({ found: true, route: savedNorth });
	});

	it("matches a saved route by unambiguous substring", () => {
		const onlyOne = [savedNorthside];
		const result = resolveRouteFromList(onlyOne, { savedRouteName: "circuit" });
		expect(result).toEqual({ found: true, route: savedNorthside });
	});

	it("reports ambiguous substring matches with candidate names", () => {
		const result = resolveRouteFromList(routes, { savedRouteName: "north" });
		expect(result).toEqual({
			found: false,
			reason: "ambiguous",
			candidates: ["North Loop", "Northside Circuit"],
		});
	});

	it("never matches a daily route by savedRouteName", () => {
		const result = resolveRouteFromList(routes, { savedRouteName: "Daily route" });
		expect(result.found).toBe(false);
	});
});

describe("applyStopEdits", () => {
	function stop(overrides: Partial<RouteDoc["stops"][number]> & { label: string; order: number }) {
		return {
			latitude: 0,
			longitude: 0,
			...overrides,
		} as RouteDoc["stops"][number];
	}

	const propA = "propA" as unknown as Id<"clientProperties">;
	const propB = "propB" as unknown as Id<"clientProperties">;
	const propC = "propC" as unknown as Id<"clientProperties">;

	const baseStops: RouteDoc["stops"] = [
		stop({ label: "Smith Residence", order: 0, propertyId: propA, taskId: "t1" as unknown as Id<"tasks"> }),
		stop({ label: "Jones Office", order: 1, propertyId: propB, status: "visited" }),
		stop({ label: "Acme Warehouse", order: 2, propertyId: propC }),
	];

	it("removes a stop by number", () => {
		const result = applyStopEdits(baseStops, { removeStops: ["2"] });
		expect(result.removed).toEqual(["Jones Office"]);
		expect(result.stops.map((s) => s.label)).toEqual(["Smith Residence", "Acme Warehouse"]);
		expect(result.stops.map((s) => s.order)).toEqual([0, 1]);
	});

	it("removes a stop by label fragment", () => {
		const result = applyStopEdits(baseStops, { removeStops: ["smith"] });
		expect(result.removed).toEqual(["Smith Residence"]);
		expect(result.stops.map((s) => s.label)).toEqual(["Jones Office", "Acme Warehouse"]);
	});

	it("reports unmatched removal entries", () => {
		const result = applyStopEdits(baseStops, { removeStops: ["nonexistent", "99"] });
		expect(result.unmatched).toEqual(["nonexistent", "99"]);
		expect(result.removed).toEqual([]);
		expect(result.stops).toHaveLength(3);
	});

	it("reorders stops by current stop numbers", () => {
		const result = applyStopEdits(baseStops, { reorder: [3, 1, 2] });
		expect(result.stops.map((s) => s.label)).toEqual([
			"Acme Warehouse",
			"Smith Residence",
			"Jones Office",
		]);
		expect(result.stops.map((s) => s.order)).toEqual([0, 1, 2]);
	});

	it("rejects a reorder that is not a valid permutation", () => {
		const result = applyStopEdits(baseStops, { reorder: [1, 1, 2] });
		expect(result.error).toBeDefined();
	});

	it("rejects a reorder with a missing or out-of-range stop number", () => {
		const result = applyStopEdits(baseStops, { reorder: [1, 2, 4] });
		expect(result.error).toBeDefined();
	});

	it("adds new stops and dedupes by propertyId already present", () => {
		const propD = "propD" as unknown as Id<"clientProperties">;
		const result = applyStopEdits(baseStops, {
			additions: [
				{ propertyId: propA, label: "Smith Residence (dup)", latitude: 1, longitude: 1 },
				{ propertyId: propD, label: "New Client HQ", latitude: 2, longitude: 2 },
			],
		});
		expect(result.added).toEqual(["New Client HQ"]);
		expect(result.stops.map((s) => s.label)).toEqual([
			"Smith Residence",
			"Jones Office",
			"Acme Warehouse",
			"New Client HQ",
		]);
		expect(result.stops.map((s) => s.order)).toEqual([0, 1, 2, 3]);
	});

	it("preserves provenance fields (taskId, projectId, status, visitedAt) on surviving stops", () => {
		const result = applyStopEdits(baseStops, { removeStops: ["Acme"] });
		const smith = result.stops.find((s) => s.label === "Smith Residence");
		const jones = result.stops.find((s) => s.label === "Jones Office");
		expect(smith?.taskId).toBe("t1");
		expect(smith?.propertyId).toBe(propA);
		expect(jones?.status).toBe("visited");
		expect(jones?.propertyId).toBe(propB);
	});
});
