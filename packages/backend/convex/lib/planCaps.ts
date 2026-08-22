import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	METERS,
	PLAN_LIMIT_ERROR_CODE,
	entitlementsFromIdentity,
} from "./entitlements";
import {
	FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT,
	FREE_MAX_CLIENTS,
} from "./planLimits";

/**
 * Free-plan cap enforcement shared by every create path: the user-facing
 * clients.create / projects.create mutations and the automation create_record
 * executor (lib/automationExec). The counting lives here once so the two paths
 * can't drift on which records consume a slot.
 *
 * Constants stay in planLimits.ts — that module is imported by apps/web and must
 * remain free of ./_generated / convex/server imports.
 */

/** Stable code on the thrown ConvexError so clients can branch on it. */
export { PLAN_LIMIT_ERROR_CODE };

export const CLIENT_CAP_MESSAGE = `Your plan is limited to ${FREE_MAX_CLIENTS} clients — upgrade to add more.`;

export const PROJECT_CAP_MESSAGE = `Your plan allows ${FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT} active projects per client — upgrade to add more.`;

/** Project statuses that consume a per-client active slot. */
function isActiveProjectStatus(status: string | undefined): boolean {
	return status === "planned" || status === "in-progress";
}

/** Client statuses that consume a slot — everything except archived. */
const COUNTED_CLIENT_STATUSES = ["lead", "active", "inactive"] as const;

/**
 * Counts non-archived clients, stopping at `limit`. Indexed per status and
 * bounded by `take`, so an org with a long archive tail is never fully read.
 */
export async function countCountedClients(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">,
	limit: number
): Promise<number> {
	let total = 0;
	for (const status of COUNTED_CLIENT_STATUSES) {
		if (total >= limit) break;
		const rows = await ctx.db
			.query("clients")
			.withIndex("by_status", (q) => q.eq("orgId", orgId).eq("status", status))
			.take(limit - total);
		total += rows.length;
	}
	return total;
}

/**
 * Counting-only client cap check. Returns the user-facing message when the
 * insert would exceed the ceiling, or null when it's allowed. Does NOT consider
 * the plan — callers gate on their own premium check first.
 */
export async function checkClientCapacity(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	newStatus: string | undefined
): Promise<string | null> {
	// The map row is the kill switch: P2 deletes the cap by flipping it there.
	const cap = METERS.clients.enforce ? METERS.clients.free : null;
	if (cap === null) return null;
	// An archived client doesn't occupy a slot, so creating one never trips.
	if (newStatus === "archived") return null;
	const active = await countCountedClients(ctx, orgId, cap);
	return active >= cap ? CLIENT_CAP_MESSAGE : null;
}

/**
 * Counting-only per-client active-project cap check. Returns the user-facing
 * message when the insert would exceed the ceiling, or null when it's allowed.
 * Does NOT consider the plan.
 */
export async function checkProjectCapacity(
	ctx: MutationCtx,
	clientId: Id<"clients"> | undefined,
	newStatus: string | undefined
): Promise<string | null> {
	const cap = METERS.activeProjectsPerClient.enforce
		? METERS.activeProjectsPerClient.free
		: null;
	if (cap === null) return null;
	if (!clientId || !isActiveProjectStatus(newStatus)) return null;
	const projects = await ctx.db
		.query("projects")
		.withIndex("by_client", (q) => q.eq("clientId", clientId))
		.collect();
	const active = projects.filter((p) => isActiveProjectStatus(p.status)).length;
	return active >= cap ? PROJECT_CAP_MESSAGE : null;
}

function planLimitError(message: string): ConvexError<{
	code: string;
	message: string;
}> {
	return new ConvexError({ code: PLAN_LIMIT_ERROR_CODE, message });
}

/**
 * Throw when a free-plan org is at the client ceiling. Premium (user- or
 * org-level, via the live identity) bypasses.
 */
export async function assertClientCapacity(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	newStatus: string | undefined
): Promise<void> {
	if ((await entitlementsFromIdentity(ctx)).plan === "business") return;
	const error = await checkClientCapacity(ctx, orgId, newStatus);
	if (error) throw planLimitError(error);
}

/**
 * Throw when a free-plan org is at the per-client active-project ceiling.
 * Callers must have already verified the client belongs to the caller's org.
 */
export async function assertProjectCapacity(
	ctx: MutationCtx,
	clientId: Id<"clients">,
	newStatus: string | undefined
): Promise<void> {
	if ((await entitlementsFromIdentity(ctx)).plan === "business") return;
	const error = await checkProjectCapacity(ctx, clientId, newStatus);
	if (error) throw planLimitError(error);
}

/**
 * Update-path client cap: a record already holding a slot keeps it, but an
 * archived client coming back (restore, or a status edit) is a fresh insert as
 * far as the ceiling is concerned.
 */
export async function assertClientCapacityForTransition(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	prevStatus: string | undefined,
	nextStatus: string | undefined
): Promise<void> {
	if (prevStatus !== "archived") return;
	await assertClientCapacity(ctx, orgId, nextStatus);
}

/**
 * Update-path per-client project cap. A project that already occupies a slot on
 * the SAME client keeps it; reviving a completed/cancelled project, or moving an
 * active one onto another client, has to clear the destination's ceiling (which
 * counts every active project there, so the moving row must not be counted yet).
 */
export async function assertProjectCapacityForTransition(
	ctx: MutationCtx,
	prev: { clientId: Id<"clients">; status: string | undefined },
	next: { clientId: Id<"clients">; status: string | undefined }
): Promise<void> {
	const keepsItsSlot =
		isActiveProjectStatus(prev.status) && prev.clientId === next.clientId;
	if (keepsItsSlot) return;
	await assertProjectCapacity(ctx, next.clientId, next.status);
}
