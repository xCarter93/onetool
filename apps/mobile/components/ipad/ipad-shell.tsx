import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { Slot, usePathname, useRouter, type Href } from "expo-router";
import { useDevice } from "@/lib/use-device";
import { useTokens } from "@/lib/theme";
import {
	SelectionProvider,
	useSelection,
	type SelectionTab,
} from "@/lib/selection-context";
import {
	PadSidebar,
	type CreateItem,
	type SidebarTab,
} from "@/components/ipad/pad-sidebar";
import {
	isOverlayRoute,
	isStackRoute,
	refFromPathname,
	tabFromPathname,
	type ShellTab,
} from "@/lib/shell-routes";
import { DotGrid } from "@/components/ui";
import { PaneDetailHost } from "@/components/ipad/pane-detail-host";
import { PaneHeader } from "@/components/ipad/pane-header";
import { ShellNavProvider, type ShellNav } from "@/lib/shell-nav";
import type { WorkChipKind } from "@/lib/work-search";
import TodayScreen from "@/app/(tabs)/index";
import WorkScreen from "@/app/(tabs)/work";
import MoneyScreen from "@/app/(tabs)/money/index";
import RoutesScreen from "@/app/(tabs)/routes";
import ActivityScreen from "@/app/(tabs)/activity";
import ProfileScreen from "@/app/(tabs)/profile";
import { ClientCreateBody } from "@/app/(tabs)/clients/new";
import { AssistantHost } from "@/components/assistant/assistant-host";
import {
	AssistantInkHeader,
	inkHeaderGlyph,
} from "@/components/assistant/ink-header";
import { buildScreenContext } from "@/lib/screen-context";
import { usePermissions } from "@/lib/use-permissions";

// ============================================================================
// IpadShell — top-level iPad layout (gated on device === "ipad" in (tabs)/
// _layout.tsx, AFTER the auth redirects). Mounts SelectionProvider BELOW the
// Convex key={convexKey} boundary (only rendered from the iPad branch) so an
// org switch remounts it and resets selection (T-26-04).
//
// IA (§6): the rail mirrors the iPhone dock — Today · Work · Money · Routes —
// plus Activity, which the rail has room for and the dock does not. The
// assistant is pinned at the rail bottom instead of a FAB. Clients/projects/
// quotes/invoices are no longer rail tabs; they are record KINDS inside Work,
// which is why selection carries {kind,id} (selection-context).
//
// Three panes own a detail view (Work, Money, Activity) and get the
// master-detail treatment. Today and Routes are single panes in both
// orientations.
//
// ROUTER-INTEGRATION LAYER:
//   A usePathname() effect reconciles expo-router route state → the shell's local
//   activeTab + SelectionProvider on every pathname change, so route-driven entry
//   (notification deep link, push payload, detail cross-link) lands inside the
//   shell rather than on a stale tab:
//     /clients|projects|quote|invoice/[id]  → tab "work" + select that record
//     list routes (/, /work, /routes, /activity, /profile) → set the tab, leave
//       selection untouched (each pane's last selection persists — issue #11)
//
// STACK-ROUTE SLOT: for a full-screen stack route that is NOT a detail route
// (e.g. /clients/new reached by a raw link), the shell renders expo-router's
// <Slot /> full-width beside the rail so the pushed screen owns its own header.
// ============================================================================

const LIST_PANE_WIDTH = 330;

// Panes with a list + detail split. Today and Routes have no detail view.
const MASTER_DETAIL: readonly ShellTab[] = ["work", "money", "activity"];

const PANE_TITLE: Record<SelectionTab, string> = {
	work: "Work",
	money: "Money",
	activity: "Activity",
};

function isMasterDetailTab(tab: ShellTab): tab is SelectionTab {
	return MASTER_DETAIL.includes(tab);
}

