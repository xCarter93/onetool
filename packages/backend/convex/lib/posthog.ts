import { PostHog } from "@posthog/convex";
import { components } from "../_generated/api";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Server-side PostHog bridge. Mirrors the business events defined (but never
 * fired) in apps/web/src/lib/analytics-events.ts, whose real moments happen in
 * Convex. Identity stitching matches the frontend: distinctId = Clerk user id
 * (users.externalId), group = Clerk org id (organizations.clerkOrganizationId).
 */
const posthog = new PostHog(components.posthog);

/** Event name strings mirrored from apps/web/src/lib/analytics-events.ts. */
export const SERVER_EVENTS = {
	// entity.record_created
	CLIENT_CREATED: "client_created",
	PROJECT_CREATED: "project_created",
	QUOTE_CREATED: "quote_created",
	INVOICE_CREATED: "invoice_created",
	TASK_CREATED: "task_created",
	// entity.status_changed
	CLIENT_ARCHIVED: "client_archived",
	PROJECT_COMPLETED: "project_completed",
	PROJECT_STATUS_CHANGED: "project_status_changed",
	QUOTE_SENT: "quote_sent",
	QUOTE_SIGNED: "quote_signed",
	QUOTE_DECLINED: "quote_declined",
	QUOTE_EXPIRED: "quote_expired",
	INVOICE_SENT: "invoice_sent",
	INVOICE_PAID: "invoice_paid",
	INVOICE_OVERDUE: "invoice_overdue",
	TASK_COMPLETED: "task_completed",
	// lifecycle
	STRIPE_CONNECTED: "stripe_connected",
	ONBOARDING_COMPLETED: "onboarding_completed",
	// TODO: report_generated — generation is a reactive query
	// (reportData.executeReport); no scheduler ctx to capture from.
	REPORT_GENERATED: "report_generated",
} as const;

export type ServerEventName =
	(typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

/**
 * Map an entity status change to its analytics event, or null when the
 * (entityType, newStatus) pair has no defined event (emit nothing).
 */
export function statusChangeEvent(
	entityType: string,
	newStatus: string
): ServerEventName | null {
	switch (entityType) {
		case "quote":
			if (newStatus === "sent") return SERVER_EVENTS.QUOTE_SENT;
			if (newStatus === "approved") return SERVER_EVENTS.QUOTE_SIGNED;
			if (newStatus === "declined") return SERVER_EVENTS.QUOTE_DECLINED;
			if (newStatus === "expired") return SERVER_EVENTS.QUOTE_EXPIRED;
			return null;
		case "invoice":
			// paid is emitted here via the status-change choke point; do NOT also
			// emit it from the payments.ts path (would double-count).
			if (newStatus === "sent") return SERVER_EVENTS.INVOICE_SENT;
			if (newStatus === "paid") return SERVER_EVENTS.INVOICE_PAID;
			if (newStatus === "overdue") return SERVER_EVENTS.INVOICE_OVERDUE;
			return null;
		case "project":
			if (newStatus === "completed") return SERVER_EVENTS.PROJECT_COMPLETED;
			return SERVER_EVENTS.PROJECT_STATUS_CHANGED;
		case "task":
			if (newStatus === "completed") return SERVER_EVENTS.TASK_COMPLETED;
			return null;
		case "client":
			if (newStatus === "archived") return SERVER_EVENTS.CLIENT_ARCHIVED;
			return null;
		// TODO: invoice_partial_paid from payment status (needs "is the invoice
		// now fully paid?" check — out of scope for this pass).
		default:
			return null;
	}
}

/** Map a record-created entity type to its analytics event, or null to skip. */
export function createdEvent(entityType: string): ServerEventName | null {
	switch (entityType) {
		case "client":
			return SERVER_EVENTS.CLIENT_CREATED;
		case "project":
			return SERVER_EVENTS.PROJECT_CREATED;
		case "quote":
			return SERVER_EVENTS.QUOTE_CREATED;
		case "invoice":
			return SERVER_EVENTS.INVOICE_CREATED;
		case "task":
			return SERVER_EVENTS.TASK_CREATED;
		default:
			return null;
	}
}

/**
 * Fire a server-side PostHog event with correct identity stitching.
 * Resolves Convex ids to their Clerk equivalents (org -> clerkOrganizationId,
 * actor -> externalId). Actor-less callers (webhooks/crons) get a stable
 * synthetic distinctId. Capture is non-blocking (schedules a Convex action).
 */
/**
 * Fire a PostHog LLM-analytics `$ai_generation` event (AI Observability tab).
 * Token counts only — no prompt/completion content leaves Convex. Costs are
 * derived by PostHog from model + token counts.
 */
export async function trackAiGeneration(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		userId: Id<"users">;
		traceId: string;
		spanName?: string;
		model: string;
		provider: string;
		inputTokens: number;
		outputTokens: number;
	}
): Promise<void> {
	if (process.env.VITEST) return;

	const org = await ctx.db.get(args.orgId);
	if (!org) return;
	const user = await ctx.db.get(args.userId);
	const distinctId = user?.externalId ?? `org:${org.clerkOrganizationId}`;

	await posthog.capture(ctx, {
		distinctId,
		event: "$ai_generation",
		properties: {
			source: "backend",
			$ai_trace_id: args.traceId,
			$ai_span_name: args.spanName,
			$ai_model: args.model,
			$ai_provider: args.provider,
			$ai_input_tokens: args.inputTokens,
			$ai_output_tokens: args.outputTokens,
		},
		groups: { organization: org.clerkOrganizationId },
	});
}

export async function trackServerEvent(
	ctx: MutationCtx,
	args: {
		event: ServerEventName;
		orgId: Id<"organizations">;
		actorUserId?: Id<"users">;
		properties?: Record<string, unknown>;
	}
): Promise<void> {
	// Same guard as eventBus: never schedule actions after a test transaction.
	if (process.env.VITEST) return;

	const org = await ctx.db.get(args.orgId);
	if (!org) return;
	const clerkOrgId = org.clerkOrganizationId;

	let distinctId: string | undefined;
	if (args.actorUserId) {
		const user = await ctx.db.get(args.actorUserId);
		distinctId = user?.externalId;
	}
	if (!distinctId) distinctId = `org:${clerkOrgId}`;

	await posthog.capture(ctx, {
		distinctId,
		event: args.event,
		properties: { source: "backend", ...args.properties },
		groups: { organization: clerkOrgId },
	});
}
