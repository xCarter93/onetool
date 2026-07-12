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
import {
	checkAllRecords,
	checkLevel,
	denyPermission,
	getEffectivePermissionsFor,
	isMember,
	permissionsEnforced,
	type EffectivePermissions,
	type RequiredLevel,
} from "./permissions";
import type { PermissionObject } from "./permissionKeys";
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
	object: PermissionObject,
	list: T[],
	getAssignees: (item: T) => Id<"users"> | Id<"users">[] | null | undefined
) => Promise<T[]>;

/** Assignment closure for derived scoping (PRD §3.2): the caller's assigned projects + their clients. */
export type ActorScope = {
	projectIds: Set<Id<"projects">>;
	clientIds: Set<Id<"clients">>;
};

export type UserFunctionExtras = {
	user: Doc<"users">;
	orgId: Id<"organizations">;
	orgEntity: OrgEntity;
	scopedToActor: ScopedToActor;
	/** Pure verdict: caller has ≥`level` on `object`. */
	can: (object: PermissionObject, level: RequiredLevel) => Promise<boolean>;
	/** Level gate. Shadow mode: warns instead of throwing. */
	requireLevel: (
		object: PermissionObject,
		level: RequiredLevel
	) => Promise<void>;
	/** Caller sees all records of `object` (owner/admin, unscoped object, or allRecords grant). */
	hasAllRecords: (object: PermissionObject) => Promise<boolean>;
	actorScope: () => Promise<ActorScope>;
	/**
	 * Record-scope gate for writes on scopable objects. Skipped under
	 * hasAllRecords; otherwise `isInScope` decides (compute lazily — only runs
	 * when needed). Shadow mode: warns instead of throwing.
	 */
	requireRecordScope: (
		object: PermissionObject,
		isInScope: () => boolean | Promise<boolean>
	) => Promise<void>;
	/**
	 * Derived-scope list filter. Under hasAllRecords returns `rows` untouched;
	 * otherwise keeps rows where `keep(row, scope)`. Shadow mode: warns with the
	 * would-hide count and returns everything.
	 */
	applyReadScope: <T>(
		object: PermissionObject,
		rows: T[],
		keep: (row: T, scope: ActorScope) => boolean
	) => Promise<T[]>;
	/**
	 * For cross-cutting reads composing several object types: should this
	 * object's bucket be included? Shadow mode: warns on would-deny, returns true.
	 */
	gateRead: (object: PermissionObject) => Promise<boolean>;
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

function makeOrgExtras(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">,
	orgId: Id<"organizations">
): UserFunctionExtras {
	// Lazily memoized: functions that never check permissions pay nothing;
	// multiple checks cost at most one extra indexed read + one org get.
	let grantsPromise: Promise<EffectivePermissions> | null = null;
	const grants = () =>
		(grantsPromise ??= getEffectivePermissionsFor(ctx, user, orgId));

	const can = async (object: PermissionObject, level: RequiredLevel) =>
		checkLevel(await grants(), object, level);
	const hasAllRecords = async (object: PermissionObject) =>
		checkAllRecords(await grants(), object);

	let scopePromise: Promise<ActorScope> | null = null;
	const actorScope = () =>
		(scopePromise ??= (async () => {
			const projects = await ctx.db
				.query("projects")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
			const mine = projects.filter((p) =>
				p.assignedUserIds?.includes(user._id)
			);
			return {
				projectIds: new Set(mine.map((p) => p._id)),
				clientIds: new Set(mine.map((p) => p.clientId)),
			};
		})());

	const scopedToActor: ScopedToActor = async (object, list, getAssignees) => {
		// Legacy verdict (role-based) stays authoritative in shadow mode; the
		// grant-based verdict takes over on enforcement. Divergence is logged.
		const legacyScoped = await isMember(ctx);
		const grantScoped = !(await hasAllRecords(object));
		if (legacyScoped !== grantScoped && !permissionsEnforced()) {
			console.warn(
				`[permissions-shadow] scopedToActor(${object}) divergence: legacy=${legacyScoped} grants=${grantScoped} user=${user._id} org=${orgId}`
			);
		}
		const scoped = permissionsEnforced() ? grantScoped : legacyScoped;
		if (!scoped) return list;

		return list.filter((item) => {
			const assignees = getAssignees(item);
			if (assignees == null) return false;
			return Array.isArray(assignees)
				? assignees.includes(user._id)
				: assignees === user._id;
		});
	};

	return {
		user,
		orgId,
		orgEntity: makeOrgEntity(ctx, orgId),
		scopedToActor,
		can,
		hasAllRecords,
		actorScope,
		requireLevel: async (object, level) => {
			if (!(await can(object, level))) {
				denyPermission({ object, level, userId: user._id, orgId });
			}
		},
		requireRecordScope: async (object, isInScope) => {
			if (await hasAllRecords(object)) return;
			if (!(await isInScope())) {
				denyPermission({ object, scope: true, userId: user._id, orgId });
			}
		},
		applyReadScope: async (object, rows, keep) => {
			if (await hasAllRecords(object)) return rows;
			const scope = await actorScope();
			if (permissionsEnforced()) {
				return rows.filter((row) => keep(row, scope));
			}
			const hidden = rows.reduce(
				(n, row) => (keep(row, scope) ? n : n + 1),
				0
			);
			if (hidden > 0) {
				console.warn(
					`[permissions-shadow] would hide ${hidden}/${rows.length} ${object} rows user=${user._id} org=${orgId}`
				);
			}
			return rows;
		},
		gateRead: async (object) => {
			if (await can(object, "view")) return true;
			if (permissionsEnforced()) return false;
			console.warn(
				`[permissions-shadow] would exclude ${object} from cross-cutting read user=${user._id} org=${orgId}`
			);
			return true;
		},
	};
}

function makeOrgCtx(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
	return getCurrentUserOrgId(ctx).then((orgId) =>
		makeOrgExtras(ctx, user, orgId)
	);
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

		return makeOrgExtras(ctx, user, orgId);
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