function IpadShellInner() {
	const t = useTokens();
	const router = useRouter();
	const { orientation } = useDevice();
	const { state, select, clear } = useSelection();
	const pathname = usePathname();
	const { can, isLoading: permissionsLoading } = usePermissions();

	// activeTab is held in LOCAL STATE so a rail tap swaps only the content pane —
	// the rail is a persistent frame, not a navigation push. A router.push() for
	// tab switching re-mounts the whole (tabs) layout and slides the entire shell
	// in, because the (tabs) group has no in-group navigator.
	//
	// Route-driven entry still reconciles: when the pathname changes EXTERNALLY we
	// re-derive the tab at render time (React's "adjust state when a prop changes"
	// pattern — a plain setState during render, NOT setState-in-effect, which is
	// error-level in this repo).
	const derivedTab = useMemo<ShellTab>(
		() => tabFromPathname(pathname),
		[pathname],
	);
	const [activeTab, setActiveTab] = useState<ShellTab>(derivedTab);
	const [syncedPathname, setSyncedPathname] = useState(pathname);
	// Reconcile ONLY for real shell routes; skip overlay routes (they keep the
	// shell mounted underneath and would otherwise loop — see isOverlayRoute).
	if (pathname !== syncedPathname && !isOverlayRoute(pathname)) {
		setSyncedPathname(pathname);
		setActiveTab(derivedTab);
	}

	// In-pane create surface. Clients is the only record type mobile can create,
	// so this is a boolean rather than a per-tab enum.
	const [creating, setCreating] = useState(false);
	// §4: landscape gets the assistant as a companion right panel; portrait
	// falls back to the pushed sheet route the iPhone FAB uses.
	const [assistantOpen, setAssistantOpen] = useState(false);

	// Work's chip lives here so `browse(kind)` ("View all projects" from a client
	// detail) can scope the list without a route push.
	// Chip kinds are wider than pane kinds: Work also browses tasks, which open a
	// form sheet rather than a detail pane (so they never reach `select`).
	const [workKind, setWorkKind] = useState<WorkChipKind | null>(null);

	// Route → selection reconciliation. On a detail route, sync the durable
	// selection so the pane opens the target. select() dispatches to the
	// SelectionProvider reducer, not local render state.
	useEffect(() => {
		const ref = refFromPathname(pathname);
		if (ref) select("work", ref);
		// List routes leave selection untouched (issue #11). select() is a stable
		// dispatch wrapper.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	// Rail nav swaps the content pane in place (local state → no router push, so
	// the rail never re-mounts or slides). Also abandons any open create surface.
	const onNavigate = (tab: SidebarTab) => {
		setActiveTab(tab);
		setCreating(false);
	};

	// In-pane navigation for detail bodies / list screens rendered INSIDE the
	// shell. A cross-link (client → project) switches pane + selection in place
	// instead of router.push-ing a sibling, which re-mounts and slides the shell.
	// On iPhone there is no provider, so those callers fall back to router.
	const shellNav = useMemo<ShellNav>(
		() => ({
			open: (ref) => {
				setActiveTab("work");
				setCreating(false);
				select("work", ref);
			},
			browse: (kind) => {
				setActiveTab("work");
				setCreating(false);
				setWorkKind(kind);
			},
			startCreate: () => {
				setActiveTab("work");
				setCreating(true);
			},
			openProfile: () => {
				setActiveTab("profile");
				setCreating(false);
			},
		}),
		[select],
	);

	// Rail create menu — the iPad counterpart of the iPhone speed-dial FAB. Same
	// four record types, same "modify" gate; New client uses the shell-native
	// in-pane surface rather than a route push, the rest push their stack route.
	const createItems = useMemo<CreateItem[]>(() => {
		const items: CreateItem[] = [];
		if (can("projects", "modify")) {
			items.push({
				key: "project",
				label: "New project",
				run: () => router.push("/project/new" as Href),
			});
		}
		if (can("tasks", "modify")) {
			items.push({
				key: "task",
				label: "New task",
				run: () => router.push("/tasks/form" as Href),
			});
		}
		if (can("clients", "modify")) {
			items.push({
				key: "client",
				label: "New client",
				run: () => shellNav.startCreate(),
			});
		}
		if (can("quotes", "modify")) {
			items.push({
				key: "quote",
				label: "New quote",
				run: () => router.push("/quote/new" as Href),
			});
		}
		return items;
	}, [can, router, shellNav]);

	const sidebar = (
		<PadSidebar
			activeTab={activeTab}
			onNavigate={onNavigate}
			createItems={permissionsLoading ? [] : createItems}
			onAssistant={() => {
				if (orientation === "landscape") {
					setAssistantOpen((open) => !open);
				} else {
					router.push("/assistant" as Href);
				}
			}}
			onProfile={() => setActiveTab("profile")}
			onNotifications={() => router.push("/notifications" as Href)}
		/>
	);

	// Assistant context: the active mode plus the pane's current selection —
	// ids only, never data values (same rule as web's use-screen-context).
	const selectionRef = isMasterDetailTab(activeTab) ? state[activeTab] : null;
	const assistantContext = buildScreenContext(
		activeTab === "today" ? "/" : `/${activeTab}`,
		selectionRef
			? { recordKind: selectionRef.kind, recordId: selectionRef.id }
			: undefined
	);

	const frame = (children: React.ReactNode) => (
		<ShellNavProvider value={shellNav}>
			<View style={[styles.root, { backgroundColor: t.surface }]}>
				{/* Shell canvas, matching web's .workspace-canvas — covers the rail and
				    inter-pane gaps; panes with opaque roots paint their own grid over it. */}
				<DotGrid style={StyleSheet.absoluteFill} />
				{sidebar}
				{children}
				{assistantOpen && orientation === "landscape" ? (
					<AssistantPanel
						screenContext={assistantContext}
						onClose={() => setAssistantOpen(false)}
					/>
				) : null}
			</View>
		</ShellNavProvider>
	);

	// A full-screen stack route (e.g. /clients/new) → rail + full-width Slot.
	if (isStackRoute(pathname)) {
		return frame(
			<View style={styles.contentPane}>
				<Slot />
			</View>,
		);
	}

	// Create takes over the whole content area (rail + full-width body). The body
	// owns its ONE PaneHeader; on success the new client opens in the detail pane.
	if (creating) {
		return frame(
			<View style={styles.contentPane}>
				<ClientCreateBody
					headerMode="pane"
					onDone={(newId) => {
						setCreating(false);
						if (newId) shellNav.open({ kind: "client", id: newId });
					}}
				/>
			</View>,
		);
	}

	// ── Single panes (Today / Routes / Profile) ───────────────────────────────
	if (!isMasterDetailTab(activeTab)) {
		return frame(
			<View style={styles.contentPane}>
				<SinglePane tab={activeTab} />
			</View>,
		);
	}

	// ── Master-detail (Work / Money / Activity) ──────────────────────────────
	const pane = activeTab;
	const selected = state[pane];

	const listPane = (
		<View style={styles.fill}>
			{/* No contextual ＋ — the rail's create menu is the single capture entry
			    point on iPad. */}
			<PaneHeader title={PANE_TITLE[pane]} />
			{pane === "work" ? (
				<WorkScreen
					headerMode="pane"
					onSelect={(ref) => select("work", ref)}
					selected={selected}
					kind={workKind}
					onKindChange={setWorkKind}
				/>
			) : pane === "money" ? (
				<MoneyScreen
					headerMode="pane"
					onSelect={(sel) => select("money", sel)}
					// Money only ever selects a quote or an invoice; the other kinds
					// can't reach this slot, so they read as no selection.
					selected={
						selected && (selected.kind === "quote" || selected.kind === "invoice")
							? { kind: selected.kind, id: selected.id }
							: null
					}
				/>
			) : (
				<ActivityScreen
					headerMode="pane"
					onSelect={(ref) => select("activity", ref)}
					selected={selected}
				/>
			)}
		</View>
	);

	// Portrait: one pane. The list fills it until something is selected, then the
	// detail takes over full-width with a back affordance that clears selection.
	if (orientation === "portrait") {
		return frame(
			<View style={styles.contentPane}>
				{selected ? (
					<PaneDetailHost
						context={pane}
						record={selected}
						onBack={() => clear(pane)}
					/>
				) : (
					listPane
				)}
			</View>,
		);
	}

	// Landscape: fixed list pane + flex detail. No back affordance — the list is
	// always visible, so there is nothing to go back to.
	return frame(
		<>
			<View style={[styles.listPane, { borderRightColor: t.line }]}>
				{listPane}
			</View>
			<View style={styles.detailPane}>
				<PaneDetailHost context={pane} record={selected} />
			</View>
		</>,
	);
}

// Single content pane (Today / Routes / Profile) — no list+detail split in either
// orientation. Each body renders headerMode="pane" so the shell owns the one
// header; Today is the exception, its ink hero IS its header.
function SinglePane({ tab }: { tab: Exclude<ShellTab, SelectionTab> }) {
	const t = useTokens();

	if (tab === "today") {
		// Full-bleed canvas: the ink hero spans the pane edge to edge, so the grid
		// is painted here and TodayScreen's pane mode caps only its own column.
		return (
			<View style={[styles.slot, { backgroundColor: t.bg }]}>
				<DotGrid style={StyleSheet.absoluteFill} />
				<TodayScreen headerMode="pane" />
			</View>
		);
	}

	if (tab === "routes") {
		// Full-bleed in both orientations — a native map lands here at P4.
		return (
			<View style={[styles.slot, { backgroundColor: t.surface }]}>
				<PaneHeader title="Routes" />
				<RoutesScreen headerMode="pane" />
			</View>
		);
	}

	return (
		<View style={[styles.slot, { backgroundColor: t.surface }]}>
			<PaneHeader title="Profile" />
			<ProfileScreen headerMode="pane" />
		</View>
	);
}

export function IpadShell() {
	return (
		<SelectionProvider>
			<IpadShellInner />
		</SelectionProvider>
	);
}

// §4's landscape companion panel — same chat as the pushed sheet, docked as a
// third column so the workspace stays visible beside it.
function AssistantPanel({
	screenContext,
	onClose,
}: {
	screenContext?: string;
	onClose: () => void;
}) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.assistantPanel,
				{ backgroundColor: t.card, borderLeftColor: t.border },
			]}
		>
			<AssistantInkHeader
				right={
					<Pressable
						onPress={onClose}
						hitSlop={10}
						accessibilityRole="button"
						accessibilityLabel="Close assistant"
						style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
					>
						<X size={18} color={inkHeaderGlyph} strokeWidth={2.25} />
					</Pressable>
				}
			/>
			<AssistantHost screenContext={screenContext} />
		</View>
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
		width: LIST_PANE_WIDTH,
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
	assistantPanel: {
		width: 380,
		flexShrink: 0,
		borderLeftWidth: 1,
		overflow: "hidden",
	},
});
