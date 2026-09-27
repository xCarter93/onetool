import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { X } from "lucide-react-native";
import { Slot, usePathname, useRouter, type Href } from "expo-router";
import { useDevice } from "@/lib/use-device";
import { frame, useTokens } from "@/lib/theme";
import {
	SelectionProvider,
	useSelection,
	type RecordRef,
	type SelectionTab,
} from "@/lib/selection-context";
import { PadSidebar, type SidebarTab } from "@/components/ipad/pad-sidebar";
import { IpadDock } from "@/components/ipad/ipad-dock";
import { Notch, type NotchContent } from "@/components/frame/notch";
import { useCreateItems } from "@/components/frame/phone-frame";
import {
	isOverlayRoute,
	isStackRoute,
	refFromPathname,
	tabFromPathname,
	type ShellTab,
} from "@/lib/shell-routes";
import { PaneDetailHost } from "@/components/ipad/pane-detail-host";
import { ScreenBoundary } from "@/components/screen-boundary";
import { PaneHeader } from "@/components/ipad/pane-header";
import { ShellNavProvider, type ShellNav } from "@/lib/shell-nav";
import type { WorkChipKind } from "@/lib/work-search";
import TodayScreen from "@/app/(tabs)/(today)/index";
import WorkScreen from "@/app/(tabs)/(work)/work";
import MoneyScreen from "@/app/(tabs)/(money)/money";
import RoutesScreen from "@/app/(tabs)/(routes)/routes";
import ActivityScreen from "@/app/(tabs)/(today,work,money,routes)/activity";
import ProfileScreen from "@/app/(tabs)/(today,work,money,routes)/profile";
import BusinessDetailsScreen from "@/app/(tabs)/(today,work,money,routes)/business-details";
import RouteEditScreen from "@/app/(tabs)/(today,work,money,routes)/route-edit";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { AssistantHost } from "@/components/assistant/assistant-host";
import {
	AssistantInkHeader,
	inkHeaderGlyph,
} from "@/components/assistant/ink-header";
import { buildScreenContext } from "@/lib/screen-context";
import { usePermissions } from "@/lib/use-permissions";

// iPad frame: web's graphite sidebar, a rounded canvas with a notch, list and
// detail panes side by side, and the assistant dock at the canvas foot. Mounted
// below the Convex org boundary so an org switch resets selection. A pathname
// effect reconciles route-driven entry (deep links, pushes) to the local tab
// and selection; non-record stack routes render through <Slot /> in the canvas.

const LIST_PANE_WIDTH = 330;

// Panes with a list + detail split. Today and Routes have no detail view.
const MASTER_DETAIL: readonly ShellTab[] = ["work", "money", "activity"];

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

const TAB_LABEL: Record<ShellTab, string> = {
	today: "Today",
	work: "Work",
	money: "Money",
	routes: "Routes",
	activity: "Activity",
	profile: "Profile",
};

