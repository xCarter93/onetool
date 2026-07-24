import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
	optionalUserQuery,
	userMutation,
	type UserMutationCtx,
} from "./lib/factories";
import { hasPremiumAccess } from "./lib/permissions";
import { emptyListResult } from "./lib/queries";

/**
 * Planned multi-stop routes (Routing page).
 *
 * Reads gate on clients:view (routes expose client property addresses);
 * writes additionally require the premium plan. Route computation against
 * Mapbox lives in routingActions.ts — mutations here clear stale computed
 * results whenever route inputs change.
 */

const PREMIUM_REQUIRED_MESSAGE =
	"Route planning is available on the Business plan. Upgrade to use it.";

/** Directions API allows 25 coordinates: start + stops + return-to-start. */
export const MAX_STOPS = 23;

const startValidator = v.object({
	kind: v.union(v.literal("org"), v.literal("manual")),
	label: v.string(),
	latitude: v.number(),
	longitude: v.number(),
});

const stopStatusValidator = v.union(
	v.literal("pending"),
	v.literal("visited"),
	v.literal("skipped")
);

const stopValidator = v.object({
	propertyId: v.optional(v.id("clientProperties")),
	taskId: v.optional(v.id("tasks")),
	projectId: v.optional(v.id("projects")),
	label: v.string(),
	latitude: v.number(),
	longitude: v.number(),
	order: v.number(),
	status: v.optional(stopStatusValidator),
	visitedAt: v.optional(v.number()),
});

type RouteStop = {
	propertyId?: Id<"clientProperties">;
	taskId?: Id<"tasks">;
	projectId?: Id<"projects">;
	label: string;
	latitude: number;
	longitude: number;
	order: number;
	status?: "pending" | "visited" | "skipped";
	visitedAt?: number;
};

type RouteStart = {
	kind: "org" | "manual";
	label: string;
	latitude: number;
	longitude: number;
};

function assertValidCoordinate(latitude: number, longitude: number): void {
	if (
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		latitude < -90 ||
		latitude > 90 ||
		longitude < -180 ||
		longitude > 180
	) {
		throw new Error("Invalid coordinates");
	}
}

async function assertValidStops(
	ctx: UserMutationCtx,
	stops: RouteStop[]
): Promise<void> {
	if (stops.length > MAX_STOPS) {
		throw new Error(`A route can have at most ${MAX_STOPS} stops`);
	}
	for (const stop of stops) {
		assertValidCoordinate(stop.latitude, stop.longitude);
		if (!Number.isFinite(stop.order) || stop.order < 0) {
			throw new Error("Invalid stop order");
		}
		if (stop.propertyId) {
			// Throws when the property belongs to another org.
			await ctx.orgEntity("clientProperties", stop.propertyId);
		}
	}
}

async function requirePremium(ctx: UserMutationCtx): Promise<void> {
	if (!(await hasPremiumAccess(ctx))) {
		throw new Error(PREMIUM_REQUIRED_MESSAGE);
	}
}

/** Computed-result fields, reset whenever route inputs change. */
const CLEARED_COMPUTED_FIELDS = {
	optimized: undefined,
	approximate: undefined,
	geometry: undefined,
	totalDistanceMeters: undefined,
	totalDurationSeconds: undefined,
	legs: undefined,
	computedAt: undefined,
} as const;

// ============================================================================
// Queries
// ============================================================================

export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"routes">[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("clients", "view");

		const routes = await ctx.db
			.query("routes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return routes.sort((a, b) => b._creationTime - a._creationTime);
	},
});

export const get = optionalUserQuery({
	args: { routeId: v.id("routes") },
	handler: async (ctx, args): Promise<Doc<"routes"> | null> => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("clients", "view");

		// Plain get: orgEntity throws on deleted docs, but a viewer holding a
		// stale id should just see null.
		const route = await ctx.db.get(args.routeId);
		if (!route || route.orgId !== ctx.orgId) return null;
		return route;
	},
});

// ============================================================================
// Mutations
// ============================================================================

