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
} from "@/lib/selection-context";
import { PadSidebar, type SidebarTab } from "@/components/ipad/pad-sidebar";
import { PaneDetailHost } from "@/components/ipad/pane-detail-host";
import { PaneHeader } from "@/components/ipad/pane-header";
import { DetailPlaceholder } from "@/components/ipad/detail-placeholder";
import {
	ShellNavProvider,
	consumeShellCreate,
	type ShellNav,
	type ShellNavTab,
} from "@/lib/shell-nav";
import ClientsScreen from "@/app/(tabs)/clients/index";
import ProjectsScreen from "@/app/(tabs)/projects/index";
import { ClientDetailBody } from "@/app/(tabs)/clients/[clientId]";
import { ClientCreateBody } from "@/app/(tabs)/clients/new";
import { ProjectDetailBody } from "@/app/(tabs)/projects/[projectId]";

// Master-detail list-pane bodies + their PaneHeader titles, keyed by tab. The
// shell owns the ONE list-pane header (PaneHeader); the body renders with
// headerMode="pane" to suppress its own AppHeader (locked single-header
// convention from 26-01). The detail body owns its OWN one header (PaneHeader
// via the onBack prop — see below).
const LIST_PANE: Record<
	"clients" | "projects",
	{ title: string; Screen: typeof ClientsScreen }
> = {
	clients: { title: "Clients", Screen: ClientsScreen },
	projects: { title: "Work", Screen: ProjectsScreen },
};

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

// Overlay/modal routes that do NOT map to a shell tab. On iPad these present as
// transparentModal (26-05), which keeps the (tabs) shell MOUNTED underneath, so
// usePathname() reports the overlay route while the shell still renders. Syncing
// activeTab off these would (a) jump the underlying tab to "home" and (b) — because
// a transparent modal leaves usePathname() resolving inconsistently between the
// overlay and the underlying route across renders — fire setState every render,
// crashing with "Maximum update depth exceeded". The shell ignores them: the
// underlying tab stays put while an overlay is open.
function isOverlayRoute(pathname: string): boolean {
	if (/^\/(notifications|create|search|org-switch|day-sheet|journey)(\/|$)/.test(pathname)) {
		return true;
	}
	if (/^\/tasks\/(form|new)(\/|$)/.test(pathname)) return true;
	return false;
}

