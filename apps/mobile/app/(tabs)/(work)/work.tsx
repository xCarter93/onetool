import { queueTaskToggle } from "@/lib/offline/task-toggle";
import { useOfflinePartition } from "@/lib/offline/partition-context";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ComponentProps,
} from "react";
import {
	ActionSheetIOS,
	Alert,
	findNodeHandle,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
	type AccessibilityActionInfo,
	type TextInput,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Swipeable, {
	type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import {
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
	type Href,
} from "expo-router";
import { api } from "@onetool/backend/convex/_generated/api";
import { Building2, CircleCheck, FileText, Folder, History, Receipt, SearchX, ShieldOff } from "lucide-react-native";
import { canWith } from "@/lib/use-permissions";
import type { PermissionObject } from "@onetool/backend/convex/lib/permissionKeys";
import {
	EmptyPanel,
	GUTTER,
	NOTCH_CLEARANCE,
	RecordRow,
	SectionLabel,
	UnderlineTabs,
} from "@/components/canvas";
import { SearchField } from "@/components/work/search-field";
import { formatCurrency } from "@/lib/format";
import { getRecents, type RecentRecord } from "@/lib/recents";
import { consumeSearchFocus } from "@/lib/search-focus";
import { focusComposer, useScreenChrome } from "@/lib/shell-chrome";
import { useOrgToday } from "@/lib/use-org-today";
import { sameRef, type RecordRef } from "@/lib/selection-context";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { useOpenOps } from "@/lib/offline/hooks";
import { isDoneStatus, taskDoneOverlay } from "@/lib/agenda";
import { useExclusiveSwipe } from "@/lib/swipe-registry";
import { buildRecordMenuActions, type RecordMenuAction } from "@/lib/record-menu";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import {
	buildClientNameMap,
	CHIP_ORDER,
	fromClientHit,
	fromInvoiceHit,
	fromProjectHit,
	fromQuoteHit,
	KIND_LABEL,
	pathForRecord,
	sortByRecency,
	toClientRecord,
	toInvoiceRecord,
	toProjectRecord,
	toQuoteRecord,
	toTaskRecord,
	type WorkChipKind,
	type WorkRecord,
} from "@/lib/work-search";

/** Backend floor — `search.globalSearch` returns nothing below two characters,
 * so one typed letter must keep the resting body, not blank the screen. */
const MIN_QUERY_LENGTH = 2;

const isChipKind = (v: unknown): v is WorkChipKind =>
	typeof v === "string" && v in KIND_LABEL;

// Empty-state glyph per record kind, plus the two non-kind resting states.
const KIND_PERMISSION: Record<WorkChipKind, PermissionObject> = {
	client: "clients",
	project: "projects",
	quote: "quotes",
	invoice: "invoices",
	task: "tasks",
};

const KIND_EMPTY_ICON: Record<WorkChipKind, typeof Building2> = {
	client: Building2,
	project: Folder,
	quote: FileText,
	invoice: Receipt,
	task: CircleCheck,
};

type Section = { key: string; label: string; records: WorkRecord[] };

type Row =
	| { type: "header"; key: string; label: string }
	| {
			type: "record";
			key: string;
			sectionKey: string;
			record: WorkRecord;
			first: boolean;
			last: boolean;
	  };

function sectionsToRows(sections: Section[]): Row[] {
	const out: Row[] = [];
	for (const section of sections) {
		out.push({ type: "header", key: `h:${section.key}`, label: section.label });
		section.records.forEach((record, i) => {
			out.push({
				type: "record",
				// Bucket-scoped index, NOT `kind:id`: two contact hits on the same
				// client both resolve to that client's id and would collide.
				key: `${section.key}:${i}:${record.id}`,
				sectionKey: section.key,
				record,
				first: i === 0,
				last: i === section.records.length - 1,
			});
		});
	}
	return out;
}

// `SwipeableProps` doesn't declare these, but ReanimatedSwipeable.tsx spreads
// `...remainingProps` onto its root Animated.View, so they still reach it.
type SwipeableA11yProps = ComponentProps<typeof Swipeable> & {
	accessibilityActions?: AccessibilityActionInfo[];
	onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
};

/** Panel-style borders on a flat FlashList row, so a virtualized section still
 * reads as one bordered group (a real `Panel` would defeat virtualization). */
function usePanelWrap(first: boolean, last: boolean) {
	const t = useTokens();
	return [
		styles.rowWrap,
		{ backgroundColor: t.card, borderColor: t.line },
		first && styles.rowFirst,
		!first && { borderTopWidth: 1, borderTopColor: t.lineSoft },
		last && [styles.rowLast, { borderBottomWidth: 1, borderBottomColor: t.line }],
	];
}

// A real component (not a bare render function) — the long-press gesture and
// swipe-to-toggle both need per-row refs.
function WorkRow({
	record,
	sub,
	first,
	last,
	selected,
	done,
	toggling,
	onOpen,
	onToggleTask,
	onLongPressMenu,
}: {
	record: WorkRecord;
	sub: string;
	first: boolean;
	last: boolean;
	selected: boolean;
	done: boolean;
	toggling: boolean;
	onOpen: () => void;
	onToggleTask?: () => void;
	onLongPressMenu: (anchor: number | null) => void;
}) {
	const t = useTokens();
	const wrap = usePanelWrap(first, last);
	const swipeableRef = useRef<SwipeableMethods>(null);
	const exclusiveSwipe = useExclusiveSwipe(swipeableRef);
	const anchorRef = useRef<View>(null);
	// RNGH #3481: swipe (and long-press) release can fire a spurious onPress.
	const suppressPressUntil = useRef(0);
	const suppressPress = () => {
		// eslint-disable-next-line react-hooks/purity -- runs on gesture/swipe activation, never during render
		suppressPressUntil.current = Date.now() + 500;
	};
	const guardedOpen = () => {
		if (Date.now() < suppressPressUntil.current) return;
		onOpen();
	};

	const longPress = Gesture.LongPress()
		.minDuration(500)
		.maxDistance(24)
		.runOnJS(true)
		// eslint-disable-next-line react-hooks/refs -- .onStart's callback fires on activation, not render
		.onStart(() => {
			suppressPress();
			onLongPressMenu(findNodeHandle(anchorRef.current));
		});

	const row = (
		<View ref={anchorRef} collapsable={false}>
			<GestureDetector gesture={longPress}>
				<View style={wrap}>
					<RecordRow
						kind={record.kind}
						title={record.title}
						subtitle={sub || undefined}
						status={record.status}
						onPress={guardedOpen}
						selected={selected}
					/>
				</View>
			</GestureDetector>
		</View>
	);

	if (!onToggleTask) return row;

	const renderRightActions = () => (
		<Pressable
			onPress={() => {
				swipeableRef.current?.close();
				onToggleTask();
			}}
			style={[
				styles.swipeAction,
				{ backgroundColor: done ? t.checkbox : t.success },
			]}
			accessibilityRole="button"
			accessibilityLabel={done ? `Mark ${record.title} not done` : `Mark ${record.title} done`}
		>
			<Text style={styles.swipeActionText}>{done ? "Not done" : "Done"}</Text>
		</Pressable>
	);

	const swipeableProps: SwipeableA11yProps = {
		ref: swipeableRef,
		friction: 2,
		rightThreshold: 40,
		overshootRight: false,
		enabled: !toggling,
		renderRightActions,
		onSwipeableWillOpen: () => {
			suppressPress();
			exclusiveSwipe.onOpen();
		},
		onSwipeableWillClose: suppressPress,
		onSwipeableClose: exclusiveSwipe.onClose,
		onSwipeableOpenStartDrag: suppressPress,
		onSwipeableCloseStartDrag: suppressPress,
		// The checkbox's VoiceOver equivalent, same as agenda-row.tsx.
		accessibilityActions: [
			{ name: "toggleDone", label: done ? "Mark not done" : "Mark done" },
		],
		onAccessibilityAction: (event) => {
			if (event.nativeEvent.actionName === "toggleDone") onToggleTask();
		},
	};

	return <Swipeable {...swipeableProps}>{row}</Swipeable>;
}

/** Read-only favorite row: links to the record, no swipe or long-press menu. */
function FavoriteRow({
	title,
	status,
	first,
	last,
	onOpen,
}: {
	title: string;
	status: string;
	first: boolean;
	last: boolean;
	onOpen: () => void;
}) {
	const wrap = usePanelWrap(first, last);
	return (
		<View style={wrap}>
			<RecordRow kind="client" title={title} status={status} onPress={onOpen} />
		</View>
	);
}

// headerMode/onSelect/selected/kind default off → the iPhone path (router.push,
// the composer field owns search, no selected highlight, uncontrolled tabs). The
// iPad shell renders this as a list pane: headerMode="pane" suppresses the
// composer binding and keeps an in-pane search field (the shell mounts
// PaneHeader above it), onSelect drives the detail pane via the shell selection
// instead of a route push, selected marks the row, and kind/onKindChange let the
// shell drive the tabs (e.g. "View all projects").
export default function WorkScreen({
	headerMode = "root",
	onSelect,
	selected = null,
	kind: kindProp,
	onKindChange,
}: {
	headerMode?: "root" | "pane";
	onSelect?: (ref: RecordRef) => void;
	selected?: RecordRef | null;
	kind?: WorkChipKind | null;
	onKindChange?: (kind: WorkChipKind | null) => void;
} = {}) {
	const t = useTokens();
	const router = useRouter();
	const isPane = headerMode === "pane";
	// Pane keeps the fade inset (the shell's light chrome dissolves into content).
	// On iPhone the canvas notch needs its own clearance instead.
	const listTop = 16;
	const listBottom = isPane ? 24 : 32;

	// Raw input drives the field; `q` (debounced 250ms) drives the backend query.
	const [raw, setRaw] = useState("");
	const [q, setQ] = useState("");
	useEffect(() => {
		const id = setTimeout(() => setQ(raw.trim()), 250);
		return () => clearTimeout(id);
	}, [raw]);
	const searching = q.length >= MIN_QUERY_LENGTH;

	// Deep-link chip seed: Today's attention line pushes ?kind=quote. Unknown
	// values fall back to no chip rather than being cast in.
	const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
	const rawParam = kindParam ?? null;
	const [appliedParam, setAppliedParam] = useState<string | null>(rawParam);
	const [localKind, setLocalKind] = useState<WorkChipKind | null>(
		isChipKind(rawParam) ? rawParam : null,
	);
	// Re-seed at render time (set-state-in-effect is error-level here) and only
	// when the param VALUE changes, so a later tab tap still wins.
	if (rawParam !== appliedParam) {
		setAppliedParam(rawParam);
		if (isChipKind(rawParam)) setLocalKind(rawParam);
	}
	const kind = kindProp !== undefined ? kindProp : localKind;
	const setKind = (next: WorkChipKind | null) =>
		onKindChange ? onKindChange(next) : setLocalKind(next);
	const orgToday = useOrgToday();

	// ── Search field ────────────────────────────────────────────────────────
	// On iPhone the frame's bottom composer IS the search input; publish the
	// binding up to it. Never in a pane: iPad has no composer and Work is always
	// mounted there, so a search binding would just sit unused.
	useScreenChrome(
		isPane
			? null
			: {
					search: {
						value: raw,
						onChangeText: setRaw,
						placeholder: "Search clients, quotes, invoices…",
					},
				},
	);
	// One-shot latch set by the header magnifier on the other tab roots. Focuses
	// the composer field instead of a local input — Work no longer owns one.
	const paneInputRef = useRef<TextInput | null>(null);
	useFocusEffect(
		useCallback(() => {
			if (!consumeSearchFocus()) return;
			if (isPane) {
				const frame = requestAnimationFrame(() => paneInputRef.current?.focus());
				return () => cancelAnimationFrame(frame);
			}
			// One frame of slack — focusing mid-transition drops the keyboard.
			const frame = requestAnimationFrame(() => focusComposer());
			return () => cancelAnimationFrame(frame);
		}, [isPane]),
	);

	// ── Data ────────────────────────────────────────────────────────────────
	// Search is the primary path. Browse lists are LAZY — only the active tab's
	// list subscribes, which is what let the four always-on subscriptions go.
	const results = useCachedQuery(
		api.search.globalSearch,
		searching ? { query: q } : "skip",
	);
	// Every debounced query re-subscribes, so `results` drops to undefined between
	// terms. Hold the last resolved set and keep rendering it: only the FIRST
	// search of a session shows the skeleton, refinements just re-sort under the
	// finger. (Render-time derivation — set-state-in-effect is error-level here.)
	const [lastResults, setLastResults] = useState<typeof results>(undefined);
	if (results !== undefined && results !== lastResults) setLastResults(results);
	// Dropped out of search: forget the held set, or the NEXT search would open
	// on the previous term's hits instead of its own skeleton.
	if (!searching && lastResults !== undefined) setLastResults(undefined);
	const shownResults = searching ? (results ?? lastResults) : undefined;

	const browseKind = searching ? null : kind;
	const resting = !searching && kind === null;
	// Clients are also the meta line ("Acme · PRJ-7") for the other three kinds,
	// so one subscription serves both the client browse list and their names.
	// Browse lists throw for a role without view access; cached so the gate holds offline.
	const perms = useCachedQuery(api.permissions.myPermissions, {});
	const canBrowse = (k: WorkChipKind) => canWith(perms, KIND_PERMISSION[k]);
	const browsable = browseKind !== null && canBrowse(browseKind);
	const wantsClients =
		browsable && browseKind !== "task" && canBrowse("client")
			? { includeArchived: true }
			: "skip";
	const clients = useCachedQuery(api.clients.list, wantsClients);
	const projects = useCachedQuery(
		api.projects.list,
		browsable && browseKind === "project" ? {} : "skip",
	);
	const quotes = useCachedQuery(
		api.quotes.list,
		browsable && browseKind === "quote" ? {} : "skip",
	);
	const invoices = useCachedQuery(
		api.invoices.list,
		browsable && browseKind === "invoice" ? {} : "skip",
	);
	const tasks = useCachedQuery(
		api.tasks.list,
		browsable && browseKind === "task" ? {} : "skip",
	);

	// Read-only favorites (web's sidebar query) — only needed at rest.
	const favorites = useCachedQuery(api.favorites.list, resting ? {} : "skip");

	// ── Recently viewed (on-device, per org) ────────────────────────────────
	const recentsScope = useOfflinePartition() ?? undefined;
	// null = not read yet. Refreshed on focus so a record opened and dismissed
	// this session is already at the top when the tab comes back.
	const [recents, setRecents] = useState<RecentRecord[] | null>(null);
	useFocusEffect(
		useCallback(() => {
			if (!recentsScope) return;
			let alive = true;
			getRecents(recentsScope).then((list) => {
				if (alive) setRecents(list);
			});
			return () => {
				alive = false;
			};
		}, [recentsScope]),
	);

	// Every open queued op, so a task row reflects a pending toggle immediately —
	// same overlay-over-server pattern as Today.
	const taskOps = useOpenOps();
	const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

	// Each mode waits on exactly its own subscriptions. Browse kinds other than
	// tasks also wait on `clients`, which supplies their meta line.
	const browseList = {
		client: clients,
		project: projects,
		quote: quotes,
		invoice: invoices,
		task: tasks,
	};
	const loading = searching
		? shownResults === undefined
		: browseKind !== null
			? browsable &&
				(browseList[browseKind] === undefined || (wantsClients !== "skip" && clients === undefined))
			: !!recentsScope && (recents === null || favorites === undefined);

	const clientNames = useMemo(() => buildClientNameMap(clients), [clients]);

	const searchSections = useMemo<Section[]>(() => {
		if (!shownResults) return [];
		const byKind: Record<WorkChipKind, WorkRecord[]> = {
			client: shownResults.clients.map(fromClientHit),
			project: shownResults.projects.map(fromProjectHit),
			quote: shownResults.quotes.map(fromQuoteHit),
			invoice: shownResults.invoices.map(fromInvoiceHit),
			task: shownResults.tasks.map((doc) => toTaskRecord(doc)),
		};
		// Hits arrive relevance-ordered per bucket — never re-sort them.
		return CHIP_ORDER.filter((k) => kind === null || kind === k)
			.map((k) => ({ key: k, label: KIND_LABEL[k], records: byKind[k] }))
			.filter((s) => s.records.length > 0);
	}, [shownResults, kind]);

	const browseSections = useMemo<Section[]>(() => {
		if (browseKind === null) return [];
		const records =
			browseKind === "client"
				? (clients ?? []).map((c) => toClientRecord(c))
				: browseKind === "project"
					? (projects ?? []).map((p) =>
							toProjectRecord(p, { clientName: clientNames.get(p.clientId) }),
						)
					: browseKind === "quote"
						? (quotes ?? []).map((qt) =>
								toQuoteRecord(qt, {
									clientName: clientNames.get(qt.clientId),
								}),
							)
						: browseKind === "invoice"
							? (invoices ?? []).map((inv) =>
									toInvoiceRecord(inv, {
										clientName: clientNames.get(inv.clientId),
										orgToday,
									}),
								)
							: (tasks ?? []).map((task) => toTaskRecord(task));
		const sorted = sortByRecency(records);
		return sorted.length
			? [{ key: browseKind, label: KIND_LABEL[browseKind], records: sorted }]
			: [];
	}, [
		browseKind,
		clients,
		projects,
		quotes,
		invoices,
		tasks,
		clientNames,
		orgToday,
	]);

	// Favorites section: read-only, links to the client. Web's userFavorites
	// query, so this is exactly the sidebar's favorite list, not a new feature.
	const favoriteSections = useMemo<Section[]>(() => {
		const list = resting ? (favorites ?? []) : [];
		if (!list.length) return [];
		return [
			{
				key: "favorites",
				label: "Favorites",
				records: list.map(
					(f): WorkRecord => ({
						kind: "client",
						id: f.clientId,
						title: f.companyName,
						meta: "",
						status: f.status,
					}),
				),
			},
		];
	}, [resting, favorites]);

	const recentSections = useMemo<Section[]>(() => {
		const list = resting ? (recents ?? []) : [];
		if (!list.length) return [];
		return [
			{
				key: "recent",
				label: "Recently viewed",
				records: list.map(
					(r): WorkRecord =>
						({
							kind: r.kind,
							id: r.id,
							title: r.title,
							meta: r.sub ?? "",
						}) as WorkRecord,
				),
			},
		];
	}, [resting, recents]);

	const rows = useMemo<Row[]>(
		() =>
			sectionsToRows(
				searching
					? searchSections
					: browseKind !== null
						? browseSections
						: [...favoriteSections, ...recentSections],
			),
		[searching, browseKind, searchSections, browseSections, favoriteSections, recentSections],
	);

	// On iPad pane: row tap drives the shell selection (no route push — a push
	// would slide the whole shell). Tasks are the exception in BOTH modes: they
	// have no detail body, so they always open the form sheet, exactly as
	// Today's agenda rows do.
	const open = (record: WorkRecord) => {
		if (record.kind === "task" || !onSelect) {
			router.push(pathForRecord(record) as Href);
			return;
		}
		onSelect({ kind: record.kind, id: record.id });
	};

	// Overlay-aware done state — mirrors Today's `doneIds` derivation so a task
	// completed from Work and a task completed from Today never disagree.
	// Undefined (not false) when neither the overlay nor `record.status` says —
	// the recents list carries no status, and a false there would show "Done" on
	// an already-done task and no-op the swipe/menu toggle silently.
	const isTaskDone = (record: WorkRecord & { kind: "task" }): boolean | undefined => {
		const overlay = taskDoneOverlay(taskOps, record.id);
		if (overlay !== undefined) return overlay;
		return record.status === undefined ? undefined : isDoneStatus(record.status);
	};

	// Same two ops Today's checkbox queues — the swipe action and the long-press
	// "Mark done" menu item both call this, never a mutation of their own.
	const handleToggleTask = async (record: WorkRecord & { kind: "task" }) => {
		const id = record.id;
		setTogglingIds((prev) => new Set(prev).add(id));
		try {
			await queueTaskToggle(
				{ id, title: record.title, status: record.status },
				!isTaskDone(record),
				taskOps,
			);
		} finally {
			setTogglingIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	};

	const runMenuAction = (action: RecordMenuAction, record: WorkRecord) => {
		switch (action.type) {
			case "open":
				open(record);
				return;
			case "toggle-done":
				if (record.kind === "task") handleToggleTask(record);
				return;
		}
	};

	const openRecordMenu = (record: WorkRecord, anchor: number | null) => {
		const actions = buildRecordMenuActions({
			kind: record.kind,
			done: record.kind === "task" ? isTaskDone(record) : undefined,
		});
		const labels = actions.map((a) => a.label);
		if (Platform.OS === "ios") {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: [...labels, "Cancel"],
					cancelButtonIndex: labels.length,
					// Unanchored, iOS pops the sheet from the screen centre with no dim
					// (same fix as pad-sidebar.tsx's create menu).
					anchor: anchor ?? undefined,
				},
				(index) => {
					const action = actions[index];
					if (action) runMenuAction(action, record);
				},
			);
		} else {
			Alert.alert(record.title, undefined, [
				...actions.map((a) => ({
					text: a.label,
					onPress: () => runMenuAction(a, record),
				})),
				{ text: "Cancel", style: "cancel" as const },
			]);
		}
	};

	const renderRow = ({ item }: { item: Row }) => {
		if (item.type === "header") {
			return (
				<View style={styles.sectionLabelWrap}>
					<SectionLabel title={item.label} />
				</View>
			);
		}

		const { record, first, last, sectionKey } = item;
		const amount =
			record.kind === "quote" || record.kind === "invoice"
				? record.amount
				: undefined;
		const sub =
			amount === undefined
				? record.meta
				: record.meta
					? `${record.meta} · ${formatCurrency(amount, { exact: true })}`
					: formatCurrency(amount, { exact: true });

		if (sectionKey === "favorites") {
			return (
				<FavoriteRow
					title={record.title}
					status={record.status ?? ""}
					first={first}
					last={last}
					onOpen={() => open(record)}
				/>
			);
		}

		// Undefined here (recents carry no task status) means no swipe/toggle at
		// all, not a guessed "not done" — see `isTaskDone`.
		const done = record.kind === "task" ? isTaskDone(record) : undefined;

		return (
			<WorkRow
				record={record}
				sub={sub}
				first={first}
				last={last}
				done={done ?? false}
				toggling={togglingIds.has(record.id)}
				selected={
					isPane &&
					record.kind !== "task" &&
					sameRef(selected, { kind: record.kind, id: record.id })
				}
				onOpen={() => open(record)}
				onToggleTask={
					record.kind === "task" && done !== undefined
						? () => handleToggleTask(record)
						: undefined
				}
				onLongPressMenu={(anchor) => openRecordMenu(record, anchor)}
			/>
		);
	};

	const emptyCopy = (): {
		title: string;
		body: string;
		icon: typeof Building2;
	} => {
		if (searching) {
			return {
				title: "No matches",
				body: "Search matches the start of words — try a name, number or fewer letters.",
				icon: SearchX,
			};
		}
		if (kind && !canBrowse(kind)) {
			return {
				title: "No access",
				body: "Your role doesn't include this. Ask an admin to update your access.",
				icon: ShieldOff,
			};
		}
		if (kind) {
			return {
				title: `No ${KIND_LABEL[kind].toLowerCase()} yet`,
				body: "Records you create show up here.",
				icon: KIND_EMPTY_ICON[kind],
			};
		}
		// First run is the COMMON state on this screen, not an edge case: the trail
		// is on-device, so a fresh install always lands here.
		return {
			title: "Nothing viewed yet",
			body: "Records you open appear here. Search finds everything else.",
			icon: History,
		};
	};

	const empty = emptyCopy();

	const tabs = useMemo(
		() => [
			{ value: "all" as const, label: "All" },
			...CHIP_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] })),
		],
		[],
	);

	return (
		<View style={styles.screen}>
			{/* Controls stay pinned either way — a search-first surface must not
			    scroll its own controls away. The pane keeps its own search field
			    (iPad has no phone composer); the phone tab row is search-less, the
			    composer owns that job instead. */}
			<View style={[styles.controls, { paddingTop: isPane ? 10 : NOTCH_CLEARANCE }]}>
				{isPane ? (
					<SearchField
						value={raw}
						onChangeText={setRaw}
						inputRef={paneInputRef}
						placeholder="Search clients, quotes, invoices…"
					/>
				) : null}
				<UnderlineTabs
					tabs={tabs}
					value={kind ?? "all"}
					onChange={(v) => setKind(v === "all" ? null : v)}
				/>
			</View>

			{loading ? (
				<View style={[styles.listContent, { paddingTop: listTop }]}>
					{/* Shaped like the real body: a group label, then rows. */}
					<View
						style={[
							styles.skeletonBar,
							styles.skeletonLabel,
							{ backgroundColor: t.lineSoft },
						]}
					/>
					{[0, 1, 2, 3, 4, 5].map((i) => (
						<View
							key={i}
							style={[
								styles.skeletonRow,
								{ backgroundColor: t.card, borderColor: t.line },
							]}
						>
							<View
								style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]}
							/>
							<View style={styles.skeletonBody}>
								<View
									style={[
										styles.skeletonBar,
										{ width: "55%", backgroundColor: t.lineSoft },
									]}
								/>
								<View
									style={[
										styles.skeletonBar,
										{
											width: "35%",
											height: 11,
											marginTop: 6,
											backgroundColor: t.lineSoft,
										},
									]}
								/>
							</View>
						</View>
					))}
				</View>
			) : (
				<FlashList
					data={rows}
					keyExtractor={(item) => item.key}
					getItemType={(item) => item.type}
					renderItem={renderRow}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: listTop,
						paddingBottom: listBottom,
					}}
					// On by default in FlashList v2 — but the list re-keys wholesale
					// between search, browse and recents, so anchoring to a vanished row
					// creeps the offset. Not a chat.
					maintainVisibleContentPosition={{ disabled: true }}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					ListEmptyComponent={
						<View style={styles.emptyWrap}>
							<EmptyPanel icon={empty.icon} title={empty.title} body={empty.body} />
						</View>
					}
					ListFooterComponent={
						// Buckets cap at five hits server-side. Saying so beats letting a
						// user believe a truncated list is the whole answer.
						searching && rows.length > 0 ? (
							<Text style={[styles.footnote, { color: t.sub }]}>
								Top matches per type. Keep typing to narrow them.
							</Text>
						) : null
					}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	swipeAction: {
		width: 96,
		alignItems: "center",
		justifyContent: "center",
	},
	swipeActionText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
		color: "#fff",
	},
	controls: {
		paddingHorizontal: GUTTER,
		paddingBottom: 8,
		gap: 10,
	},
	listContent: {
		paddingHorizontal: GUTTER,
		paddingBottom: 24,
	},
	sectionLabelWrap: {
		paddingTop: 18,
		paddingBottom: 9,
	},
	rowWrap: {
		borderLeftWidth: 1,
		borderRightWidth: 1,
	},
	rowFirst: {
		borderTopWidth: 1,
		borderTopLeftRadius: radii.card,
		borderTopRightRadius: radii.card,
	},
	rowLast: {
		borderBottomLeftRadius: radii.card,
		borderBottomRightRadius: radii.card,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderRadius: radii.card,
		marginBottom: 6,
	},
	skeletonTile: {
		width: 32,
		height: 32,
		borderRadius: 9,
	},
	skeletonBody: {
		flex: 1,
	},
	skeletonBar: {
		height: 13,
		borderRadius: radii.xs,
	},
	skeletonLabel: {
		width: 74,
		height: 9,
		marginTop: 18,
		marginBottom: 11,
	},
	emptyWrap: {
		paddingTop: 8,
	},
	footnote: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		textAlign: "center",
		paddingTop: 18,
	},
});