export const create = userMutation({
	args: {
		name: v.string(),
		kind: v.optional(v.union(v.literal("daily"), v.literal("saved"))),
		date: v.optional(v.number()),
		assigneeUserId: v.optional(v.id("users")),
		start: startValidator,
		roundTrip: v.boolean(),
		stops: v.array(stopValidator),
	},
	handler: async (ctx, args): Promise<Id<"routes">> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const name = args.name.trim();
		if (!name) throw new Error("Route name is required");
		const kind = args.kind ?? "saved";
		if (kind === "daily" && args.date === undefined) {
			throw new Error("Daily routes require a date");
		}
		assertValidCoordinate(args.start.latitude, args.start.longitude);
		await assertValidStops(ctx, args.stops);

		return await ctx.db.insert("routes", {
			orgId: ctx.orgId,
			name,
			kind,
			date: args.date,
			assigneeUserId: args.assigneeUserId,
			status: "draft",
			start: args.start,
			roundTrip: args.roundTrip,
			stops: args.stops,
			createdBy: ctx.user._id,
		});
	},
});

export const update = userMutation({
	args: {
		routeId: v.id("routes"),
		name: v.optional(v.string()),
		date: v.optional(v.number()),
		status: v.optional(v.union(v.literal("draft"), v.literal("finalized"))),
		start: v.optional(startValidator),
		roundTrip: v.optional(v.boolean()),
		stops: v.optional(v.array(stopValidator)),
	},
	handler: async (ctx, args): Promise<void> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const route = await ctx.orgEntity("routes", args.routeId);

		const updates: Partial<Doc<"routes">> = {};
		if (args.name !== undefined) {
			const name = args.name.trim();
			if (!name) throw new Error("Route name is required");
			updates.name = name;
		}
		if (args.date !== undefined) updates.date = args.date;
		if (args.status !== undefined) updates.status = args.status;
		if (args.start !== undefined) {
			assertValidCoordinate(args.start.latitude, args.start.longitude);
			updates.start = args.start as RouteStart;
		}
		if (args.roundTrip !== undefined) updates.roundTrip = args.roundTrip;
		if (args.stops !== undefined) {
			await assertValidStops(ctx, args.stops);
			updates.stops = args.stops;
		}

		if (Object.keys(updates).length === 0) {
			throw new Error("No updates provided");
		}

		// Any input change invalidates the previously computed route.
		const inputsChanged =
			args.start !== undefined ||
			args.roundTrip !== undefined ||
			args.stops !== undefined;

		await ctx.db.patch(route._id, {
			...updates,
			...(inputsChanged ? CLEARED_COMPUTED_FIELDS : {}),
		});
	},
});

export const remove = userMutation({
	args: { routeId: v.id("routes") },
	handler: async (ctx, args): Promise<void> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const route = await ctx.orgEntity("routes", args.routeId);
		await ctx.db.delete(route._id);
	},
});

/** Mark a single stop's completion status on a daily route (not input data — computed fields are untouched). */
export const setStopStatus = userMutation({
	args: {
		routeId: v.id("routes"),
		order: v.number(),
		status: stopStatusValidator,
	},
	handler: async (ctx, args): Promise<void> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const route = await ctx.orgEntity("routes", args.routeId);
		if (route.kind !== "daily") {
			throw new Error("Only daily routes track stop completion");
		}
		if (!route.stops.some((s) => s.order === args.order)) {
			throw new Error("Stop not found");
		}

		const stops = route.stops.map((s) =>
			s.order === args.order
				? {
						...s,
						status: args.status,
						visitedAt: args.status === "visited" ? Date.now() : undefined,
					}
				: s
		);

		await ctx.db.patch(route._id, { stops });
	},
});

// ============================================================================
// Daily routes (seed-from-schedule + saved-route copy)
// ============================================================================

/** The daily singleton for (org, date, assignee); undefined assignee = org-wide. */
async function findDailyRoute(
	ctx: UserMutationCtx,
	date: number,
	assigneeUserId: Id<"users"> | undefined
): Promise<Doc<"routes"> | null> {
	const sameDay = await ctx.db
		.query("routes")
		.withIndex("by_org_date", (q) => q.eq("orgId", ctx.orgId).eq("date", date))
		.collect();
	return (
		sameDay.find(
			(r) => r.kind === "daily" && r.assigneeUserId === assigneeUserId
		) ?? null
	);
}

