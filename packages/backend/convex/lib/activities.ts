import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getCurrentUserOrThrow } from "./auth";
import { getOptionalOrgId } from "./queries";
import {
	FieldChange,
	buildChangeDescription,
} from "./changeTracking";

type ActivityType = Doc<"activities">["activityType"];
type EntityType = Doc<"activities">["entityType"];

/**
 * Create an activity record for tracking user actions
 */
export async function createActivity(
	ctx: MutationCtx,
	{
		activityType,
		entityType,
		entityId,
		entityName,
		description,
		metadata,
		isVisible = true,
		actor,
	}: {
		activityType: ActivityType;
		entityType: EntityType;
		entityId: string;
		entityName: string;
		description: string;
		metadata?: Record<string, unknown>;
		isVisible?: boolean;
		/**
		 * Explicit actor + org for system contexts (e.g. automation runs) that have
		 * no ambient authenticated user. When omitted, the acting user and org are
		 * resolved from auth as before.
		 */
		actor?: { userId: Id<"users">; orgId: Id<"organizations"> };
	}
): Promise<Id<"activities"> | null> {
	let userId: Id<"users">;
	let orgId: Id<"organizations"> | null | undefined;
	if (actor) {
		userId = actor.userId;
		orgId = actor.orgId;
	} else {
		const user = await getCurrentUserOrThrow(ctx);
		userId = user._id;
		orgId = await getOptionalOrgId(ctx);
	}

	// Skip activity logging for users without organizations
	if (!orgId) {
		return null;
	}

	return await ctx.db.insert("activities", {
		orgId,
		userId,
		activityType,
		entityType,
		entityId,
		entityName,
		description,
		metadata,
		timestamp: Date.now(),
		isVisible,
	});
}

/**
 * Helper functions for common activity types
 */
