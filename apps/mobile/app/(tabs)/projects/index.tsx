import {
	View,
	Text,
	Pressable,
	ScrollView,
	TextInput,
	StyleSheet,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Search, Calendar, X } from "lucide-react-native";
import {
	colors,
	DOCK_CLEARANCE,
	fontFamily,
	radii,
	useTokens,
} from "@/lib/theme";
import { Badge, DotGrid, Eyebrow, SCROLL_TOP_INSET } from "@/components/ui";
import { InkTabHeader } from "@/components/ink-tab-header";

type Project = Doc<"projects">;
type FilterValue = "all" | "active" | "in-progress" | "completed";

function formatDate(timestamp: number | undefined): string | null {
	if (!timestamp) return null;
	// Project start/end dates are stored at UTC midnight — formatting in the
	// device zone renders the previous day west of Greenwich.
	return new Date(timestamp).toLocaleDateString("en-US", {
		timeZone: "UTC",
		month: "short",
		day: "numeric",
	});
}

// headerMode/onSelect/selectedId default off → the iPhone path (router.push,
// the InkTabHeader band titled "Projects", no selected highlight) is
// byte-identical. headerMode="pane" suppresses that band for a host that
// mounts its own pane header, onSelect drives a detail pane via selection,
// selectedId marks the row. NOTE: the iPad shell does NOT mount this screen —
// its "work" pane mounts app/(tabs)/work.tsx, whose "Work" title is correct.
export default function ProjectsScreen({
	headerMode = "root",
	onSelect,
	selectedId = null,
}: {
	headerMode?: "root" | "pane";
	onSelect?: (id: string) => void;
	selectedId?: string | null;
} = {}) {
	const router = useRouter();
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const isPane = headerMode === "pane";
	// The floating dock takes no layout height — the list clears it itself.
	// iPad panes have no dock (the shell replaces Tabs).
	const listBottom = isPane ? 24 : DOCK_CLEARANCE + insets.bottom;
	// iPhone: the ink band is a solid hard edge, so the list starts just under it
	// (Money's value). iPad pane: no band, so the translucent-header inset stays.
	const listTop = isPane ? SCROLL_TOP_INSET : 12;
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<FilterValue>("all");

	const projects = useQuery(api.projects.list, {});
	const clients = useQuery(api.clients.list, {});

	const loading = projects === undefined || clients === undefined;

	// Single org-scoped clients query → name map. No per-row clients.get (N+1).
	const clientNameById = useMemo(
		() =>
			new Map<Id<"clients">, string>(
				(clients ?? []).map((c) => [c._id, c.companyName])
			),
		[clients]
	);
	const clientName = (p: Project) =>
		clientNameById.get(p.clientId) ?? "Unknown client";

	const allProjects = useMemo(() => projects ?? [], [projects]);

	const counts = useMemo(
		() => ({
			all: allProjects.length,
			active: allProjects.filter(
				(p) => p.status === "in-progress" || p.status === "planned"
			).length,
			"in-progress": allProjects.filter((p) => p.status === "in-progress")
				.length,
			completed: allProjects.filter((p) => p.status === "completed").length,
		}),
		[allProjects]
	);

	const chips: { value: FilterValue; label: string }[] = [
		{ value: "all", label: "All" },
		{ value: "active", label: "Active" },
		{ value: "in-progress", label: "In Progress" },
		{ value: "completed", label: "Done" },
	];

	const visibleProjects = useMemo(() => {
		let list = allProjects;
		if (filter === "active") {
			list = list.filter(
				(p) => p.status === "in-progress" || p.status === "planned"
			);
		} else if (filter !== "all") {
			list = list.filter((p) => p.status === filter);
		}
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(p) =>
					p.title.toLowerCase().includes(q) ||
					clientName(p).toLowerCase().includes(q)
			);
		}
		return list;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allProjects, filter, searchQuery, clientNameById]);

	// iPad pane: tap drives shell selection (no route push). iPhone: push route.
	const openProject = (id: string) =>
		onSelect ? onSelect(id) : router.push(`/projects/${id}`);

	const renderProject = ({ item }: { item: Project }) => {
		const start = formatDate(item.startDate);
		const end = formatDate(item.endDate);
		const range =
			start && end
				? `${start} – ${end}`
				: start
					? `Starts ${start}`
					: end
						? `Due ${end}`
						: null;
		const isSelected = isPane && item._id === selectedId;

		return (
			<Pressable
				style={({ pressed }) => [
					styles.card,
					{ backgroundColor: t.card, borderColor: t.line },
					isSelected && { borderColor: t.primarySolid, backgroundColor: t.frostedBg },
					pressed && styles.cardPressed,
				]}
				onPress={() => openProject(item._id)}
			>
				<View style={styles.cardTop}>
					<View style={styles.cardTitleCol}>
						<Eyebrow>#{item.projectNumber}</Eyebrow>
						<Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>
							{item.title}
						</Text>
						<Text style={[styles.client, { color: t.sub }]} numberOfLines={1}>
							{clientName(item)}
						</Text>
					</View>
					<Badge status={item.status} />
				</View>
				{range && (
					<View style={styles.metaRow}>
						<Calendar size={14} color={t.faint} />
						<Text style={[styles.metaText, { color: t.sub }]}>{range}</Text>
					</View>
				)}
			</Pressable>
		);
	};

	const ListHeader = (
		<View style={styles.listHeader}>
			<View
				style={[styles.searchBar, { backgroundColor: t.card, borderColor: t.line }]}
			>
				<Search size={19} color={t.faint} />
				<TextInput
					value={searchQuery}
					onChangeText={setSearchQuery}
					placeholder="Search work…"
					placeholderTextColor={t.faint}
					style={[styles.searchInput, { color: t.ink }]}
				/>
				{searchQuery.length > 0 && (
					<Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
						<X size={16} color={t.faint} />
					</Pressable>
				)}
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.chipRow}
			>
				{chips.map((chip) => {
					const active = chip.value === filter;
					return (
						<Pressable
							key={chip.value}
							onPress={() => setFilter(chip.value)}
							style={[
								styles.chip,
								active
									? { backgroundColor: t.ink, borderColor: t.ink }
									: { backgroundColor: t.card, borderColor: t.line },
							]}
						>
							<Text
								style={[
									styles.chipLabel,
									{ color: active ? colors.primaryForeground : t.sub },
								]}
							>
								{chip.label}
							</Text>
							<Text
								style={[
									styles.chipCount,
									{ color: active ? colors.primaryForeground : t.faint },
								]}
							>
								{counts[chip.value]}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: t.surface }}
			edges={[]}
		>
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Pane mode: shell mounts PaneHeader title="Work" above this body.
			    iPhone: the shared ink band. It keeps a back circle because this
			    route is always pushed (it holds no dock slot — href: null). */}
			{isPane ? null : (
				<InkTabHeader title="Projects" onBack={() => router.back()} />
			)}

			{loading ? (
				<View style={[styles.listContent, { paddingTop: listTop }]}>
					{ListHeader}
					{[0, 1, 2, 3].map((i) => (
						<View
							key={i}
							style={[
								styles.card,
								{ backgroundColor: t.card, borderColor: t.line },
								styles.skeletonCard,
							]}
						>
							<View
								style={[
									styles.skeleton,
									{ backgroundColor: t.lineSoft, width: 48, height: 11 },
								]}
							/>
							<View
								style={[
									styles.skeleton,
									{ backgroundColor: t.lineSoft, width: "70%", height: 16, marginTop: 8 },
								]}
							/>
							<View
								style={[
									styles.skeleton,
									{ backgroundColor: t.lineSoft, width: "45%", height: 13, marginTop: 6 },
								]}
							/>
						</View>
					))}
				</View>
			) : (
				<FlashList
					data={visibleProjects}
					keyExtractor={(item) => item._id}
					renderItem={renderProject}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: listTop,
						paddingBottom: listBottom,
					}}
					ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							{allProjects.length === 0 ? (
								<>
									<Text style={[styles.emptyTitle, { color: t.ink }]}>No work yet</Text>
									<Text style={[styles.emptyText, { color: t.sub }]}>
										Projects you create will show up here.
									</Text>
								</>
							) : (
								<Text style={[styles.emptyText, { color: t.sub }]}>
									Try a different search or filter.
								</Text>
							)}
						</View>
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	listContent: {
		paddingHorizontal: 16,
		paddingBottom: 24,
	},
	listHeader: {
		gap: 12,
		paddingBottom: 12,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		borderWidth: 1,
		borderRadius: radii["4xl"],
		paddingHorizontal: 14,
		height: 46,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 13,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
		paddingVertical: 0,
	},
	chipRow: {
		gap: 8,
		paddingRight: 16,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		minHeight: 36,
		paddingHorizontal: 15,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	chipLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 12.5,
	},
	chipCount: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
	},
	card: {
		borderRadius: radii.rLg,
		borderWidth: 1,
		padding: 16,
	},
	cardPressed: {
		opacity: 0.85,
	},
	cardTop: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 10,
	},
	cardTitleCol: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		marginTop: 2,
	},
	client: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 2,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 12,
	},
	metaText: {
		fontFamily: fontFamily.regular,
		fontSize: 11.5,
	},
	skeletonCard: {
		marginBottom: 12,
	},
	skeleton: {
		borderRadius: radii.sm,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 18,
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		textAlign: "center",
	},
});