/**
 * Resolve the property a schedule item maps to: explicit propertyId, else the
 * client's primary. Null when nothing resolvable or not geocoded yet.
 */
async function resolveSeedProperty(
	ctx: UserMutationCtx,
	propertyId: Id<"clientProperties"> | undefined,
	clientId: Id<"clients"> | undefined
): Promise<Doc<"clientProperties"> | null> {
	let property = propertyId ? await ctx.db.get(propertyId) : null;
	if (!property && clientId) {
		property = await ctx.db
			.query("clientProperties")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", clientId).eq("isPrimary", true)
			)
			.first();
	}
	if (!property || property.orgId !== ctx.orgId) return null;
	if (property.latitude == null || property.longitude == null) return null;
	return property;
}

async function buildOrgStart(ctx: UserMutationCtx): Promise<RouteStart> {
	const org = await ctx.db.get(ctx.orgId);
	if (!org || org.latitude == null || org.longitude == null) {
		throw new Error(
			"Add your organization's address (in Settings) before planning from the schedule"
		);
	}
	return {
		kind: "org",
		label: org.addressStreet ?? org.name,
		latitude: org.latitude,
		longitude: org.longitude,
	};
}

/**
 * Build (or re-seed) the daily route for a date from that day's schedule:
 * tasks first (ordered by startTime), then one-off projects whose date span
 * covers the day. A same-day task supersedes its project; stops dedupe by
 * property. Re-seeding replaces the stop list (snapshot semantics, D1/D4).
 */
export const seedFromSchedule = userMutation({
	args: {
		date: v.number(),
		assigneeUserId: v.optional(v.id("users")),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		routeId: Id<"routes">;
		stopCount: number;
		skippedNoAddress: number;
		truncated: number;
	}> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");
		if (!Number.isFinite(args.date)) throw new Error("Invalid date");

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_date", (q) =>
				q.eq("orgId", ctx.orgId).eq("date", args.date)
			)
			.collect();
		const candidateTasks = tasks
			.filter((t) => t.status !== "cancelled")
			.filter(
				(t) =>
					!args.assigneeUserId || t.assigneeUserId === args.assigneeUserId
			)
			.sort((a, b) =>
				(a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")
			);

		// Recurring projects participate via their tasks only; a same-day task
		// supersedes its project's own stop (D9).
		const taskProjectIds = new Set(
			candidateTasks.flatMap((t) => (t.projectId ? [t.projectId] : []))
		);
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.collect();
		const candidateProjects = projects.filter(
			(p) =>
				p.projectType === "one-off" &&
				(p.status === "planned" || p.status === "in-progress") &&
				p.startDate !== undefined &&
				p.endDate !== undefined &&
				p.startDate <= args.date &&
				args.date <= p.endDate &&
				!taskProjectIds.has(p._id) &&
				(!args.assigneeUserId ||
					(p.assignedUserIds ?? []).includes(args.assigneeUserId))
		);

		const seenProperties = new Set<Id<"clientProperties">>();
		const stops: RouteStop[] = [];
		let skippedNoAddress = 0;

		for (const task of candidateTasks) {
			const property = await resolveSeedProperty(
				ctx,
				task.propertyId,
				task.clientId
			);
			if (!property) {
				// Internal tasks with no client aren't address-bearing — not "skipped"
				if (task.clientId || task.propertyId) skippedNoAddress++;
				continue;
			}
			if (seenProperties.has(property._id)) continue;
			seenProperties.add(property._id);
			const completed = task.status === "completed";
			stops.push({
				propertyId: property._id,
				taskId: task._id,
				projectId: task.projectId,
				label: property.propertyName ?? property.streetAddress,
				latitude: property.latitude!,
				longitude: property.longitude!,
				order: stops.length,
				status: completed ? "visited" : "pending",
				visitedAt: completed ? (task.completedAt ?? Date.now()) : undefined,
			});
		}

		for (const project of candidateProjects) {
			const property = await resolveSeedProperty(
				ctx,
				project.propertyId,
				project.clientId
			);
			if (!property) {
				skippedNoAddress++;
				continue;
			}
			if (seenProperties.has(property._id)) continue;
			seenProperties.add(property._id);
			stops.push({
				propertyId: property._id,
				projectId: project._id,
				label: property.propertyName ?? property.streetAddress,
				latitude: property.latitude!,
				longitude: property.longitude!,
				order: stops.length,
				status: "pending",
			});
		}

		if (stops.length === 0) {
			throw new Error(
				skippedNoAddress > 0
					? "Scheduled work found, but none of its properties have a mapped address yet"
					: "No scheduled work with mapped addresses on that day"
			);
		}

		const truncated = Math.max(0, stops.length - MAX_STOPS);
		const finalStops = stops.slice(0, MAX_STOPS);

		const existing = await findDailyRoute(ctx, args.date, args.assigneeUserId);
		if (existing) {
			await ctx.db.patch(existing._id, {
				stops: finalStops,
				...CLEARED_COMPUTED_FIELDS,
			});
			return {
				routeId: existing._id,
				stopCount: finalStops.length,
				skippedNoAddress,
				truncated,
			};
		}

		const start = await buildOrgStart(ctx);
		const routeId = await ctx.db.insert("routes", {
			orgId: ctx.orgId,
			name: `Daily route — ${new Date(args.date).toISOString().slice(0, 10)}`,
			kind: "daily",
			date: args.date,
			assigneeUserId: args.assigneeUserId,
			status: "draft",
			start,
			roundTrip: true,
			stops: finalStops,
			createdBy: ctx.user._id,
		});
		return {
			routeId,
			stopCount: finalStops.length,
			skippedNoAddress,
			truncated,
		};
	},
});

