import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import {
	levelAtLeast,
	type AccessLevel,
	type PermissionObject,
} from "@onetool/backend/convex/lib/permissionKeys";

export type RequiredLevel = Exclude<AccessLevel, "none">;

// Port of web's use-permissions hook (UX-layer gating only — the Convex-side
// requireLevel is the authoritative gate). Mobile consumers feed `can` into
// the status→CTA resolver's capability flags.
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
		return {
			can,
			isLoading: data === undefined,
		};
	}, [data]);
}
