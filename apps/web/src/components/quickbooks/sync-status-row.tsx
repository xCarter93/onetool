"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Landmark } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { DrawerField } from "@/components/shared/detail-drawer";
import { formatRelativeTime } from "@/lib/notification-utils";

type QboEntityType = "client" | "invoice" | "payment";

/** Icon + text pair shared by the sidebar row and the drawer field. */
function SyncStatusValue({
	lastSyncedAt,
	syncWarning,
}: {
	lastSyncedAt: number;
	syncWarning?: string;
}) {
	if (syncWarning) {
		return (
			<span
				className="inline-flex items-center gap-1.5 text-sm text-warning-foreground dark:text-warning"
				title={syncWarning}
			>
				<AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span className="min-w-0 truncate">
					Synced with a warning {formatRelativeTime(lastSyncedAt)}
				</span>
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1.5 text-sm text-foreground">
			<CheckCircle2
				className="h-3.5 w-3.5 shrink-0 text-success"
				aria-hidden="true"
			/>
			<span className="min-w-0 truncate">
				Synced {formatRelativeTime(lastSyncedAt)}
			</span>
		</span>
	);
}

/**
 * Metadata row for the invoice/client detail sidebars. Matches the sidebar's
 * icon + fixed-width label + value grammar. Renders nothing while loading and
 * nothing when the org is not premium, not connected, or the record has never
 * synced (`getEntityLink` returns null in all three cases).
 */
export function QuickBooksSyncRow({
	entityType,
	localId,
}: {
	entityType: QboEntityType;
	localId: string;
}) {
	const link = useQuery(api.quickbooks.getEntityLink, { entityType, localId });
	if (!link) return null;

	return (
		<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
			<Landmark className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
			<span className="text-sm text-muted-foreground w-28 shrink-0">
				QuickBooks
			</span>
			<div className="flex-1 min-w-0">
				<SyncStatusValue
					lastSyncedAt={link.lastSyncedAt}
					syncWarning={link.syncWarning}
				/>
			</div>
		</div>
	);
}

/**
 * Drawer variant: a `DrawerField` for the Details grid, or nothing when the
 * record has no QuickBooks link. Render inside a `DrawerFieldGrid`.
 */
export function QuickBooksSyncField({
	entityType,
	localId,
}: {
	entityType: QboEntityType;
	localId: string;
}) {
	const link = useQuery(api.quickbooks.getEntityLink, { entityType, localId });
	if (!link) return null;

	return (
		<DrawerField label="QuickBooks">
			<SyncStatusValue
				lastSyncedAt={link.lastSyncedAt}
				syncWarning={link.syncWarning}
			/>
		</DrawerField>
	);
}
