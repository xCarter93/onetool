import { Pressable, View, TextInput, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useReopenTabBarAtTop } from "@/lib/shell-chrome";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Search, X } from "lucide-react-native";
import { GUTTER, EmptyPanel, PageHeader, RecordRow, CANVAS_HEADER as canvasHeader } from "@/components/canvas";
import { SegmentedToggle } from "@/components/ui";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { useCachedCan } from "@/lib/use-permissions";

type Project = Doc<"projects">;
type FilterValue = "all" | "active" | "in-progress" | "completed";

const SEGMENTS: { value: FilterValue; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "in-progress", label: "In progress" },
	{ value: "completed", label: "Done" },
];

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

// headerMode/onSelect/selectedId default off → the iPhone path (router.push, no
// selected highlight) is byte-identical. headerMode="pane" would suppress the
// page header for a host that mounts its own pane header, onSelect drives a
// detail pane via selection, selectedId marks the row. The iPad shell does not
// currently mount this screen (its "work" pane covers projects via Work).
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
	const reopenAtTop = useReopenTabBarAtTop();
	const isPane = headerMode === "pane";
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<FilterValue>("all");

	const projects = useCachedQuery(api.projects.list, {});
	const canView = useCachedCan();
	// Names only; a role without client access still lists its projects.
	const viewClients = canView("clients");
	const clients = useCachedQuery(api.clients.list, viewClients ? {} : "skip");

	const loading = projects === undefined || (viewClients && clients === undefined);

	// Single org-scoped clients query → name map. No per-row clients.get (N+1).
	const clientNameById = useMemo(
		() => new Map<Id<"clients">, string>((clients ?? []).map((c) => [c._id, c.companyName])),
		[clients],
	);
	const clientName = (p: Project) => clientNameById.get(p.clientId) ?? "Unknown client";

	const allProjects = useMemo(() => projects ?? [], [projects]);

	const counts = useMemo(
		() => ({
			all: allProjects.length,
			active: allProjects.filter((p) => p.status === "in-progress" || p.status === "planned").length,
			"in-progress": allProjects.filter((p) => p.status === "in-progress").length,
			completed: allProjects.filter((p) => p.status === "completed").length,
		}),
		[allProjects],
	);

	const visibleProjects = useMemo(() => {
		let list = allProjects;
		if (filter === "active") {
			list = list.filter((p) => p.status === "in-progress" || p.status === "planned");
		} else if (filter !== "all") {
			list = list.filter((p) => p.status === filter);
		}
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(p) => p.title.toLowerCase().includes(q) || clientName(p).toLowerCase().includes(q),
			);
		}
		return list;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allProjects, filter, searchQuery, clientNameById]);

	const openProject = (id: string) => (onSelect ? onSelect(id) : router.push(`/projects/${id}`));

	const renderProject = ({ item, index }: { item: Project; index: number }) => {
		const start = formatDate(item.startDate);
		const end = formatDate(item.endDate);
		const range =
			start && end ? `${start} to ${end}` : start ? `Starts ${start}` : end ? `Due ${end}` : null;
		const isSelected = isPane && item._id === selectedId;
		const first = index === 0;
		const last = index === visibleProjects.length - 1;
		return (
			<View
				style={[
					styles.panelRow,
					{ backgroundColor: t.card, borderColor: t.line },
					first && styles.panelFirst,
					last && styles.panelLast,
					!first && { borderTopWidth: 1, borderTopColor: t.lineSoft },
				]}
			>
				<RecordRow
					kind="project"
					title={item.title}
					subtitle={`#${item.projectNumber} · ${clientName(item)}${range ? ` · ${range}` : ""}`}
					status={item.status}
					selected={isSelected}
					onPress={() => openProject(item._id)}
				/>
			</View>
		);
	};

	const ListHeader = (
		<View style={styles.listHeader}>
			{isPane ? null : (
				<View style={canvasHeader}>
					<PageHeader title="Projects" hairline={false} />
				</View>
			)}
			<View style={[styles.searchBar, { borderColor: t.input, backgroundColor: t.card }]}>
				<Search size={18} color={t.sub} strokeWidth={2} />
				<TextInput
					value={searchQuery}
					onChangeText={setSearchQuery}
					placeholder="Search projects"
					placeholderTextColor={t.sub}
					style={[styles.searchInput, { color: t.ink }]}
				/>
				{searchQuery.length > 0 && (
					<Pressable
						onPress={() => setSearchQuery("")}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Clear search"
					>
						<X size={16} color={t.sub} strokeWidth={2} />
					</Pressable>
				)}
			</View>
			<SegmentedToggle
				segments={SEGMENTS.map((s) => ({ ...s, count: counts[s.value] }))}
				value={filter}
				onChange={setFilter}
			/>
		</View>
	);

	return (
		<View style={styles.screen}>
			{loading ? (
				<View style={[styles.listContent, { paddingTop: 12 }]}>
					{ListHeader}
					<View style={[styles.panel, { backgroundColor: t.card, borderColor: t.line }]}>
						{[0, 1, 2].map((i) => (
							<View
								key={i}
								style={[
									styles.skeletonRow,
									i > 0 && { borderTopWidth: 1, borderTopColor: t.lineSoft },
								]}
							>
								<View style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]} />
								<View style={styles.skeletonBody}>
									<View style={[styles.skeleton, { backgroundColor: t.lineSoft, width: "70%", height: 14 }]} />
									<View
										style={[
											styles.skeleton,
											{ backgroundColor: t.lineSoft, width: "45%", height: 12, marginTop: 6 },
										]}
									/>
								</View>
							</View>
						))}
					</View>
				</View>
			) : (
				<FlashList
					contentInsetAdjustmentBehavior="automatic"
					onScroll={reopenAtTop}
					scrollEventThrottle={16}
					data={visibleProjects}
					keyExtractor={(item) => item._id}
					renderItem={renderProject}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: 12,
					}}
					ListEmptyComponent={
						allProjects.length === 0 ? (
							<EmptyPanel title="No work yet" body="Projects you create will show up here." />
						) : (
							<EmptyPanel title="No projects found" body="Try a different search or filter." />
						)
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
	listContent: {
		paddingHorizontal: GUTTER,
		paddingBottom: 32,
	},
	listHeader: {
		gap: 16,
		paddingBottom: 16,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		minHeight: 44,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 16,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
		paddingVertical: 10,
	},
	panel: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	panelRow: {
		borderLeftWidth: 1,
		borderRightWidth: 1,
	},
	panelFirst: {
		borderTopWidth: 1,
		borderTopLeftRadius: radii.card,
		borderTopRightRadius: radii.card,
	},
	panelLast: {
		borderBottomWidth: 1,
		borderBottomLeftRadius: radii.card,
		borderBottomRightRadius: radii.card,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 11,
		paddingHorizontal: 12,
		minHeight: 56,
	},
	skeletonTile: {
		width: 32,
		height: 32,
		borderRadius: 8,
	},
	skeletonBody: {
		flex: 1,
	},
	skeleton: {
		borderRadius: radii.sm,
	},
});