function IpadShellInner() {
	const t = useTokens();
	const router = useRouter();
	const { orientation } = useDevice();
	const { state, select, clear } = useSelection();
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
	// Reconcile ONLY for real shell routes; skip overlay/modal routes (they keep
	// the shell mounted underneath and would otherwise loop — see isOverlayRoute).
	if (pathname !== syncedPathname && !isOverlayRoute(pathname)) {
		setSyncedPathname(pathname);
		setActiveTab(derivedTab);
	}

	// In-pane create surface. When set, the content pane renders that tab's
	// create body instead of the list/detail (no router.push → no slide). The
	// ＋Create modal (outside the shell tree) hands its request via the module-
	// level pendingCreate signal, consumed here at render time: read-and-clear,
	// then switch the active tab + open create. This is the "adjust state when a
	// prop changes" render-time setState pattern (NOT setState-in-effect).
	const [creating, setCreating] = useState<ShellNavTab | null>(null);
	const pendingCreate = consumeShellCreate();
	if (pendingCreate && creating !== pendingCreate) {
		setActiveTab(pendingCreate);
		setCreating(pendingCreate);
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
	// so the persistent sidebar never re-mounts or slides). Also exits any open
	// create surface — tapping a nav row abandons the in-pane create.
	const onNavigate = (tab: SidebarTab) => {
		setActiveTab(tab);
		setCreating(null);
	};

	// In-pane navigation for detail bodies / list screens rendered INSIDE the
	// shell (provided via ShellNavProvider below). A cross-link (client → project,
	// project → client, "View all") switches the tab + selection in place instead
	// of router.push-ing a (tabs) sibling, which would re-mount and slide the whole
	// shell. On iPhone there is no provider, so those callers fall back to router.
	const shellNav = useMemo<ShellNav>(
		() => ({
			open: (tab, id) => {
				setActiveTab(tab);
				setCreating(null);
				if (id === undefined) return;
				// select() is overloaded per tab (string id for clients/projects,
				// {kind,id} for money) — narrow to a literal so an overload matches.
				if (tab === "money") {
					select("money", id as { kind: "quote" | "invoice"; id: string });
				} else if (tab === "clients") {
					select("clients", id as string);
				} else {
					select("projects", id as string);
				}
			},
			// Open the in-pane create surface for `tab` (no router.push → no slide).
			startCreate: (tab) => {
				setActiveTab(tab);
				setCreating(tab);
			},
		}),
		[select],
	);

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
			<ShellNavProvider value={shellNav}>
				<View style={[styles.root, { backgroundColor: t.surface }]}>
					{sidebar}
					<View style={styles.contentPane}>
						<Slot />
					</View>
				</View>
			</ShellNavProvider>
		);
	}

	const isMasterDetail = MASTER_DETAIL.includes(activeTab);
	const detailTab = activeTab as "clients" | "projects" | "money";

	// Clients/Work share the list-pane wiring (330px list + selection-driven
	// detail). Money has no list pane yet (26-03 owns it) — it stays detail-only
	// via PaneDetailHost (its kind→quote/invoice routing lives there).
	const listConfig = detailTab === "money" ? null : LIST_PANE[detailTab];
	const selectedId = detailTab === "money" ? null : state[detailTab];
	const hasSelection =
		detailTab === "money" ? state.money !== null : selectedId !== null;

	// List-pane body: shell owns the PaneHeader title; the body renders
	// headerMode="pane" + onSelect drives the shell selection (NEVER router.push
	// to a (tabs) sibling — that re-mounts and slides the whole shell, 26-01).
	const listPaneBody = listConfig ? (
		<View style={styles.fill}>
			<PaneHeader title={listConfig.title} />
			<listConfig.Screen
				headerMode="pane"
				onSelect={(id: string) => {
					// detailTab is "clients" | "projects" here (money has no list pane);
					// narrow to a literal so select()'s per-tab overload matches.
					if (detailTab === "clients") select("clients", id);
					else select("projects", id);
				}}
				selectedId={selectedId}
			/>
		</View>
	) : null;

	// Detail body. Clients/Work render their *DetailBody directly with onBack=
	// clear(tab) so the body's ONE header (PaneHeader) returns to the list/
	// placeholder without a router pop. Money keeps PaneDetailHost (26-03 domain).
	// Selection persists across rotation, so the same record stays open/highlighted.
	const renderDetail = (withBack: boolean) => {
		if (detailTab === "clients" && state.clients) {
			return (
				<ClientDetailBody
					id={state.clients}
					headerMode="pane"
					onBack={withBack ? () => clear("clients") : undefined}
				/>
			);
		}
		if (detailTab === "projects" && state.projects) {
			return (
				<ProjectDetailBody
					id={state.projects}
					headerMode="pane"
					onBack={withBack ? () => clear("projects") : undefined}
				/>
			);
		}
		// Money (or no selection) → PaneDetailHost handles placeholder + routing.
		return <PaneDetailHost tab={detailTab} />;
	};

	// In-pane create surface (currently only Clients has a create body). The body
	// owns its ONE PaneHeader (headerMode="pane"); onDone exits create and, on a
	// successful create, opens the new client in the detail pane. Rendered FULL-
	// WIDTH over the content pane — no router.push, so the sidebar never slides.
	const exitCreate = () => setCreating(null);
	const createPaneBody =
		creating === "clients" ? (
			<ClientCreateBody
				headerMode="pane"
				onDone={(newId) => {
					exitCreate();
					if (newId) shellNav.open("clients", newId);
				}}
			/>
		) : null;

	// Create takes over the whole content area (sidebar + full-width body).
	if (createPaneBody) {
		return (
			<ShellNavProvider value={shellNav}>
				<View style={[styles.root, { backgroundColor: t.surface }]}>
					{sidebar}
					<View style={styles.contentPane}>{createPaneBody}</View>
				</View>
			</ShellNavProvider>
		);
	}

	// ── Portrait: sidebar + single content pane (push list → detail) ──────────
	if (orientation === "portrait") {
		return (
			<ShellNavProvider value={shellNav}>
				<View style={[styles.root, { backgroundColor: t.surface }]}>
					{sidebar}
					<View style={styles.contentPane}>
						{isMasterDetail ? (
							hasSelection ? (
								// Detail open full-width; back clears selection → returns to list.
								renderDetail(true)
							) : listConfig ? (
								listPaneBody
							) : (
								<PaneDetailHost tab={detailTab} />
							)
						) : (
							<PortraitSlot tab={activeTab} />
						)}
					</View>
				</View>
			</ShellNavProvider>
		);
	}

	// ── Landscape: sidebar + (master-detail) 330px list pane + flex detail ────
	return (
		<ShellNavProvider value={shellNav}>
			<View style={[styles.root, { backgroundColor: t.surface }]}>
				{sidebar}
				{isMasterDetail ? (
					<>
						<View style={[styles.listPane, { borderRightColor: t.line }]}>
							{listPaneBody ?? <PortraitSlot tab={activeTab} />}
						</View>
						<View style={styles.detailPane}>
							{hasSelection ? (
								// Landscape: no back affordance — the list is always visible, so
								// the detail body renders its plain pane header (no onBack).
								renderDetail(false)
							) : (
								<DetailPlaceholder tab={detailTab} />
							)}
						</View>
					</>
				) : (
					// TODO(26-04): Home wide dashboard, Tasks wide list, Profile pane.
					<View style={styles.contentPane}>
						<PortraitSlot tab={activeTab} />
					</View>
				)}
			</View>
		</ShellNavProvider>
	);
}

// Non-master-detail fill-in slot (Home / Tasks / Profile — 26-04 fills these).
function PortraitSlot({ tab }: { tab: ShellTab }) {
	const t = useTokens();
	return <View style={[styles.slot, { backgroundColor: t.surface }]} accessibilityLabel={`${tab}-pane`} />;
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
	fill: {
		flex: 1,
	},
});
