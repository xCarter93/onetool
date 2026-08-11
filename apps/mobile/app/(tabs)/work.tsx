import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import {
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
	type Href,
} from "expo-router";
import { useOrganization } from "@clerk/expo";
import { api } from "@onetool/backend/convex/_generated/api";
import type { icons } from "lucide-react-native";
import { AppHeader } from "@/components/app-header";
import { SearchField } from "@/components/work/search-field";
import { TypeChips } from "@/components/work/type-chips";
import {
	DotGrid,
	ListRow,
	SCROLL_TOP_INSET,
	ScrollFade,
} from "@/components/ui";
import { Illustration, type IllustrationName } from "@/components/illustrations";
import { formatCurrency } from "@/lib/format";
import { getRecents, type RecentRecord } from "@/lib/recents";
import { consumeSearchFocus } from "@/lib/search-focus";
import { sameRef, type RecordRef } from "@/lib/selection-context";
import {
	DOCK_CLEARANCE,
	fontFamily,
	radii,
	recordTint,
	spacing,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
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

// Leading tile glyph per record kind (tints come from theme's recordTint).
const KIND_ICON: Record<WorkChipKind, keyof typeof icons> = {
	client: "Building2",
	project: "Folder",
	quote: "FileText",
	invoice: "Receipt",
	task: "CircleCheck",
};

// Per-kind fragment art previews the records about to land in an empty browse
// list. Module scope: it never varies per render.
const KIND_ILLO: Record<WorkChipKind, IllustrationName> = {
	client: "clients-none",
	project: "projects-none",
	quote: "quotes-none",
	invoice: "invoices-none",
	task: "all-caught-up",
};

type Section = { key: string; label: string; records: WorkRecord[] };

type Row =
	| { type: "header"; key: string; label: string }
	| {
			type: "record";
			key: string;
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
				record,
				first: i === 0,
				last: i === section.records.length - 1,
			});
		});
	}
	return out;
}

