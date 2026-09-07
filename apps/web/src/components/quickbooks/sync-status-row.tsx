"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, CircleDashed, Landmark } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { DrawerField } from "@/components/shared/detail-drawer";
import { formatRelativeTime } from "@/lib/notification-utils";

type QboEntityType = "client" | "invoice" | "payment";

type SyncState =
	| { kind: "hidden" }
	| { kind: "loading" }
	| { kind: "failed"; lastError?: string }
	| { kind: "not_synced" }
	| { kind: "synced"; lastSyncedAt: number; syncWarning?: string };

/**
 * Per-record sync state from the queries the workspace already exposes. A
 * failed job wins over a stale link, so a record whose latest change failed
 * never reads "Synced". Queued jobs have no public query yet, so an unlinked
 * record reads "Not synced yet" rather than "Queued".
 */
function useSyncState(entityType: QboEntityType, localId: string): SyncState {
	const connection = useQuery(api.quickbooks.getConnectionStatus);
	const link = useQuery(api.quickbooks.getEntityLink, { entityType, localId });
	const errors = useQuery(api.quickbooks.listSyncErrors);

	if (connection === undefined || link === undefined || errors === undefined) {
		return { kind: "loading" };
	}
	if (!connection || connection.status === "disconnected") {
		return { kind: "hidden" };
	}
	const failed = errors.find(
		(row) => row.entityType === entityType && row.localId === localId,
	);
	if (failed) return { kind: "failed", lastError: failed.lastError };
	if (!link) return { kind: "not_synced" };
	return {
		kind: "synced",
		lastSyncedAt: link.lastSyncedAt,
		syncWarning: link.syncWarning,
	};
}

/** Icon + text pair shared by the sidebar row and the drawer field. */
function SyncStatusValue({ state }: { state: SyncState }) {
	if (state.kind === "failed") {
		return (
			<span
				className="inline-flex items-center gap-1.5 text-sm text-destructive"
				title={state.lastError}
			>
				<AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span className="min-w-0 truncate">
					Sync failed. See Sync issues in Integrations
				</span>
			</span>
		);
	}
	if (state.kind === "not_synced") {
		return (
			<span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
				<CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span className="min-w-0 truncate">Not synced yet</span>
			</span>
		);
	}
	if (state.kind !== "synced") return null;
	const { lastSyncedAt, syncWarning } = state;
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
 * nothing when the org is not premium or QuickBooks is not connected.
 */
export function QuickBooksSyncRow({
	entityType,
	localId,
}: {
	entityType: QboEntityType;
	localId: string;
}) {
	const state = useSyncState(entityType, localId);
	if (state.kind === "hidden" || state.kind === "loading") return null;

	return (
		<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
			<Landmark className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
			<span className="text-sm text-muted-foreground w-28 shrink-0">
				QuickBooks
			</span>
			<div className="flex-1 min-w-0">
				<SyncStatusValue state={state} />
			</div>
		</div>
	);
}

/**
 * Drawer variant: a `DrawerField` for the Details grid, or nothing when
 * QuickBooks is not connected. Render inside a `DrawerFieldGrid`.
 */
export function QuickBooksSyncField({
	entityType,
	localId,
}: {
	entityType: QboEntityType;
	localId: string;
}) {
	const state = useSyncState(entityType, localId);
	if (state.kind === "hidden" || state.kind === "loading") return null;

	return (
		<DrawerField label="QuickBooks">
			<SyncStatusValue state={state} />
		</DrawerField>
	);
}
