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
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Calendar, X } from "lucide-react-native";
import { fontFamily, radii, shadow, useTokens } from "@/lib/theme";
import { Badge, Eyebrow } from "@/components/ui";
import { AppHeader } from "@/components/app-header";

type Project = Doc<"projects">;
type FilterValue = "all" | "active" | "in-progress" | "completed";

function formatDate(timestamp: number | undefined): string | null {
	if (!timestamp) return null;
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

export default function ProjectsScreen() {
	const router = useRouter();
	const t = useTokens();
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

		return (
			<Pressable
				style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
				onPress={() => router.push(`/projects/${item._id}`)}
			>
				<View style={styles.cardTop}>
					<View style={styles.cardTitleCol}>
						<Eyebrow>#{item.projectNumber}</Eyebrow>
						<Text style={styles.title} numberOfLines={1}>
							{item.title}
						</Text>
						<Text style={styles.client} numberOfLines={1}>
							{clientName(item)}
						</Text>
					</View>
					<Badge status={item.status} />
				</View>
				{range && (
					<View style={styles.metaRow}>
						<Calendar size={14} color={t.faint} />
						<Text style={styles.metaText}>{range}</Text>
					</View>
				)}
			</Pressable>
		);
	};

	const ListHeader = (
		<View style={styles.listHeader}>
			<View style={styles.searchBar}>
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
									{ color: active ? "#fff" : t.sub },
								]}
							>
								{chip.label}
							</Text>
							<Text
								style={[
									styles.chipCount,
									{ color: active ? "#fff" : t.faint },
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
			edges={["bottom"]}
		>
			<AppHeader mode="detail" title="Work" />

			{loading ? (
				<View style={styles.listContent}>
					{ListHeader}
					{[0, 1, 2, 3].map((i) => (
						<View key={i} style={[styles.card, styles.skeletonCard]}>
							<View style={[styles.skeleton, { width: 48, height: 11 }]} />
							<View
								style={[styles.skeleton, { width: "70%", height: 16, marginTop: 8 }]}
							/>
							<View
								style={[styles.skeleton, { width: "45%", height: 13, marginTop: 6 }]}
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
					contentContainerStyle={styles.listContent}
					ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							{allProjects.length === 0 ? (
								<>
									<Text style={styles.emptyTitle}>No work yet</Text>
									<Text style={styles.emptyText}>
										Projects you create will show up here.
									</Text>
								</>
							) : (
								<Text style={styles.emptyText}>
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
		paddingBottom: 120,
		paddingTop: 8,
	},
	listHeader: {
		gap: 12,
		paddingBottom: 12,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e9edf2",
		borderRadius: 15,
		paddingHorizontal: 14,
		height: 46,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 15,
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
		borderRadius: 999,
		borderWidth: 1,
	},
	chipLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 13.5,
	},
	chipCount: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	card: {
		backgroundColor: "#fff",
		borderRadius: radii.rLg,
		borderWidth: 1,
		borderColor: "#e9edf2",
		boxShadow: shadow.card,
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
		fontSize: 16,
		color: "#09090b",
		marginTop: 2,
	},
	client: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
		color: "#5b6675",
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
		fontSize: 12.5,
		color: "#5b6675",
	},
	skeletonCard: {
		marginBottom: 12,
	},
	skeleton: {
		backgroundColor: "#e9edf2",
		borderRadius: 6,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 20,
		color: "#09090b",
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
		color: "#5b6675",
		textAlign: "center",
	},
});
