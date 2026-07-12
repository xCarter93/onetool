"use client";

import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import {
	levelAtLeast,
	PERMISSION_OBJECTS,
	type AccessLevel,
	type PermissionObject,
} from "@onetool/backend/convex/lib/permissionKeys";

export type RequiredLevel = Exclude<AccessLevel, "none">;

/**
 * UX-layer permission gating (sidebar, routes, actions). Reactive: an admin
 * flipping a grant re-renders the target user's open tabs immediately. The
 * Convex-side requireLevel is the authoritative gate — a stale client can only
 * briefly show a link that errors on use.
 */
export function usePermissions() {
	const data = useQuery(api.permissions.myPermissions);

	return useMemo(() => {
		const can = (
			object: PermissionObject,
			level: RequiredLevel = "view"
		): boolean => {
			if (!data) return false;
			if (data.all) return true;
			const grant = data.grants[object];
			return !!grant && levelAtLeast(grant.level, level);
		};
		const hasAllRecords = (object: PermissionObject): boolean =>
			!!data &&
			(data.all ||
				PERMISSION_OBJECTS[object].scope === null ||
				data.grants[object]?.allRecords === true);
		return {
			can,
			hasAllRecords,
			/** Owner/admin implicit full access. */
			hasFullAccess: data?.all === true,
			isLoading: data === undefined,
		};
	}, [data]);
}
