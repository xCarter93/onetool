import React from "react";
import { useSelection } from "@/lib/selection-context";
import { DetailPlaceholder } from "@/components/ipad/detail-placeholder";
import { ClientDetailBody } from "@/app/(tabs)/clients/[clientId]";
import { ProjectDetailBody } from "@/app/(tabs)/projects/[projectId]";
import { QuoteDetailBody } from "@/app/quote/[id]";
import { InvoiceDetailBody } from "@/app/invoice/[id]";

// ============================================================================
// PaneDetailHost — renders the selected detail body inside an iPad pane.
//
// HEADER-OWNERSHIP CONVENTION (LOCKED — single source of truth, issue #3):
//   The shell owns the header. A pane renders EXACTLY ONE title/back row —
//   never two (no double chrome). Concretely:
//     • Detail bodies render their OWN header via <AppHeader mode="pane"> (a
//       light title + back row). When the shell mounts a detail body it does
//       NOT also mount a <PaneHeader> title above it — "shell owns" means the
//       shell decides which single header appears, and for detail panes it
//       delegates that one header to the body's AppHeader mode="pane".
//     • List-body panes suppress their own AppHeader (pass headerMode="pane")
//       and let the shell mount <PaneHeader> above them.
//   Wave 2 plans (26-02, 26-03, 26-04) MUST follow this exact rule. There is no
//   "PaneHeader OR mode='pane'" ambiguity: one pane → one title/back row.
//
// DETAIL-RENDER-IN-PANE MECHANISM — Option B (body extraction) = DEFAULT/PRIMARY.
//   Decision: shipped Option B. Option A (a nested in-pane <Stack>) was NOT
//   attempted — Option B's blast radius is small and bounded, and it avoids a
//   nested-navigator full-screen-takeover risk entirely.
//   Option A spike checklist result: N/A (Option B shipped directly).
//
//   API contract (Wave 2 consumes this):
//     • Each detail route file exports a named `<X>DetailBody` component:
//         ClientDetailBody  ({ id, headerMode? })
//         ProjectDetailBody ({ id, headerMode? })
//         QuoteDetailBody   ({ id, headerMode? })
//         InvoiceDetailBody ({ id, headerMode? })
//       `headerMode` DEFAULTS to "root" → the route wrapper (default export) is
//       byte-identical to the iPhone screen. In a pane pass headerMode="pane".
//     • The route file's default export is a thin wrapper that reads
//       useLocalSearchParams and renders the body in "root" mode.
//     • PaneDetailHost imports the *DetailBody components DIRECTLY (no nested
//       navigator) and switches on the selection.
//
//   Bounded blast radius — ONLY these five files were touched for Option B:
//     app/(tabs)/clients/[clientId].tsx, app/(tabs)/projects/[projectId].tsx,
//     app/quote/[id].tsx, app/invoice/[id].tsx, components/app-header.tsx
//     (the headerMode plumbing). No list screen or shared component changed.
// ============================================================================

interface PaneDetailHostProps {
	tab: "clients" | "projects" | "money";
}

export function PaneDetailHost({ tab }: PaneDetailHostProps) {
	const { state } = useSelection();

	if (tab === "clients") {
		if (!state.clients) return <DetailPlaceholder tab="clients" />;
		return <ClientDetailBody id={state.clients} headerMode="pane" />;
	}

	if (tab === "projects") {
		if (!state.projects) return <DetailPlaceholder tab="projects" />;
		return <ProjectDetailBody id={state.projects} headerMode="pane" />;
	}

	// Money carries {kind,id} so the host routes to the quote vs invoice body.
	if (!state.money) return <DetailPlaceholder tab="money" />;
	return state.money.kind === "quote" ? (
		<QuoteDetailBody id={state.money.id} headerMode="pane" />
	) : (
		<InvoiceDetailBody id={state.money.id} headerMode="pane" />
	);
}
