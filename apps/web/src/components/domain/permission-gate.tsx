"use client";

import type { ReactNode } from "react";
import type { PermissionObject } from "@onetool/backend/convex/lib/permissionKeys";
import { EmptyState } from "@/components/domain/empty-state";
import { usePermissions, type RequiredLevel } from "@/hooks/use-permissions";

interface PermissionGateProps {
	object: PermissionObject;
	level?: RequiredLevel;
	/** Rendered instead of the default no-access panel when denied. */
	fallback?: ReactNode;
	children: ReactNode;
}

/**
 * Page/section-level UX gate on a granular permission grant. Composes with
 * premium gates where both apply (both must pass). Convex functions remain the
 * authoritative gate — this only keeps denied users from seeing broken pages.
 */
export function PermissionGate({
	object,
	level = "view",
	fallback,
	children,
}: PermissionGateProps) {
	const { can, isLoading } = usePermissions();

	if (isLoading) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
			</div>
		);
	}

	if (!can(object, level)) {
		return (
			fallback ?? (
				<div className="flex min-h-[50vh] items-center justify-center p-6">
					<EmptyState
						size="md"
						illustration="access-restricted"
						title="You don't have access to this area"
						description="Ask an organization admin to grant you access from the team settings."
					/>
				</div>
			)
		);
	}

	return <>{children}</>;
}
