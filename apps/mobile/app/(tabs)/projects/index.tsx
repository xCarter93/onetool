import {
	View,
	Text,
	Pressable,
	RefreshControl,
	TextInput,
	StyleSheet,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	Search,
	ChevronRight,
	Calendar,
	FolderKanban,
	X,
} from "lucide-react-native";
import { colors, fontFamily, radius, spacing } from "@/lib/theme";
import { FABMenu } from "@/components/FABMenu";
import { AppHeader } from "@/components/app-header";

// Status config using consistent colors
const statusConfig = {
	planned: { label: "Planned", color: colors.primary },
	"in-progress": { label: "In Progress", color: "#f59e0b" },
	completed: { label: "Completed", color: colors.success },
	cancelled: { label: "Cancelled", color: colors.danger },
} as const;

export default function ProjectsScreen() {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const projects = useQuery(api.projects.list, {}) ?? [];

	const filteredProjects = useMemo(() => {
		if (!searchQuery.trim()) return projects;
		const query = searchQuery.toLowerCase();
		return projects.filter(
			(project) =>
				project.title.toLowerCase().includes(query) ||
				project.projectNumber?.toString().includes(query)
		);
	}, [projects, searchQuery]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	const formatDate = (timestamp: number | undefined) => {
		if (!timestamp) return null;
		return new Date(timestamp).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	const renderProject = ({ item }: { item: (typeof projects)[0] }) => {
		const status = statusConfig[item.status as keyof typeof statusConfig] || {
			label: item.status,
			color: colors.mutedForeground,
		};

		return (
			<Pressable
				style={({ pressed }) => [
					styles.projectRow,
					pressed && styles.projectRowPressed,
				]}
				onPress={() => router.push(`/projects/${item._id}`)}
			>
				{/* Icon */}
				<View style={styles.projectIcon}>
					<FolderKanban size={18} color={colors.primary} />
				</View>

				{/* Project Info */}
				<View style={styles.projectInfo}>
					<View style={styles.projectHeader}>
						<Text style={styles.projectTitle} numberOfLines={1}>
							{item.title}
						</Text>
						{item.projectNumber && (
							<Text style={styles.projectNumber}>#{item.projectNumber}</Text>
						)}
					</View>
					<View style={styles.projectMeta}>
						{(item.startDate || item.endDate) && (
							<View style={styles.metaItem}>
								<Calendar size={11} color={colors.mutedForeground} />
								<Text style={styles.metaText}>
									{item.startDate && formatDate(item.startDate)}
									{item.startDate && item.endDate && " → "}
									{item.endDate && formatDate(item.endDate)}
								</Text>
							</View>
						)}
						<View
							style={[styles.statusDot, { backgroundColor: status.color }]}
						/>
						<Text style={[styles.statusText, { color: status.color }]}>
							{status.label}
						</Text>
					</View>
				</View>

				<ChevronRight size={18} color={colors.border} />
			</Pressable>
		);
	};

	// Count projects by status
	const statusCounts = useMemo(() => {
		return {
			inProgress: projects.filter((p) => p.status === "in-progress").length,
			completed: projects.filter((p) => p.status === "completed").length,
		};
	}, [projects]);

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={["bottom"]}
		>
			<AppHeader mode="detail" title="Work" />
			{/* Search Bar */}
			<View style={styles.searchContainer}>
				<View style={styles.searchBar}>
					<Search size={18} color={colors.mutedForeground} />
					<TextInput
						style={styles.searchInput}
						placeholder="Search projects..."
						placeholderTextColor={colors.mutedForeground}
						value={searchQuery}
						onChangeText={setSearchQuery}
					/>
					{searchQuery.length > 0 && (
						<Pressable
							onPress={() => setSearchQuery("")}
							style={styles.clearButton}
						>
							<X size={16} color={colors.mutedForeground} />
						</Pressable>
					)}
				</View>

				{searchQuery && (
					<Text style={styles.resultsCount}>
						{filteredProjects.length} result
						{filteredProjects.length !== 1 ? "s" : ""}
					</Text>
				)}
			</View>

			{/* Summary Bar */}
			<View style={styles.summaryBar}>
				<Text style={styles.summaryText}>
					{projects.length} total project{projects.length !== 1 ? "s" : ""}
				</Text>
				<View style={styles.summaryStats}>
					<View style={styles.summaryStatItem}>
						<View style={[styles.summaryDot, { backgroundColor: "#f59e0b" }]} />
						<Text style={styles.summaryStatText}>
							{statusCounts.inProgress} active
						</Text>
					</View>
					<View style={styles.summaryStatItem}>
						<View
							style={[styles.summaryDot, { backgroundColor: colors.success }]}
						/>
						<Text style={styles.summaryStatText}>
							{statusCounts.completed} done
						</Text>
					</View>
				</View>
			</View>

			<FlashList
				data={filteredProjects}
				keyExtractor={(item) => item._id}
				renderItem={renderProject}
				contentContainerStyle={styles.listContent}
				ItemSeparatorComponent={() => <View style={styles.separator} />}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				ListEmptyComponent={
					<View style={styles.emptyState}>
						<View style={styles.emptyIcon}>
							<FolderKanban size={28} color={colors.mutedForeground} />
						</View>
						<Text style={styles.emptyTitle}>
							{searchQuery ? "No projects found" : "No projects yet"}
						</Text>
						<Text style={styles.emptyText}>
							{searchQuery
								? "Try adjusting your search"
								: "Create your first project to get started"}
						</Text>
					</View>
				}
			/>

			{/* FAB Menu */}
			<FABMenu />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	searchContainer: {
		paddingHorizontal: spacing.md,
		paddingTop: spacing.sm,
		paddingBottom: spacing.xs,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.muted,
		borderRadius: radius.lg,
		paddingHorizontal: spacing.sm,
		height: 44,
	},
	searchInput: {
		flex: 1,
		paddingHorizontal: spacing.sm,
		fontSize: 15,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},
	clearButton: {
		padding: spacing.xs,
	},
	resultsCount: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
		marginTop: spacing.xs,
		marginLeft: spacing.xs,
	},
	summaryBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	summaryText: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
	},
	summaryStats: {
		flexDirection: "row",
		gap: spacing.md,
	},
	summaryStatItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	summaryDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	summaryStatText: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
	},
	listContent: {
		paddingBottom: 100,
	},
	projectRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
		backgroundColor: colors.background,
	},
	projectRowPressed: {
		backgroundColor: colors.muted,
	},
	separator: {
		height: 1,
		backgroundColor: colors.border,
		marginLeft: 44 + spacing.md,
	},
	projectIcon: {
		width: 44,
		height: 44,
		borderRadius: radius.md,
		backgroundColor: "rgba(0, 166, 244, 0.1)",
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	projectInfo: {
		flex: 1,
		marginRight: spacing.sm,
	},
	projectHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginBottom: 2,
	},
	projectTitle: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		flex: 1,
	},
	projectNumber: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	projectMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	metaItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		flex: 1,
	},
	metaText: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	statusDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	statusText: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: spacing.xl * 2,
		paddingHorizontal: spacing.lg,
	},
	emptyIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.muted,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	emptyTitle: {
		fontSize: 16,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	emptyText: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		textAlign: "center",
	},
});
