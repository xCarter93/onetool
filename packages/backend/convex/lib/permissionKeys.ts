/**
 * Granular RBAC — the single permission registry.
 *
 * Shared between the Convex backend (enforcement) and the web app (UI) via
 * `@onetool/backend/convex/lib/permissionKeys`. Pure module: no Convex imports,
 * no ctx — safe to import from either side.
 */

export const ACCESS_LEVELS = ["none", "view", "modify", "delete"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * How "records scoped to them" is determined when a grant's `allRecords` is off:
 *   "direct"  = an assignment/creator field on the record itself
 *   "derived" = computed from the user's assigned projects (the assignment
 *               closure — see PRD §3.2)
 *   null      = not scopable; view is always org-wide
 */
export type ScopeKind = "direct" | "derived" | null;

type PermissionObjectDef = {
	maxLevel: AccessLevel;
	scope: ScopeKind;
};

/**
 * The registry. `maxLevel` caps the ladder for objects without a full CRUD
 * surface (e.g. Community/Inbox stop at "modify" — no discrete delete action).
 */
export const PERMISSION_OBJECTS = {
	clients: { maxLevel: "delete", scope: "derived" }, // clients with ≥1 project assigned to the user
	projects: { maxLevel: "delete", scope: "direct" }, // assignedUserIds
	tasks: { maxLevel: "delete", scope: "direct" }, // assigneeUserId
	quotes: { maxLevel: "delete", scope: "derived" }, // via projectId, clientId fallback
	invoices: { maxLevel: "delete", scope: "derived" }, // via projectId, clientId fallback
	skus: { maxLevel: "delete", scope: null },
	documents: { maxLevel: "delete", scope: "derived" }, // follows the parent entity's visibility
	orgDocuments: { maxLevel: "delete", scope: null }, // org-level by nature (Settings → Documents)
	community: { maxLevel: "modify", scope: null }, // single page per org; modify = upsert/publish/images
	automations: { maxLevel: "delete", scope: null }, // modify incl. publish/toggle/test+manual runs
	reports: { maxLevel: "delete", scope: "direct" }, // createdBy
	inbox: { maxLevel: "modify", scope: null }, // v1 org-wide; derived-by-thread-client = follow-up
	billing: { maxLevel: "modify", scope: null }, // view = see /subscription; modify = checkout/manage
} as const satisfies Record<string, PermissionObjectDef>;

export type PermissionObject = keyof typeof PERMISSION_OBJECTS;

export type ObjectGrant = {
	level: AccessLevel;
	allRecords?: boolean; // scopable objects only; false/absent = assigned-only
};
export type PermissionGrants = Partial<Record<PermissionObject, ObjectGrant>>;

/**
 * Bumped when the default grant set or object registry changes in a way that
 * warrants a lazy reconcile of existing membership rows. Stored on the
 * membership as `permissionsVersion`.
 */
export const PERMISSIONS_VERSION = 1;

/** Ladder comparison: is `actual` at least `required`? */
export function levelAtLeast(actual: AccessLevel, required: AccessLevel): boolean {
	return ACCESS_LEVELS.indexOf(actual) >= ACCESS_LEVELS.indexOf(required);
}

/** True when the object supports "all records vs. scoped-to-me" (scope !== null). */
export function isScopable(object: PermissionObject): boolean {
	return PERMISSION_OBJECTS[object].scope !== null;
}

/** Narrowing guard for untrusted string keys (mutation args, stored records). */
export function isPermissionObject(key: string): key is PermissionObject {
	return key in PERMISSION_OBJECTS;
}

/**
 * Member defaults: read + edit on projects and tasks scoped to them, nothing
 * else. Matches what members can already see in the sidebar today (Projects +
 * Tasks only) while tightening the backend. `modify` includes create (merged
 * ladder); scoped creates auto-assign the creator (PRD §3.2).
 */
export const DEFAULT_MEMBER_PERMISSIONS: PermissionGrants = {
	projects: { level: "modify" }, // assigned-only (allRecords absent)
	tasks: { level: "modify" }, // assigned-only
};
