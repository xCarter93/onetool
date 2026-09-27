import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useMemo } from "react";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import {
	levelAtLeast,
	type AccessLevel,
	type PermissionObject,
} from "@onetool/backend/convex/lib/permissionKeys";

export type RequiredLevel = Exclude<AccessLevel, "none">;

// Port of web's use-permissions hook (UX-layer gating only — the Convex-side
// requireLevel is the authoritative gate). Mobile consumers feed `can` into
// the status→CTA resolver's capability flags.
type MyPermissions = FunctionReturnType<typeof api.permissions.myPermissions>;

export function canWith(
	data: MyPermissions | null | undefined,
	object: PermissionObject,
	level: RequiredLevel = "view"
): boolean {
	if (!data) return false;
	if (data.all) return true;
	const grant = data.grants[object];
	return !!grant && levelAtLeast(grant.level, level);
}

export function usePermissions() {
	const data = useQuery(api.permissions.myPermissions);

	return useMemo(() => {
		const can = (object: PermissionObject, level: RequiredLevel = "view") =>
			canWith(data, object, level);
		return {
			can,
			isLoading: data === undefined,
		};
	}, [data]);
}

/**
 * `can` from the offline cache, for gating queries that throw FORBIDDEN. The
 * live hook reads false while offline, which would blank cached screens.
 */
export function useCachedCan() {
	const data = useCachedQuery(api.permissions.myPermissions, {});
	return useCallback(
		(object: PermissionObject, level: RequiredLevel = "view") => canWith(data, object, level),
		[data]
	);
}