// headerMode/onSelect/selected/kind default off → the iPhone path (router.push,
// AppHeader mode="root", no selected highlight, uncontrolled chip) is byte-
// identical. The iPad shell renders this as a list pane: headerMode="pane"
// suppresses the self-mounted AppHeader (shell mounts PaneHeader), onSelect
// drives the detail pane via the shell selection instead of a route push,
// selected marks the row, and kind/onKindChange let the shell drive the chip
// (e.g. "View all projects").
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
	const insets = useSafeAreaInsets();
	const isPane = headerMode === "pane";
	// The floating dock takes no layout height — scroll content clears it itself.
	// iPad panes have no dock (the shell replaces Tabs).
	const listBottom = isPane ? 24 : DOCK_CLEARANCE + insets.bottom;

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
	// when the param VALUE changes, so a later chip tap still wins.
	if (rawParam !== appliedParam) {
		setAppliedParam(rawParam);
		if (isChipKind(rawParam)) setLocalKind(rawParam);
	}
	const kind = kindProp !== undefined ? kindProp : localKind;
	const setKind = (next: WorkChipKind | null) =>
		onKindChange ? onKindChange(next) : setLocalKind(next);
	// Seed "now" once — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	// ── Search field focus ──────────────────────────────────────────────────
	// One-shot latch set by the header magnifier on the other tab roots. Never in
	// a pane: on iPad the magnifier does not exist and Work is always mounted.
	const inputRef = useRef<TextInput | null>(null);
	useFocusEffect(
		useCallback(() => {
			if (isPane || !consumeSearchFocus()) return;
			// One frame of slack — focusing mid-transition drops the keyboard.
			const frame = requestAnimationFrame(() => inputRef.current?.focus());
			return () => cancelAnimationFrame(frame);
		}, [isPane]),
	);

	// ── Data ────────────────────────────────────────────────────────────────
	// Search is the primary path. Browse lists are LAZY — only the active chip's
	// list subscribes, which is what let the four always-on subscriptions go.
	const results = useQuery(
		api.search.globalSearch,
		searching ? { query: q } : "skip",
	);

	const browseKind = searching ? null : kind;
	// Clients are also the meta line ("Acme · PRJ-7") for the other three kinds,
	// so one subscription serves both the client browse list and their names.
	const wantsClients =
		browseKind !== null && browseKind !== "task"
			? { includeArchived: true }
			: "skip";
	const clients = useQuery(api.clients.list, wantsClients);
	const projects = useQuery(
		api.projects.list,
		browseKind === "project" ? {} : "skip",
	);
	const quotes = useQuery(api.quotes.list, browseKind === "quote" ? {} : "skip");
	const invoices = useQuery(
		api.invoices.list,
		browseKind === "invoice" ? {} : "skip",
	);
	const tasks = useQuery(api.tasks.list, browseKind === "task" ? {} : "skip");

	// ── Recently viewed (on-device, per org) ────────────────────────────────
	const { organization } = useOrganization();
	const orgId = organization?.id;
	// null = not read yet. Refreshed on focus so a record opened and dismissed
	// this session is already at the top when the tab comes back.
	const [recents, setRecents] = useState<RecentRecord[] | null>(null);
	useFocusEffect(
		useCallback(() => {
			if (!orgId) return;
			let alive = true;
			getRecents(orgId).then((list) => {
				if (alive) setRecents(list);
			});
			return () => {
				alive = false;
			};
		}, [orgId]),
	);

	const resting = !searching && kind === null;

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
		? results === undefined
		: browseKind !== null
			? browseList[browseKind] === undefined ||
				(browseKind !== "task" && clients === undefined)
			: !!orgId && recents === null;

	const clientNames = useMemo(() => buildClientNameMap(clients), [clients]);

	const searchSections = useMemo<Section[]>(() => {
		if (!results) return [];
		const byKind: Record<WorkChipKind, WorkRecord[]> = {
			client: results.clients.map(fromClientHit),
			project: results.projects.map(fromProjectHit),
			quote: results.quotes.map(fromQuoteHit),
			invoice: results.invoices.map(fromInvoiceHit),
			task: results.tasks.map((doc) => toTaskRecord(doc)),
		};
		// Hits arrive relevance-ordered per bucket — never re-sort them.
		return CHIP_ORDER.filter((k) => kind === null || kind === k)
			.map((k) => ({ key: k, label: KIND_LABEL[k], records: byKind[k] }))
			.filter((s) => s.records.length > 0);
	}, [results, kind]);

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
										now,
									}),
								)
							: (tasks ?? []).map((task) => toTaskRecord(task));
		const sorted = sortByRecency(records);
		return sorted.length
			? [{ key: browseKind, label: KIND_LABEL[browseKind], records: sorted }]
			: [];
	}, [browseKind, clients, projects, quotes, invoices, tasks, clientNames, now]);

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
						: recentSections,
			),
		[searching, browseKind, searchSections, browseSections, recentSections],
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

	const renderRow = ({ item }: { item: Row }) => {
		if (item.type === "header") {
			return (
				<Text style={[styles.sectionLabel, { color: t.faint }]}>
					{item.label.toUpperCase()}
				</Text>
			);
		}

		const { record, first, last } = item;
		const tint = recordTint[record.kind];
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

		return (
			<ListRow
				icon={KIND_ICON[record.kind]}
				iconColor={tint.fg}
				iconBg={tint.bg}
				title={record.title}
				sub={sub || undefined}
				status={record.status}
				onPress={() => open(record)}
				selected={
					isPane &&
					record.kind !== "task" &&
					sameRef(selected, { kind: record.kind, id: record.id })
				}
				containerStyle={[
					styles.rowCard,
					{ backgroundColor: t.card, borderColor: t.line },
					first && styles.rowFirst,
					last ? [styles.rowLast, { borderBottomColor: t.line }] : null,
				]}
			/>
		);
	};

	const emptyCopy = (): {
		title: string;
		body: string;
		illo: IllustrationName;
	} => {
		if (searching) {
			return {
				title: "No matches",
				body: "Search matches the start of words — try a name, number or fewer letters.",
				illo: "no-filter-match",
			};
		}
		if (kind) {
			return {
				title: `No ${KIND_LABEL[kind].toLowerCase()} yet`,
				body: "Records you create show up here.",
				illo: KIND_ILLO[kind],
			};
		}
		// First run is the COMMON state on this screen, not an edge case: the trail
		// is on-device, so a fresh install always lands here.
		return {
			title: "Nothing viewed yet",
			body: "Records you open appear here. Search finds everything else.",
			illo: "activity-none",
		};
	};

	const empty = emptyCopy();

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Pane mode: the shell mounts PaneHeader above this body (one header
			    per pane — locked convention); it owns the ＋, and the rail's create
			    menu covers the rest. On iPhone the header carries no ＋: the
			    speed-dial FAB is the single capture entry point (3.0 slice 5). */}
			{isPane ? null : (
				<AppHeader
					mode="root"
					title="Work"
					halftone
					// Controls below are pinned, so this screen places the fade itself.
					fade={false}
				/>
			)}

			{/* Controls stay pinned — a search-first surface must not scroll its
			    own search field away. */}
			<View style={styles.controls}>
				<SearchField value={raw} onChangeText={setRaw} inputRef={inputRef} />
				<TypeChips value={kind} onChange={setKind} />
				{/* At the real chrome/scroll boundary. In AppHeader it painted over
				    the search field, which has no inset to absorb it. */}
				{isPane ? null : <ScrollFade edge="top" />}
			</View>

			{loading ? (
				<View style={styles.listContent}>
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
						paddingBottom: listBottom,
					}}
					// On by default in FlashList v2 — but the list re-keys wholesale
					// between search, browse and recents, so anchoring to a vanished row
					// creeps the offset. Not a chat.
					maintainVisibleContentPosition={{ disabled: true }}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					ListEmptyComponent={
						<View style={styles.emptyState}>
							<Illustration
								name={empty.illo}
								knockout={t.bg}
								style={styles.emptyArt}
							/>
							<Text style={[styles.emptyTitle, { color: t.ink }]}>
								{empty.title}
							</Text>
							<Text style={[styles.emptyText, { color: t.sub }]}>
								{empty.body}
							</Text>
						</View>
					}
					ListFooterComponent={
						// Buckets cap at five hits server-side. Saying so beats letting a
						// user believe a truncated list is the whole answer.
						searching && rows.length > 0 ? (
							<Text style={[styles.footnote, { color: t.faint }]}>
								Top matches per type. Keep typing to narrow them.
							</Text>
						) : null
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	controls: {
		paddingHorizontal: spacing.gutter,
		paddingTop: 12,
		paddingBottom: 12,
		gap: 10,
		// Anchors the ScrollFade to this block's bottom edge.
		position: "relative",
	},
	listContent: {
		paddingHorizontal: spacing.gutter,
		paddingBottom: 24,
		paddingTop: SCROLL_TOP_INSET,
	},
	sectionLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
		paddingTop: 18,
		paddingBottom: 7,
	},
	rowCard: {
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
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyArt: {
		marginBottom: 16,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		textAlign: "center",
	},
	footnote: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		textAlign: "center",
		paddingTop: 18,
	},
});
