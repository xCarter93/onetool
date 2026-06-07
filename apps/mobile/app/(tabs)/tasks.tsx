import {
	View,
	Text,
	SectionList,
	Pressable,
	RefreshControl,
	StyleSheet,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
	Plus,
	CheckSquare,
	AlertTriangle,
	Calendar,
	Clock,
} from "lucide-react-native";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";
import { TaskItem } from "@/components/TaskItem";
import { AppHeader } from "@/components/app-header";
import { Id } from "@onetool/backend/convex/_generated/dataModel";

interface TaskData {
	_id: string;
	title: string;
	date: number;
	startTime?: string;
	endTime?: string;
	status: "pending" | "in-progress" | "completed" | "cancelled";
	priority?: "low" | "medium" | "high" | "urgent";
	clientName?: string;
	projectName?: string;
}

interface Section {
	title: string;
	type: "overdue" | "today" | "upcoming" | "completed";
	data: TaskData[];
	icon: React.ReactNode;
	color: string;
}

export default function TasksScreen() {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const [updatingTasks, setUpdatingTasks] = useState<Set<string>>(new Set());

	const tasks = useQuery(api.tasks.list, {}) ?? [];
	const completeTask = useMutation(api.tasks.complete);
	const updateTask = useMutation(api.tasks.update);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	// Calculate date boundaries
	const today = useMemo(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	}, []);

	const tomorrow = useMemo(() => {
		const d = new Date(today);
		d.setDate(d.getDate() + 1);
		return d.getTime();
	}, [today]);

	// Group tasks into sections
	const sections = useMemo((): Section[] => {
		const overdue: TaskData[] = [];
		const todayTasks: TaskData[] = [];
		const upcoming: TaskData[] = [];
		const completed: TaskData[] = [];

		tasks.forEach((task: TaskData) => {
			if (task.status === "completed") {
				completed.push(task);
			} else if (task.date < today) {
				overdue.push(task);
			} else if (task.date >= today && task.date < tomorrow) {
				todayTasks.push(task);
			} else {
				upcoming.push(task);
			}
		});

		// Sort each section
		overdue.sort((a, b) => a.date - b.date);
		todayTasks.sort((a, b) => {
			if (a.startTime && b.startTime)
				return a.startTime.localeCompare(b.startTime);
			return 0;
		});
		upcoming.sort((a, b) => a.date - b.date);
		completed.sort((a, b) => b.date - a.date);

		const result: Section[] = [];

		if (overdue.length > 0) {
			result.push({
				title: "Overdue",
				type: "overdue",
				data: overdue,
				icon: <AlertTriangle size={16} color="#dc2626" />,
				color: "#dc2626",
			});
		}

		if (todayTasks.length > 0) {
			result.push({
				title: "Today",
				type: "today",
				data: todayTasks,
				icon: <Calendar size={16} color={colors.primary} />,
				color: colors.primary,
			});
		}

		if (upcoming.length > 0) {
			result.push({
				title: "Upcoming",
				type: "upcoming",
				data: upcoming,
				icon: <Clock size={16} color="#8b5cf6" />,
				color: "#8b5cf6",
			});
		}

		if (completed.length > 0) {
			result.push({
				title: "Completed",
				type: "completed",
				data: completed.slice(0, 10), // Only show last 10 completed
				icon: <CheckSquare size={16} color="#10b981" />,
				color: "#10b981",
			});
		}

		return result;
	}, [tasks, today, tomorrow]);

	const handleToggleTask = async (taskId: string) => {
		setUpdatingTasks((prev) => new Set(prev).add(taskId));
		try {
			const task = tasks.find((t: TaskData) => t._id === taskId);
			if (task) {
				if (task.status === "completed") {
					await updateTask({ id: taskId as Id<"tasks">, status: "pending" });
				} else {
					await completeTask({ id: taskId as Id<"tasks"> });
				}
			}
		} catch (error) {
			console.error("Failed to update task:", error);
		} finally {
			setUpdatingTasks((prev) => {
				const newSet = new Set(prev);
				newSet.delete(taskId);
				return newSet;
			});
		}
	};

	const renderTask = ({ item }: { item: TaskData }) => (
		<TaskItem
			id={item._id}
			title={item.title}
			date={item.date}
			startTime={item.startTime}
			endTime={item.endTime}
			status={item.status}
			priority={item.priority}
			clientName={item.clientName}
			projectName={item.projectName}
			isUpdating={updatingTasks.has(item._id)}
			onToggleComplete={handleToggleTask}
		/>
	);

	const renderSectionHeader = ({ section }: { section: Section }) => (
		<View style={[styles.sectionHeader, { borderLeftColor: section.color }]}>
			<View
				style={[styles.sectionIcon, { backgroundColor: `${section.color}15` }]}
			>
				{section.icon}
			</View>
			<Text style={styles.sectionTitle}>{section.title}</Text>
			<View
				style={[styles.sectionCount, { backgroundColor: `${section.color}15` }]}
			>
				<Text style={[styles.sectionCountText, { color: section.color }]}>
					{section.data.length}
				</Text>
			</View>
		</View>
	);

	// Calculate stats
	const overdueCount =
		sections.find((s) => s.type === "overdue")?.data.length ?? 0;
	const todayCount = sections.find((s) => s.type === "today")?.data.length ?? 0;
	const totalPending = tasks.filter(
		(t: TaskData) => t.status !== "completed"
	).length;

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={["bottom"]}
		>
			<AppHeader mode="root" title="Tasks" />
			{/* Header Stats */}
			{tasks.length > 0 && (
				<View style={styles.statsBar}>
					<View style={styles.statItem}>
						<Text style={styles.statValue}>{totalPending}</Text>
						<Text style={styles.statLabel}>Pending</Text>
					</View>
					{overdueCount > 0 && (
						<>
							<View style={styles.statDivider} />
							<View style={styles.statItem}>
								<Text style={[styles.statValue, { color: colors.danger }]}>
									{overdueCount}
								</Text>
								<Text style={styles.statLabel}>Overdue</Text>
							</View>
						</>
					)}
					<View style={styles.statDivider} />
					<View style={styles.statItem}>
						<Text style={[styles.statValue, { color: colors.primary }]}>
							{todayCount}
						</Text>
						<Text style={styles.statLabel}>Today</Text>
					</View>
				</View>
			)}

			<SectionList
				sections={sections}
				keyExtractor={(item) => item._id}
				renderItem={renderTask}
				renderSectionHeader={renderSectionHeader}
				contentContainerStyle={styles.listContent}
				stickySectionHeadersEnabled={false}
				ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
				SectionSeparatorComponent={() => (
					<View style={{ height: spacing.lg }} />
				)}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				ListEmptyComponent={
					<View style={styles.emptyState}>
						<View style={styles.emptyIcon}>
							<CheckSquare size={32} color={colors.mutedForeground} />
						</View>
						<Text style={styles.emptyTitle}>No tasks yet</Text>
						<Text style={styles.emptyText}>
							Create your first task to get started
						</Text>
						<Pressable
							style={styles.emptyButton}
							onPress={() => router.push("/tasks/new")}
						>
							<Plus size={18} color={colors.primary} />
							<Text style={styles.emptyButtonText}>Add Task</Text>
						</Pressable>
					</View>
				}
			/>

			{/* FAB */}
			<Pressable
				style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
				onPress={() => router.push("/tasks/new")}
			>
				<Plus size={24} color="#ffffff" />
			</Pressable>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	statsBar: {
		flexDirection: "row",
		backgroundColor: colors.card,
		marginHorizontal: spacing.md,
		marginTop: spacing.md,
		padding: spacing.md,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: colors.border,
	},
	statItem: {
		flex: 1,
		alignItems: "center",
	},
	statValue: {
		fontSize: 20,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
	},
	statLabel: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 2,
	},
	statDivider: {
		width: 1,
		backgroundColor: colors.border,
		marginHorizontal: spacing.sm,
	},
	listContent: {
		padding: spacing.md,
		paddingBottom: 100,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.muted,
		borderRadius: radius.md,
		padding: spacing.sm,
		borderLeftWidth: 3,
		marginBottom: spacing.sm,
	},
	sectionIcon: {
		width: 28,
		height: 28,
		borderRadius: radius.sm,
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	sectionTitle: {
		flex: 1,
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	sectionCount: {
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: radius.full,
	},
	sectionCountText: {
		fontSize: 12,
		fontFamily: fontFamily.bold,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: spacing.xl * 2,
	},
	emptyIcon: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: colors.muted,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	emptyTitle: {
		fontSize: 18,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	emptyText: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	emptyButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		backgroundColor: "rgba(0, 166, 244, 0.1)",
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: `${colors.primary}30`,
	},
	emptyButtonText: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.primary,
	},
	fab: {
		position: "absolute",
		bottom: 24,
		right: 24,
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},
	fabPressed: {
		opacity: 0.8,
	},
});
