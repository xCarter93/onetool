import React from "react";
import type { RecordRef, SelectionTab } from "@/lib/selection-context";
import { DetailPlaceholder } from "@/components/ipad/detail-placeholder";
import { ClientDetailBody } from "@/app/(tabs)/clients/[clientId]";
import { ProjectDetailBody } from "@/app/(tabs)/projects/[projectId]";
import { QuoteDetailBody } from "@/app/quote/[id]";
import { InvoiceDetailBody } from "@/app/invoice/[id]";

// ============================================================================
// PaneDetailHost — the ONE place a record kind maps to a detail body. Both
// orientations render through it, so portrait and landscape can never disagree
// about which body a selection opens.
//
// HEADER OWNERSHIP (LOCKED): one pane renders exactly ONE title/back row. For a
// detail pane the shell delegates that row to the body's own AppHeader
// mode="pane" — so never mount a PaneHeader above a PaneDetailHost.
//
// Detail bodies are imported DIRECTLY (no nested navigator): each detail route
// exports a named `<X>DetailBody` whose `headerMode` defaults to "root", leaving
// the iPhone route wrapper byte-identical. `onBack` is set in PORTRAIT only —
// landscape keeps the list pane visible, so there is nothing to go back to.
// ============================================================================

export function PaneDetailHost({
	context,
	record,
	onBack,
}: {
	/** Which pane is asking — picks the empty-state glyph. */
	context: SelectionTab;
	record: RecordRef | null;
	onBack?: () => void;
}) {
	if (!record) return <DetailPlaceholder context={context} />;

	switch (record.kind) {
		case "client":
			return (
				<ClientDetailBody id={record.id} headerMode="pane" onBack={onBack} />
			);
		case "project":
			return (
				<ProjectDetailBody id={record.id} headerMode="pane" onBack={onBack} />
			);
		case "quote":
			return <QuoteDetailBody id={record.id} headerMode="pane" onBack={onBack} />;
		case "invoice":
			return (
				<InvoiceDetailBody id={record.id} headerMode="pane" onBack={onBack} />
			);
	}
}