/**
 * "Use today": copy a saved master route into the daily singleton. The master
 * is never mutated (D5). Creates the daily route if absent, otherwise appends
 * the master's stops that aren't already on it (dedupe by property, manual
 * stops by exact coordinates).
 */
export const copyToDaily = userMutation({
	args: {
		routeId: v.id("routes"),
		date: v.number(),
		assigneeUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, args): Promise<Id<"routes">> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");
		if (!Number.isFinite(args.date)) throw new Error("Invalid date");

		const saved = await ctx.orgEntity("routes", args.routeId);
		if (saved.kind === "daily") {
			throw new Error("Only saved routes can be used for a day");
		}

		// Fresh working copies: no completion state or provenance from the master
		const copiedStops: RouteStop[] = saved.stops.map((stop, i) => ({
			propertyId: stop.propertyId,
			label: stop.label,
			latitude: stop.latitude,
			longitude: stop.longitude,
			order: i,
		}));

		const existing = await findDailyRoute(ctx, args.date, args.assigneeUserId);
		if (!existing) {
			return await ctx.db.insert("routes", {
				orgId: ctx.orgId,
				name: saved.name,
				kind: "daily",
				date: args.date,
				assigneeUserId: args.assigneeUserId,
				status: "draft",
				start: saved.start,
				roundTrip: saved.roundTrip,
				stops: copiedStops,
				createdBy: ctx.user._id,
			});
		}

		const existingPropertyIds = new Set(
			existing.stops.flatMap((s) => (s.propertyId ? [s.propertyId] : []))
		);
		const existingCoords = new Set(
			existing.stops.map((s) => `${s.latitude},${s.longitude}`)
		);
		const additions = copiedStops.filter((s) =>
			s.propertyId
				? !existingPropertyIds.has(s.propertyId)
				: !existingCoords.has(`${s.latitude},${s.longitude}`)
		);
		const merged = [...existing.stops, ...additions].map((s, i) => ({
			...s,
			order: i,
		}));
		if (merged.length > MAX_STOPS) {
			throw new Error(`A route can have at most ${MAX_STOPS} stops`);
		}
		await ctx.db.patch(existing._id, {
			stops: merged,
			...CLEARED_COMPUTED_FIELDS,
		});
		return existing._id;
	},
});
