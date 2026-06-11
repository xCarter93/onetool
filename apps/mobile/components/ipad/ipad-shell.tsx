import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
	Slot,
	usePathname,
	useRouter,
	type Href,
} from "expo-router";
import { useDevice } from "@/lib/use-device";
import { useTokens } from "@/lib/theme";
import {
	SelectionProvider,
	useSelection,
	type SelectionTab,
} from "@/lib/selection-context";
import { PadSidebar, type SidebarTab } from "@/components/ipad/pad-sidebar";
import { PaneDetailHost } from "@/components/ipad/pane-detail-host";

// The shell tracks one extra surface beyond the sidebar nav: Profile (reached
// via the footer, not a nav row). It never highlights a nav row — mapped to a
// non-matching SidebarTab when passed to PadSidebar.
type ShellTab = SidebarTab | "profile";

// ============================================================================
// IpadShell — top-level iPad layout (gated on device === "ipad" in (tabs)/
// _layout.tsx, AFTER the auth redirects). Mounts SelectionProvider BELOW the
// Convex key={convexKey} boundary (only rendered from the iPad branch) so an
// org switch remounts it and resets selection (T-26-04).
//
// ROUTER-INTEGRATION LAYER (issue #1):
//   A usePathname() effect reconciles expo-router route state → the shell's
//   local activeTab + SelectionProvider on EVERY pathname change, so route-
//   driven entry (search result, notification deep link, Home KPI push,
//   detail cross-link) lands inside the triptych — not a stale tab or a
//   full-screen route outside the shell:
//     /clients/[id]   → activeTab "clients"  + select("clients", id)
//     /projects/[id]  → activeTab "projects" + select("projects", id)
//     /quote/[id]     → activeTab "money"    + select("money", {quote, id})
//     /invoice/[id]   → activeTab "money"    + select("money", {invoice, id})
//     list routes (/, /clients, /projects, /money, /tasks, /profile)
//                     → set the matching activeTab, leave selection untouched
//                       (each tab's last selection persists — issue #11)
//
// STACK-ROUTE SLOT (the /clients/new-style decision, documented choice):
//   For a full-screen STACK route that is NOT a triptych detail route (e.g.
//   /clients/new), the shell renders expo-router's <Slot /> full-width in the
//   content pane beside the sidebar. CHOSEN MECHANISM = <Slot /> (not a
//   per-push shell helper) — it keeps routing declarative and lets the pushed
//   screen own its own header (headerMode="pane" handled by that screen in
//   26-02). isStackRoute() below detects these unrecognized routes.
//
//   NOTE: Wave 2 fills in the ACTUAL per-tab pane content (list panes, Home
//   dashboard, Profile pane). This plan ships the shell skeleton + the router
//   hook + the PaneDetailHost wiring + clearly-marked TODO slots so the shell
//   compiles and the structure is verifiable.
// ============================================================================

const MASTER_DETAIL: ShellTab[] = ["clients", "projects", "money"];

// Pure route → active-tab map. Detail routes resolve to their owning tab so the
// sidebar highlights correctly when entered via deep link / cross-link / search.
function tabFromPathname(pathname: string): ShellTab {
	if (/^\/clients\b/.test(pathname)) return "clients";
	if (/^\/projects\b/.test(pathname)) return "projects";
	if (/^\/(money|quote|invoice)\b/.test(pathname)) return "money";
	if (/^\/tasks\b/.test(pathname)) return "tasks";
	if (/^\/profile\b/.test(pathname)) return "profile";
	return "home";
}

function isStackRoute(pathname: string): boolean {
	// Triptych detail routes are reconciled into the shell (handled below); any
	// OTHER nested/stack route (e.g. /clients/new, /tasks/form) renders via Slot.
	if (/^\/clients\/new\b/.test(pathname)) return true;
	if (/^\/tasks\/(form|new)\b/.test(pathname)) return true;
	return false;
}

