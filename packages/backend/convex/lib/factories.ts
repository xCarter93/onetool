import {
	customCtx,
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import {
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import {
	getCurrentUser,
	getCurrentUserOrgId,
	getCurrentUserOrThrow,
} from "./auth";
import { isMember } from "./permissions";
import { getOptionalOrgId } from "./queries";

/**
 * Org-scoped Convex function factories.
 *
 * Exports:
 * - userMutation: authenticated Clerk user + active org required.
 * - userQuery: authenticated Clerk user + active org required.
 * - optionalUserQuery: returns only { user: null, orgId: null } when identity
 *   or active org is missing; org helpers exist only on the authed branch.
 * - systemMutation: internal mutation for trusted callers that pass
 *   orgId: Id<"organizations">. The factory consumes orgId before the handler.
 */

export type OrgEntity = {
	<T extends TableNames>(table: T, id: Id<T>): Promise<Doc<T>>;
	<T extends TableNames>(
		table: T,
		id: Id<T>,
		opts: { onMismatch: "throw" }
	): Promise<Doc<T>>;
	<T extends TableNames>(
		table: T,
		id: Id<T>,
		opts: { onMismatch: "skip" }
	): Promise<Doc<T> | null>;
};

export type ScopedToActor = <T>(
	list: T[],
	getAssignees: (item: T) => Id<"users"> | Id<"users">[] | null | undefined
) => Promise<T[]>;

export type UserFunctionExtras = {
	user: Doc<"users">;
	orgId: Id<"organizations">;
	orgEntity: OrgEntity;
	scopedToActor: ScopedToActor;
};

export type UserQueryCtx = QueryCtx & UserFunctionExtras;
export type UserMutationCtx = MutationCtx & UserFunctionExtras;

const ORG_ENTITY_NAMES: Partial<Record<TableNames, string>> = {
	clients: "Client",
	clientContacts: "Contact",
	clientProperties: "Property",
	invoices: "Invoice",
	invoiceLineItems: "Invoice line item",
	notifications: "Notification",
	payments: "Payment",
	projects: "Project",
	quoteLineItems: "Quote line item",
	quotes: "Quote",
	reports: "Report",
	tasks: "Task",
};

function displayNameForTable(table: TableNames): string {
	return ORG_ENTITY_NAMES[table] ?? String(table);
}

function makeOrgEntity(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"organizations">
): OrgEntity {
	return (async <T extends TableNames>(
		table: T,
		id: Id<T>,
		opts?: { onMismatch?: "throw" | "skip" }
	): Promise<Doc<T> | null> => {
		const entity = await ctx.db.get(id);

		if (entity === null) {
			throw new Error(`Entity not found in ${String(table)}: ${id}`);
		}

		if (!("orgId" in entity) || (entity as { orgId?: unknown }).orgId == null) {
			throw new Error(
				`${String(table)} is not org-scoped - cannot use ctx.orgEntity`
			);
		}

		if ((entity as unknown as { orgId: Id<"organizations"> }).orgId !== orgId) {
			if (opts?.onMismatch === "skip") return null;
			throw new Error(
				`${displayNameForTable(table)} does not belong to your organization`
			);
		}

		return entity as unknown as Doc<T>;
	}) as OrgEntity;
}

function makeScopedToActor(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">
): ScopedToActor {
	return async <T>(
		list: T[],
		getAssignees: (item: T) => Id<"users"> | Id<"users">[] | null | undefined
	): Promise<T[]> => {
		if (!(await isMember(ctx))) return list;

		return list.filter((item) => {
			const assignees = getAssignees(item);
			if (assignees == null) return false;
			return Array.isArray(assignees)
				? assignees.includes(user._id)
				: assignees === user._id;
		});
	};
}

function makeOrgCtx(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
	const orgIdPromise = getCurrentUserOrgId(ctx);

	return orgIdPromise.then((orgId) => ({
		user,
		orgId,
		orgEntity: makeOrgEntity(ctx, orgId),
		scopedToActor: makeScopedToActor(ctx, user),
	}));
}

export const userMutation = customMutation(
	mutation,
	customCtx(async (ctx: MutationCtx) => {
		const user = await getCurrentUserOrThrow(ctx);
		return await makeOrgCtx(ctx, user);
	})
);

export const userQuery = customQuery(
	query,
	customCtx(async (ctx: QueryCtx) => {
		const user = await getCurrentUserOrThrow(ctx);
		return await makeOrgCtx(ctx, user);
	})
);

export const optionalUserQuery = customQuery(
	query,
	customCtx(async (ctx: QueryCtx) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return { user: null, orgId: null } as const;
		}

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return { user: null, orgId: null } as const;
		}

		return {
			user,
			orgId,
			orgEntity: makeOrgEntity(ctx, orgId),
			scopedToActor: makeScopedToActor(ctx, user),
		};
	})
);

export const systemMutation = customMutation(internalMutation, {
	args: { orgId: v.id("organizations") },
	input: async (ctx: MutationCtx, { orgId }: { orgId: Id<"organizations"> }) => {
		const organization = await ctx.db.get(orgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		return {
			ctx: {
				orgId,
				orgEntity: makeOrgEntity(ctx, orgId),
			},
			args: {},
		};
	},
});
