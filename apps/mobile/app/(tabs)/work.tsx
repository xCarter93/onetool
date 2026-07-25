import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
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
import { sameRef, type RecordRef } from "@/lib/selection-context";
import {
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
	filterRecords,
	groupByKind,
	KIND_LABEL,
	pathForRecord,
	sortByRecency,
	toClientRecord,
	toInvoiceRecord,
	toProjectRecord,
	toQuoteRecord,
	type WorkKind,
	type WorkRecord,
} from "@/lib/work-search";

const isWorkKind = (v: unknown): v is WorkKind =>
	typeof v === "string" && v in KIND_LABEL;

// Leading tile glyph per record kind (tints come from theme's recordTint).
const KIND_ICON: Record<WorkKind, keyof typeof icons> = {
	client: "Building2",
	project: "Folder",
	quote: "FileText",
	invoice: "Receipt",
};

// "Recently active" is a peek, not a full browse — the chips are the way to see
// everything of one kind.
const RECENT_LIMIT = 30;

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
	kind?: WorkKind | null;
	onKindChange?: (kind: WorkKind | null) => void;
} = {}) {
	const t = useTokens();
	const router = useRouter();
	const isPane = headerMode === "pane";

	// Raw input drives the field; `q` (debounced 250ms) drives filtering.
	const [raw, setRaw] = useState("");
	const [q, setQ] = useState("");
	useEffect(() => {
		const id = setTimeout(() => setQ(raw.trim()), 250);
		return () => clearTimeout(id);
	}, [raw]);

	// Deep-link chip seed: Today's attention line pushes ?kind=quote. Unknown
	// values fall back to no chip rather than being cast in.
	const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
	const rawParam = kindParam ?? null;
	const [appliedParam, setAppliedParam] = useState<string | null>(rawParam);
	const [localKind, setLocalKind] = useState<WorkKind | null>(
		isWorkKind(rawParam) ? rawParam : null,
	);
	// Re-seed at render time (set-state-in-effect is error-level here) and only
	// when the param VALUE changes, so a later chip tap still wins.
	if (rawParam !== appliedParam) {
		setAppliedParam(rawParam);
		if (isWorkKind(rawParam)) setLocalKind(rawParam);
	}
	const kind = kindProp !== undefined ? kindProp : localKind;
	const setKind = (next: WorkKind | null) =>
		onKindChange ? onKindChange(next) : setLocalKind(next);
	// Seed "now" once — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	// All four lists stay subscribed regardless of the active chip: the default
	// mixed body needs them anyway, and it keeps chip switches instant.
	const clients = useQuery(api.clients.list, { includeArchived: true });
	const projects = useQuery(api.projects.list, {});
	const quotes = useQuery(api.quotes.list, {});
	const invoices = useQuery(api.invoices.list, {});

	const loading =
		clients === undefined ||
		projects === undefined ||
		quotes === undefined ||
		invoices === undefined;

	const clientNames = useMemo(() => buildClientNameMap(clients), [clients]);

	const byKind = useMemo(
		() => ({
			client: (clients ?? []).map((c) => toClientRecord(c)),
			project: (projects ?? []).map((p) =>
				toProjectRecord(p, { clientName: clientNames.get(p.clientId) })
			),
			quote: (quotes ?? []).map((qt) =>
				toQuoteRecord(qt, { clientName: clientNames.get(qt.clientId) })
			),
			invoice: (invoices ?? []).map((inv) =>
				toInvoiceRecord(inv, { clientName: clientNames.get(inv.clientId), now })
			),
		}),
		[clients, projects, quotes, invoices, clientNames, now]
	);

	const counts = useMemo(
		() => ({
			client: byKind.client.length,
			project: byKind.project.length,
			quote: byKind.quote.length,
			invoice: byKind.invoice.length,
		}),
		[byKind]
	);

	const sections = useMemo<Section[]>(() => {
		// Grouped cross-type results: query, no chip.
		if (q && kind === null) {
			const pool = [
				...byKind.client,
				...byKind.project,
				...byKind.quote,
				...byKind.invoice,
			];
			return groupByKind(filterRecords(pool, q)).map((g) => ({
				key: g.kind,
				label: g.label,
				records: sortByRecency(g.records),
			}));
		}

		// Single-kind browse or scoped results.
		if (kind !== null) {
			const records = sortByRecency(filterRecords(byKind[kind], q));
			return records.length
				? [{ key: kind, label: KIND_LABEL[kind], records }]
				: [];
		}

		// Default body — mixed, most recently active first.
		const recent = sortByRecency([
			...byKind.client,
			...byKind.project,
			...byKind.quote,
			...byKind.invoice,
		]).slice(0, RECENT_LIMIT);
		return recent.length
			? [{ key: "recent", label: "Recently active", records: recent }]
			: [];
	}, [byKind, kind, q]);

	const rows = useMemo<Row[]>(() => {
		const out: Row[] = [];
		for (const section of sections) {
			out.push({
				type: "header",
				key: `h:${section.key}`,
				label: section.label,
			});
			section.records.forEach((record, i) => {
				out.push({
					type: "record",
					key: `${record.kind}:${record.id}`,
					record,
					first: i === 0,
					last: i === section.records.length - 1,
				});
			});
		}
		return out;
	}, [sections]);

	// On iPad pane: row tap drives the shell selection (no route push — a push
	// would slide the whole shell). On iPhone: push the detail route as before.
	const open = (record: WorkRecord) =>
		onSelect
			? onSelect({ kind: record.kind, id: record.id })
			: router.push(pathForRecord(record) as Href);

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
		const sub =
			record.kind === "quote" || record.kind === "invoice"
				? `${record.meta} · ${formatCurrency(record.amount, { exact: true })}`
				: record.meta;

		return (
			<ListRow
				icon={KIND_ICON[record.kind]}
				iconColor={tint.fg}
				iconBg={tint.bg}
				title={record.title}
				sub={sub}
				status={record.status}
				onPress={() => open(record)}
				selected={
					isPane && sameRef(selected, { kind: record.kind, id: record.id })
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

	// Per-kind fragment art previews the records about to land there.
	const KIND_ILLO: Record<WorkKind, IllustrationName> = {
		client: "clients-none",
		project: "projects-none",
		quote: "quotes-none",
		invoice: "invoices-none",
	};

	const emptyCopy = (): {
		title: string;
		body: string;
		illo: IllustrationName;
	} => {
		if (q) {
			return {
				title: "No matches",
				body: "Try a different name or number.",
				illo: "no-filter-match",
			};
		}
		if (kind) {
			return {
				title: `No ${KIND_LABEL[kind].toLowerCase()} yet`,
				body: "Records you create on the web show up here.",
				illo: KIND_ILLO[kind],
			};
		}
		return {
			title: "Nothing here yet",
			body: "Clients, projects, quotes and invoices show up here as you add them.",
			// Generic record-rows fragment — the mixed default body is still a list.
			illo: "clients-none",
		};
	};

	const empty = emptyCopy();

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Pane mode: the shell mounts PaneHeader above this body (one header
			    per pane — locked convention); it owns the +. On iPhone the ＋ is
			    unconditional: client is the only record type mobile can create here
			    (quotes/invoices/projects stay web-only at 2.0), and a ＋ that
			    disappears on some chips reads as a bug. */}
			{isPane ? null : (
				<AppHeader
					mode="root"
					title="Work"
					halftone
					// Controls below are pinned, so this screen places the fade itself.
					fade={false}
					onAdd={() => router.push("/clients/new" as Href)}
					addLabel="New client"
				/>
			)}

			{/* Controls stay pinned — a search-first surface must not scroll its
			    own search field away. */}
			<View style={styles.controls}>
				<SearchField value={raw} onChangeText={setRaw} />
				<TypeChips value={kind} onChange={setKind} counts={counts} />
				{/* At the real chrome/scroll boundary. In AppHeader it painted over
				    the search field, which has no inset to absorb it. */}
				{isPane ? null : <ScrollFade edge="top" />}
			</View>

			{loading ? (
				<View style={styles.listContent}>
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
					contentContainerStyle={styles.listContent}
					// On by default in FlashList v2. Four independent subscriptions
					// resolve at different times into a recency-sorted list, so rows
					// land above the anchor and the offset creeps down. Not a chat.
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
});