const KIND_LABEL: Record<RecordRef["kind"], string> = {
	client: "Client",
	project: "Project",
	quote: "Quote",
	invoice: "Invoice",
};

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
	const { isLoading: permissionsLoading } = usePermissions();
	const insets = useSafeAreaInsets();

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
	const [businessOpen, setBusinessOpen] = useState(false);
	// null = the Routes list; { routeId: undefined } = a new route.
	const [routeEditor, setRouteEditor] = useState<{ routeId?: Id<"routes"> } | null>(null);
	const onNavigate = (tab: SidebarTab) => {
		setActiveTab(tab);
		setBusinessOpen(false);
		setRouteEditor(null);
	};

	// In-pane navigation for detail bodies / list screens rendered INSIDE the
	// shell. A cross-link (client → project) switches pane + selection in place
	// instead of router.push-ing a sibling, which re-mounts and slides the shell.
	// On iPhone there is no provider, so those callers fall back to router.
	const shellNav = useMemo<ShellNav>(
		() => ({
			open: (ref) => {
				setActiveTab("work");
						select("work", ref);
			},
			browse: (kind) => {
				setActiveTab("work");
						setWorkKind(kind);
			},
			openProfile: () => {
				setActiveTab("profile");
				setBusinessOpen(false);
			},
			openBusinessDetails: () => {
				setActiveTab("profile");
				setBusinessOpen(true);
			},
			editRoute: (routeId) => {
				setActiveTab("routes");
				setRouteEditor({ routeId });
			},
		}),
		[select],
	);

	// Bordered views drawn during the rotation animation keep stale frames on
	// iOS (react-native#42604); remount the detail once the rotation settles.
	const [settledOrientation, setSettledOrientation] = useState(orientation);
	useEffect(() => {
		const id = setTimeout(() => setSettledOrientation(orientation), 500);
		return () => clearTimeout(id);
	}, [orientation]);

	const createItems = useCreateItems();

	const openAssistant = () => {
		if (orientation === "landscape") {
			setAssistantOpen((open) => !open);
		} else {
			router.push("/assistant" as Href);
		}
	};

	// Assistant context: the active mode plus the pane's current selection —
	// ids only, never data values (same rule as web's use-screen-context).
	const selectionRef = isMasterDetailTab(activeTab) ? state[activeTab] : null;
	const assistantContext = buildScreenContext(
		activeTab === "today" ? "/" : `/${activeTab}`,
		selectionRef
			? { recordKind: selectionRef.kind, recordId: selectionRef.id }
			: undefined
	);

	const tabLabel = TAB_LABEL[activeTab];
	const notch: NotchContent = selectionRef
		? { kind: "crumb", parent: tabLabel, title: KIND_LABEL[selectionRef.kind] }
		: { kind: "label", text: tabLabel };

	const frame = (children: React.ReactNode) => (
		<ShellNavProvider value={shellNav}>
			<View style={[styles.root, { paddingTop: insets.top }]}>
				<StatusBar style="light" />
				<PadSidebar
					activeTab={activeTab}
					onNavigate={onNavigate}
					onProfile={() => shellNav.openProfile()}
					onNotifications={() => router.push("/notifications" as Href)}
				/>
				<View style={[styles.canvas, { marginBottom: Math.max(insets.bottom, 8) }]}>
					<SafeAreaInsetsContext.Provider value={NO_INSETS}>
						<View style={styles.mainRow}>
							{children}
							{assistantOpen && orientation === "landscape" ? (
								<AssistantPanel
									screenContext={assistantContext}
									onClose={() => setAssistantOpen(false)}
								/>
							) : null}
						</View>
						{assistantOpen && orientation === "landscape" ? null : (
							<IpadDock onAssistant={openAssistant} createItems={permissionsLoading ? [] : createItems} />
						)}
					</SafeAreaInsetsContext.Provider>
					<Notch content={notch} />
				</View>
			</View>
		</ShellNavProvider>
	);

	// A full-screen stack route (e.g. /route-edit) → rail + full-width Slot.
	if (isStackRoute(pathname)) {
		return frame(
			<View style={styles.contentPane}>
				<Slot />
			</View>,
		);
	}

	// ── Single panes (Today / Routes / Profile) ───────────────────────────────
	if (!isMasterDetailTab(activeTab)) {
		return frame(
			<View style={styles.contentPane}>
				<ScreenBoundary key={`${settledOrientation}:${activeTab}`}>
					<SinglePane
						tab={activeTab}
						businessOpen={businessOpen}
						onCloseBusiness={() => setBusinessOpen(false)}
						routeEditor={routeEditor}
						onCloseRouteEditor={() => setRouteEditor(null)}
					/>
				</ScreenBoundary>
			</View>,
		);
	}

	// ── Master-detail (Work / Money / Activity) ──────────────────────────────
	const pane = activeTab;
	const selected = state[pane];

	const listPane = (
		<ScreenBoundary key={pane}>
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
		</ScreenBoundary>
	);

	// Portrait: one pane. The list fills it until something is selected, then the
	// detail takes over full-width with a back affordance that clears selection.
	// Landscape: fixed list pane + flex detail, no back. Both orientations keep
	// the same tree so rotating restyles the panes instead of rebuilding them,
	// which kept the list's search and scroll and cost seconds.
	const portrait = orientation === "portrait";
	return frame(
		<>
			<View
				style={
					portrait
						? selected
							? styles.hidden
							: styles.contentPane
						: [styles.listPane, { borderRightColor: t.line }]
				}
			>
				{listPane}
			</View>
			{portrait && !selected ? null : (
				<View style={portrait ? styles.contentPane : styles.detailPane}>
					<ScreenBoundary
						key={`${settledOrientation}:${selected ? `${pane}:${selected.kind}:${selected.id}` : pane}`}
					>
						<PaneDetailHost
							context={pane}
							record={selected}
							onBack={portrait ? () => clear(pane) : undefined}
						/>
					</ScreenBoundary>
				</View>
			)}
		</>,
	);
}

// Single content pane (Today / Routes / Profile) — no list+detail split in either
// orientation. Each body renders headerMode="pane" so the shell owns the one
// header; Today renders its own page header.
function SinglePane({
	tab,
	businessOpen,
	onCloseBusiness,
	routeEditor,
	onCloseRouteEditor,
}: {
	tab: Exclude<ShellTab, SelectionTab>;
	businessOpen: boolean;
	onCloseBusiness: () => void;
	routeEditor: { routeId?: Id<"routes"> } | null;
	onCloseRouteEditor: () => void;
}) {
	const t = useTokens();

	if (tab === "today") {
		return (
			<View style={[styles.slot, { backgroundColor: t.bg }]}>
				<TodayScreen headerMode="pane" />
			</View>
		);
	}

	if (tab === "routes" && routeEditor) {
		// The editor renders its own pane header with a back arrow.
		return (
			<View style={[styles.slot, { backgroundColor: t.surface }]}>
				<RouteEditScreen routeId={routeEditor.routeId} onDone={onCloseRouteEditor} />
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

	if (businessOpen) {
		return (
			<View style={[styles.slot, { backgroundColor: t.surface }]}>
				<PaneHeader onBack={onCloseBusiness} />
				<BusinessDetailsScreen onDone={onCloseBusiness} />
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
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.assistantPanel,
				{
					backgroundColor: t.card,
					borderLeftColor: t.border,
					// The panel reaches both screen edges: clear the status bar so the
					// close X isn't under the battery, and the home indicator so the
					// composer's disclaimer line isn't clipped.
					paddingBottom: Math.max(insets.bottom, 12),
				},
			]}
		>
			<AssistantInkHeader
				topInset={insets.top}
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
			{/* Full-height panel pinned to the screen bottom — the panel's own
			    paddingBottom (above) is the chat's gap to the window bottom. */}
			<AssistantHost
				screenContext={screenContext}
				keyboardBottomGap={Math.max(insets.bottom, 12)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		flexDirection: "row",
		backgroundColor: frame.rail,
	},
	canvas: {
		flex: 1,
		marginRight: frame.canvasInset,
		borderRadius: frame.canvasRadius,
		backgroundColor: frame.canvas,
		overflow: "hidden",
	},
	mainRow: {
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
	hidden: {
		display: "none",
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