function IpadShellInner() {
	const t = useTokens();
	const router = useRouter();
	const { orientation } = useDevice();
	const { select } = useSelection();
	const pathname = usePathname();

	// activeTab is held in LOCAL STATE so a sidebar tap swaps only the content
	// pane — the iPad sidebar is a persistent frame, not a navigation push. A
	// router.push() for tab switching re-mounts the whole (tabs) layout and
	// slides the entire shell in, because the (tabs) group has no in-group
	// navigator (the shell renders pane content directly, not via Slot). Sidebar
	// taps set this state directly (no routing → no slide).
	//
	// Route-driven entry (deep link, notification, detail cross-link) still
	// reconciles: when the pathname changes EXTERNALLY we re-derive the tab at
	// render time (React's "adjust state when a prop changes" pattern — a plain
	// setState during render, NOT a setState-in-effect, which is error-level in
	// this repo). select() reconciliation runs in the effect below.
	const derivedTab = useMemo<ShellTab>(() => tabFromPathname(pathname), [pathname]);
	const [activeTab, setActiveTab] = useState<ShellTab>(derivedTab);
	const [syncedPathname, setSyncedPathname] = useState(pathname);
	if (pathname !== syncedPathname) {
		setSyncedPathname(pathname);
		setActiveTab(derivedTab);
	}

	// Route → selection reconciliation. On a detail route, sync the durable
	// selection so the triptych opens the target. select() dispatches to the
	// SelectionProvider reducer (an external-ish store), not local render state.
	useEffect(() => {
		let m: RegExpMatchArray | null;
		if ((m = pathname.match(/^\/clients\/([^/]+)$/)) && m[1] !== "new") {
			select("clients", m[1]);
		} else if ((m = pathname.match(/^\/projects\/([^/]+)$/))) {
			select("projects", m[1]);
		} else if ((m = pathname.match(/^\/quote\/([^/]+)$/))) {
			select("money", { kind: "quote", id: m[1] });
		} else if ((m = pathname.match(/^\/invoice\/([^/]+)$/))) {
			select("money", { kind: "invoice", id: m[1] });
		}
		// List routes leave selection untouched (each tab's last selection
		// persists — issue #11). select() is a stable dispatch.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	// Sidebar nav swaps the content pane in place (local state → no router push,
	// so the persistent sidebar never re-mounts or slides).
	const onNavigate = (tab: SidebarTab) => setActiveTab(tab);

	// "profile" is not a nav id, so passing it highlights no nav row (correct —
	// Profile is reached via the footer). Cast narrows ShellTab → SidebarTab.
	const sidebar = (
		<PadSidebar
			activeTab={activeTab as SidebarTab}
			onNavigate={onNavigate}
			onCreate={() => router.push("/create" as Href)}
			onProfile={() => setActiveTab("profile")}
			onNotifications={() => router.push("/notifications" as Href)}
		/>
	);

	// A full-screen stack route (e.g. /clients/new) → sidebar + full-width Slot.
	if (isStackRoute(pathname)) {
		return (
			<View style={[styles.root, { backgroundColor: t.surface }]}>
				{sidebar}
				<View style={styles.contentPane}>
					<Slot />
				</View>
			</View>
		);
	}

	const isMasterDetail = MASTER_DETAIL.includes(activeTab);
	const detailTab = activeTab as "clients" | "projects" | "money";

	// ── Portrait: sidebar + single content pane ──────────────────────────────
	if (orientation === "portrait") {
		return (
			<View style={[styles.root, { backgroundColor: t.surface }]}>
				{sidebar}
				<View style={styles.contentPane}>
					{/* TODO(26-02/03/04): per-tab portrait pane content (list → detail
					    push within the pane). For now, master-detail tabs render the
					    detail host (placeholder until a selection exists). */}
					{isMasterDetail ? (
						<PaneDetailHost tab={detailTab} />
					) : (
						<PortraitSlot tab={activeTab} />
					)}
				</View>
			</View>
		);
	}

	// ── Landscape: sidebar + (master-detail) 330px list pane + flex detail ────
	return (
		<View style={[styles.root, { backgroundColor: t.surface }]}>
			{sidebar}
			{isMasterDetail ? (
				<>
					{/* TODO(26-02/03/04): the 330px list pane content. */}
					<View style={[styles.listPane, { borderRightColor: t.line }]}>
						<ListPaneSlot tab={detailTab} />
					</View>
					<View style={styles.detailPane}>
						<PaneDetailHost tab={detailTab} />
					</View>
				</>
			) : (
				// TODO(26-02/03/04): Home wide dashboard, Tasks wide list, Profile pane.
				<View style={styles.contentPane}>
					<PortraitSlot tab={activeTab} />
				</View>
			)}
		</View>
	);
}

// Wave-2 fill-in slots — kept minimal so the shell compiles + the structure is
// verifiable. These will be replaced by the real per-tab content.
function PortraitSlot({ tab }: { tab: ShellTab }) {
	const t = useTokens();
	return <View style={[styles.slot, { backgroundColor: t.surface }]} accessibilityLabel={`${tab}-pane`} />;
}
function ListPaneSlot({ tab }: { tab: SelectionTab }) {
	const t = useTokens();
	return <View style={[styles.slot, { backgroundColor: t.surface }]} accessibilityLabel={`${tab}-list`} />;
}

export function IpadShell() {
	return (
		<SelectionProvider>
			<IpadShellInner />
		</SelectionProvider>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		flexDirection: "row",
	},
	contentPane: {
		flex: 1,
		position: "relative",
		overflow: "hidden",
	},
	listPane: {
		width: 330,
		flexShrink: 0,
		borderRightWidth: 1,
		overflow: "hidden",
	},
	detailPane: {
		flex: 1,
		position: "relative",
		overflow: "hidden",
	},
	slot: {
		flex: 1,
	},
});