export const ActivityHelpers = {
	async clientCreated(
		ctx: MutationCtx,
		client: Doc<"clients">,
		actor?: { userId: Id<"users">; orgId: Id<"organizations"> }
	) {
		return createActivity(ctx, {
			activityType: "client_created",
			entityType: "client",
			entityId: client._id,
			entityName: client.companyName,
			description: `Created new client: ${client.companyName}`,
			actor,
		});
	},

	async clientUpdated(
		ctx: MutationCtx,
		client: Doc<"clients">,
		changes?: FieldChange[]
	) {
		const description =
			changes && changes.length > 0
				? buildChangeDescription(client.companyName, changes)
				: `Updated client: ${client.companyName}`;

		return createActivity(ctx, {
			activityType: "client_updated",
			entityType: "client",
			entityId: client._id,
			entityName: client.companyName,
			description,
			metadata: changes && changes.length > 0 ? { changes } : undefined,
		});
	},

	async projectCreated(
		ctx: MutationCtx,
		project: Doc<"projects">,
		actor?: { userId: Id<"users">; orgId: Id<"organizations"> }
	) {
		return createActivity(ctx, {
			activityType: "project_created",
			entityType: "project",
			entityId: project._id,
			entityName: project.title,
			description: `Created new project: ${project.title}`,
			actor,
		});
	},

	async projectUpdated(
		ctx: MutationCtx,
		project: Doc<"projects">,
		changes?: FieldChange[]
	) {
		const description =
			changes && changes.length > 0
				? buildChangeDescription(project.title, changes)
				: `Updated project: ${project.title}`;

		return createActivity(ctx, {
			activityType: "project_updated",
			entityType: "project",
			entityId: project._id,
			entityName: project.title,
			description,
			metadata: changes && changes.length > 0 ? { changes } : undefined,
		});
	},

	async projectCompleted(
		ctx: MutationCtx,
		project: Doc<"projects">,
		changes?: FieldChange[]
	) {
		return createActivity(ctx, {
			activityType: "project_completed",
			entityType: "project",
			entityId: project._id,
			entityName: project.title,
			description: `Completed project: ${project.title}`,
			metadata: changes && changes.length > 0 ? { changes } : undefined,
		});
	},

	async quoteCreated(
		ctx: MutationCtx,
		quote: Doc<"quotes">,
		clientName: string
	) {
		return createActivity(ctx, {
			activityType: "quote_created",
			entityType: "quote",
			entityId: quote._id,
			entityName: quote.title || `Quote ${quote.quoteNumber || quote._id}`,
			description: `Created quote for ${clientName}`,
			metadata: { quoteNumber: quote.quoteNumber, total: quote.total },
		});
	},

	async quoteSent(
		ctx: MutationCtx,
		quote: Doc<"quotes">,
		clientName: string,
		changes?: FieldChange[]
	) {
		return createActivity(ctx, {
			activityType: "quote_sent",
			entityType: "quote",
			entityId: quote._id,
			entityName: quote.title || `Quote ${quote.quoteNumber || quote._id}`,
			description: `Sent quote to ${clientName}`,
			metadata: {
				quoteNumber: quote.quoteNumber,
				total: quote.total,
				...(changes && changes.length > 0 ? { changes } : {}),
			},
		});
	},

	async quoteApproved(
		ctx: MutationCtx,
		quote: Doc<"quotes">,
		clientName: string,
		changes?: FieldChange[]
	) {
		return createActivity(ctx, {
			activityType: "quote_approved",
			entityType: "quote",
			entityId: quote._id,
			entityName: quote.title || `Quote ${quote.quoteNumber || quote._id}`,
			description: `Quote approved by ${clientName}`,
			metadata: {
				quoteNumber: quote.quoteNumber,
				total: quote.total,
				...(changes && changes.length > 0 ? { changes } : {}),
			},
		});
	},

	async quoteDeclined(
		ctx: MutationCtx,
		quote: Doc<"quotes">,
		clientName: string,
		changes?: FieldChange[]
	) {
		return createActivity(ctx, {
			activityType: "quote_declined",
			entityType: "quote",
			entityId: quote._id,
			entityName: quote.title || `Quote ${quote.quoteNumber || quote._id}`,
			description: `Quote declined by ${clientName}`,
			metadata: {
				quoteNumber: quote.quoteNumber,
				total: quote.total,
				...(changes && changes.length > 0 ? { changes } : {}),
			},
		});
	},

	async quotePdfGenerated(
		ctx: MutationCtx,
		quote: Doc<"quotes">,
		version?: number
	) {
		return createActivity(ctx, {
			activityType: "quote_pdf_generated",
			entityType: "quote",
			entityId: quote._id,
			entityName: quote.title || `Quote ${quote.quoteNumber || quote._id}`,
			description: `Generated PDF for quote`,
			metadata: { quoteNumber: quote.quoteNumber, total: quote.total, version },
		});
	},

	async invoiceCreated(
		ctx: MutationCtx,
		invoice: Doc<"invoices">,
		clientName: string
	) {
		return createActivity(ctx, {
			activityType: "invoice_created",
			entityType: "invoice",
			entityId: invoice._id,
			entityName: `Invoice ${invoice.invoiceNumber}`,
			description: `Created invoice for ${clientName}`,
			metadata: { invoiceNumber: invoice.invoiceNumber, total: invoice.total },
		});
	},

	async invoiceSent(
		ctx: MutationCtx,
		invoice: Doc<"invoices">,
		clientName: string,
		changes?: FieldChange[]
	) {
		return createActivity(ctx, {
			activityType: "invoice_sent",
			entityType: "invoice",
			entityId: invoice._id,
			entityName: `Invoice ${invoice.invoiceNumber}`,
			description: `Sent invoice to ${clientName}`,
			metadata: {
				invoiceNumber: invoice.invoiceNumber,
				total: invoice.total,
				...(changes && changes.length > 0 ? { changes } : {}),
			},
		});
	},

	async invoicePaid(
		ctx: MutationCtx,
		invoice: Doc<"invoices">,
		clientName: string,
		changes?: FieldChange[]
	) {
		return createActivity(ctx, {
			activityType: "invoice_paid",
			entityType: "invoice",
			entityId: invoice._id,
			entityName: `Invoice ${invoice.invoiceNumber}`,
			description: `Payment received from ${clientName}`,
			metadata: {
				invoiceNumber: invoice.invoiceNumber,
				total: invoice.total,
				...(changes && changes.length > 0 ? { changes } : {}),
			},
		});
	},

	async taskCreated(
		ctx: MutationCtx,
		task: Doc<"tasks">,
		actor?: { userId: Id<"users">; orgId: Id<"organizations"> }
	) {
		return createActivity(ctx, {
			activityType: "task_created",
			entityType: "task",
			entityId: task._id,
			entityName: task.title,
			description: `Created task: ${task.title}`,
			actor,
		});
	},

	async taskCompleted(ctx: MutationCtx, task: Doc<"tasks">) {
		return createActivity(ctx, {
			activityType: "task_completed",
			entityType: "task",
			entityId: task._id,
			entityName: task.title,
			description: `Completed task: ${task.title}`,
		});
	},

	async organizationUpdated(
		ctx: MutationCtx,
		organization: Doc<"organizations">
	) {
		return createActivity(ctx, {
			activityType: "organization_updated",
			entityType: "organization",
			entityId: organization._id,
			entityName: organization.name,
			description: `Updated organization settings`,
		});
	},

	async memberPermissionsUpdated(
		ctx: MutationCtx,
		targetUser: Doc<"users">,
		permissions: Record<string, unknown>
	) {
		return createActivity(ctx, {
			activityType: "member_permissions_updated",
			entityType: "user",
			entityId: targetUser._id,
			entityName: targetUser.name,
			description: `Updated access permissions for ${targetUser.name}`,
			metadata: { permissions },
		});
	},
};
