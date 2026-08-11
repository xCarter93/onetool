import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { hasPremiumAccess } from "./permissions";
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
export const PLAN_LIMIT_ERROR_CODE = "PLAN_LIMIT_REACHED";

export const CLIENT_CAP_MESSAGE = `Your plan is limited to ${FREE_MAX_CLIENTS} clients — upgrade to add more.`;

export const PROJECT_CAP_MESSAGE = `Your plan allows ${FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT} active projects per client — upgrade to add more.`;

/** Project statuses that consume a per-client active slot. */
function isActiveProjectStatus(status: string | undefined): boolean {
	return status === "planned" || status === "in-progress";
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
	// An archived client doesn't occupy a slot, so creating one never trips.
	if (newStatus === "archived") return null;
	const clients = await ctx.db
		.query("clients")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	const active = clients.filter((c) => c.status !== "archived").length;
	return active >= FREE_MAX_CLIENTS ? CLIENT_CAP_MESSAGE : null;
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
	if (!clientId || !isActiveProjectStatus(newStatus)) return null;
	const projects = await ctx.db
		.query("projects")
		.withIndex("by_client", (q) => q.eq("clientId", clientId))
		.collect();
	const active = projects.filter((p) => isActiveProjectStatus(p.status)).length;
	return active >= FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
		? PROJECT_CAP_MESSAGE
		: null;
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
	if (await hasPremiumAccess(ctx)) return;
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
	if (await hasPremiumAccess(ctx)) return;
	const error = await checkProjectCapacity(ctx, clientId, newStatus);
	if (error) throw planLimitError(error);
}
