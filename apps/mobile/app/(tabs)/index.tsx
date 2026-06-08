import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	Pressable,
	StyleSheet,
	Modal,
	TouchableOpacity,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";
import {
	Users,
	FolderKanban,
	CheckSquare,
	Plus,
	ChevronRight,
	TrendingUp,
	TrendingDown,
	AlertCircle,
	Target,
	X,
} from "lucide-react-native";
import { ProgressRing } from "@/components/ProgressRing";
import { TaskItem } from "@/components/TaskItem";
import { JourneyProgress } from "@/components/JourneyProgress";
import {
	AppCalendar,
	toDateId,
	fromDateId,
	CalendarTask,
	CalendarProject,
} from "@/components/AppCalendar";
import { useViewMode } from "@/lib/useViewMode";
import { AppHeader } from "@/components/app-header";
import { Id } from "@onetool/backend/convex/_generated/dataModel";

export default function HomeScreen() {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const { viewMode, setViewMode, hydrated } = useViewMode();
	const [selectedDate, setSelectedDate] = useState<string>(
		toDateId(new Date())
	);
	// Track the currently displayed month separately for data fetching
	const [displayedMonth, setDisplayedMonth] = useState<string>(
		toDateId(new Date())
	);
	const [showDateModal, setShowDateModal] = useState(false);
	const [updatingTasks, setUpdatingTasks] = useState<Set<string>>(new Set());

	const user = useQuery(api.users.current);
	const homeStats = useQuery(api.homeStatsOptimized.getHomeStats, {});
	const taskStats = useQuery(api.tasks.getStats, {});
	const upcomingTasks = useQuery(api.tasks.getUpcoming, { daysAhead: 7 });
	const overdueTasks = useQuery(api.tasks.getOverdue, {});

	// Query clients and projects for stat cards
	const allClients = useQuery(api.clients.list, {});
	const allProjects = useQuery(api.projects.list, {});

	// Fetch calendar events for a 3-month range based on displayed month.
	// Hydration-gated skip (Pitfall 4): a calendar-first persisted user must not
	// see a dashboard flash, and the query must not fire in dashboard view.
	const calendarEvents = useQuery(
		api.calendar.getCalendarEvents,
		!hydrated || viewMode !== "calendar"
			? "skip"
			: {
					startDate: (() => {
						const date = fromDateId(displayedMonth);
						// Start from first day of previous month
						const firstDay = new Date(
							date.getFullYear(),
							date.getMonth() - 1,
							1
						);
						firstDay.setHours(0, 0, 0, 0);
						return firstDay.getTime();
					})(),
					endDate: (() => {
						const date = fromDateId(displayedMonth);
						// End at last day of next month
						const lastDay = new Date(
							date.getFullYear(),
							date.getMonth() + 2,
							0
						);
						lastDay.setHours(23, 59, 59, 999);
						return lastDay.getTime();
					})(),
				}
	);

	const completeTask = useMutation(api.tasks.complete);
	const updateTask = useMutation(api.tasks.update);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}).format(amount);
	};

	const getTimeBasedGreeting = () => {
		const hour = new Date().getHours();
		if (hour < 12) return "Good morning";
		if (hour < 17) return "Good afternoon";
		return "Good evening";
	};

	// Combine and dedupe tasks for display
	const allTasks = useMemo(() => {
		const combined = [...(overdueTasks || []), ...(upcomingTasks || [])];
		const uniqueTasks = combined.filter(
			(task, index, self) => self.findIndex((t) => t._id === task._id) === index
		);
		return uniqueTasks.slice(0, 5);
	}, [overdueTasks, upcomingTasks]);

	const handleToggleTask = async (taskId: string) => {
		setUpdatingTasks((prev) => new Set(prev).add(taskId));
		try {
			const task = allTasks.find((t) => t._id === taskId);
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

	const overdueCount = overdueTasks?.length ?? 0;
	const todayTasksCount = taskStats?.todayTasks ?? 0;

	// Calculate client stats
	const totalClients = allClients?.length ?? 0;
	const activeClients =
		allClients?.filter((c) => c.status === "active").length ?? 0;
	const inactiveClients =
		allClients?.filter((c) => c.status === "inactive").length ?? 0;
	const leadClients =
		allClients?.filter((c) => c.status === "lead").length ?? 0;

	// Calculate project stats
	const activeProjects =
		allProjects?.filter(
			(p) => p.status === "planned" || p.status === "in-progress"
		).length ?? 0;
	const plannedProjects =
		allProjects?.filter((p) => p.status === "planned").length ?? 0;
	const inProgressProjects =
		allProjects?.filter((p) => p.status === "in-progress").length ?? 0;

	// Get events for the selected date
	const selectedDateEvents = useMemo(() => {
		if (!calendarEvents) return { tasks: [], projects: [] };

		// Use Flash Calendar's fromDateId utility
		const selectedDay = fromDateId(selectedDate);
		selectedDay.setHours(0, 0, 0, 0);
		const selectedTimestamp = selectedDay.getTime();
		const nextDay = new Date(selectedDay);
		nextDay.setDate(nextDay.getDate() + 1);
		const nextDayTimestamp = nextDay.getTime();

		// Filter tasks for the selected date
		const tasksForDate = calendarEvents.tasks.filter((task) => {
			return (
				task.startDate >= selectedTimestamp && task.startDate < nextDayTimestamp
			);
		});

		// Filter projects that are active on the selected date
		const projectsForDate = calendarEvents.projects.filter((project) => {
			const projectEnd = project.endDate || project.startDate;
			return (
				project.startDate <= selectedTimestamp &&
				projectEnd >= selectedTimestamp
			);
		});

		return {
			tasks: tasksForDate,
			projects: projectsForDate,
		};
	}, [calendarEvents, selectedDate]);

	// Format calendar tasks for marking
	const calendarTasks: CalendarTask[] = useMemo(() => {
		if (!calendarEvents) return [];

		return calendarEvents.tasks.map((task) => ({
			id: task.id,
			date: toDateId(new Date(task.startDate)),
			title: task.title,
			color: colors.primary,
		}));
	}, [calendarEvents]);

	// Format calendar projects for period marking
	const calendarProjects: CalendarProject[] = useMemo(() => {
		if (!calendarEvents) return [];

		return calendarEvents.projects.map((project) => ({
			id: project.id,
			startDate: toDateId(new Date(project.startDate)),
			endDate: toDateId(new Date(project.endDate || project.startDate)),
			title: project.title,
			status: project.status as "in_progress" | "completed" | "not_started",
		}));
	}, [calendarEvents]);

	// Handle date selection - show modal with events
	const handleDateSelect = useCallback((dateId: string) => {
		setSelectedDate(dateId);
		setShowDateModal(true);
	}, []);

	// Handle month navigation - update the displayed month for data fetching
	const handleMonthChange = useCallback((monthDateId: string) => {
		setDisplayedMonth(monthDateId);
	}, []);

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={["bottom"]}
		>
			<AppHeader mode="root" home />
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Header Section */}
				<View style={styles.headerSection}>
					<Text style={styles.greeting}>
						{getTimeBasedGreeting()}
						{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
					</Text>
				</View>

				{/* Journey Progress */}
				<JourneyProgress />

				{/* View Toggle - Below Journey Progress */}
				<View style={styles.viewToggleContainer}>
					<ViewToggle value={viewMode} onChange={setViewMode} />
				</View>

				{viewMode === "dashboard" ? (
					<>
						{/* Quick Stats Row */}
						<View style={styles.statsRow}>
							<Pressable
								style={styles.statCardWide}
								onPress={() => router.push("/clients")}
							>
								<View style={styles.statTopRow}>
									<View style={styles.statIconContainer}>
										<Users size={18} color={colors.primary} />
									</View>
									<View style={styles.statValueContainer}>
										<Text style={styles.statLabel}>Total Clients</Text>
										<Text style={styles.statValue}>{totalClients}</Text>
									</View>
								</View>
								<View style={styles.statBreakdownRow}>
									<Text style={styles.statBreakdownItem}>
										<Text
											style={[
												styles.statBreakdownNumber,
												{ color: colors.success },
											]}
										>
											{activeClients}
										</Text>{" "}
										<Text style={styles.statBreakdownLabel}>Active</Text>
									</Text>
									<Text style={styles.statBreakdownSeparator}> · </Text>
									<Text style={styles.statBreakdownItem}>
										<Text
											style={[
												styles.statBreakdownNumber,
												{ color: colors.mutedForeground },
											]}
										>
											{inactiveClients}
										</Text>{" "}
										<Text style={styles.statBreakdownLabel}>Inactive</Text>
									</Text>
									{leadClients > 0 && (
										<>
											<Text style={styles.statBreakdownSeparator}> · </Text>
											<Text style={styles.statBreakdownItem}>
												<Text
													style={[
														styles.statBreakdownNumber,
														{ color: colors.primary },
													]}
												>
													{leadClients}
												</Text>{" "}
												<Text style={styles.statBreakdownLabel}>Leads</Text>
											</Text>
										</>
									)}
								</View>
							</Pressable>

							<Pressable
								style={styles.statCardWide}
								onPress={() => router.push("/projects")}
							>
								<View style={styles.statTopRow}>
									<View style={styles.statIconContainer}>
										<FolderKanban size={18} color={colors.primary} />
									</View>
									<View style={styles.statValueContainer}>
										<Text style={styles.statLabel}>Active Projects</Text>
										<Text style={styles.statValue}>{activeProjects}</Text>
									</View>
								</View>
								<View style={styles.statBreakdownRow}>
									<Text style={styles.statBreakdownItem}>
										<Text
											style={[styles.statBreakdownNumber, { color: "#3b82f6" }]}
										>
											{plannedProjects}
										</Text>{" "}
										<Text style={styles.statBreakdownLabel}>Planned</Text>
									</Text>
									<Text style={styles.statBreakdownSeparator}> · </Text>
									<Text style={styles.statBreakdownItem}>
										<Text
											style={[styles.statBreakdownNumber, { color: "#f59e0b" }]}
										>
											{inProgressProjects}
										</Text>{" "}
										<Text style={styles.statBreakdownLabel}>In Progress</Text>
									</Text>
								</View>
							</Pressable>
						</View>

						{/* Overdue Warning */}
						{overdueCount > 0 && (
							<Pressable
								style={styles.alertCard}
								onPress={() => router.push("/tasks")}
							>
								<View style={styles.alertIcon}>
									<AlertCircle size={18} color={colors.danger} />
								</View>
								<View style={styles.alertContent}>
									<Text style={styles.alertTitle}>
										{overdueCount} Overdue Task{overdueCount !== 1 ? "s" : ""}
									</Text>
									<Text style={styles.alertText}>Tap to view and complete</Text>
								</View>
								<ChevronRight size={18} color={colors.danger} />
							</Pressable>
						)}

						{/* Revenue Goal Progress */}
						{homeStats && homeStats.revenueGoal.target > 0 && (
							<View style={styles.revenueCard}>
								<View style={styles.revenueHeader}>
									<View style={styles.revenueIconContainer}>
										<Target size={18} color={colors.primary} />
									</View>
									<View style={styles.revenueInfo}>
										<Text style={styles.revenueTitle}>
											Monthly Revenue Goal
										</Text>
										<Text style={styles.revenueSubtitle}>
											{Math.round(homeStats.revenueGoal.percentage)}% complete
										</Text>
									</View>
								</View>
								<View style={styles.revenueProgressRow}>
									<ProgressRing
										percentage={homeStats.revenueGoal.percentage}
										size={100}
										strokeWidth={10}
										color={colors.primary}
									/>
									<View style={styles.revenueStatsColumn}>
										<View style={styles.revenueStatLarge}>
											<Text style={styles.revenueStatLabelLarge}>Earned</Text>
											<Text style={styles.revenueStatValueLarge}>
												{formatCurrency(homeStats.revenueGoal.current)}
											</Text>
										</View>
										<View style={styles.revenueStatLarge}>
											<Text style={styles.revenueStatLabelLarge}>Target</Text>
											<Text style={styles.revenueStatValueLarge}>
												{formatCurrency(homeStats.revenueGoal.target)}
											</Text>
										</View>
										<View style={styles.revenueStatLarge}>
											<Text style={styles.revenueStatLabelLarge}>
												Remaining
											</Text>
											<Text
												style={[
													styles.revenueStatValueLarge,
													{ color: colors.mutedForeground },
												]}
											>
												{formatCurrency(
													homeStats.revenueGoal.target -
														homeStats.revenueGoal.current
												)}
											</Text>
										</View>
									</View>
								</View>
							</View>
						)}

						{/* Tasks Section */}
						<View style={styles.section}>
							<View style={styles.sectionHeader}>
								<Text style={styles.sectionTitle}>Your Tasks</Text>
								<Pressable
									onPress={() => router.push("/tasks")}
									style={styles.sectionAction}
								>
									<Text style={styles.sectionActionText}>View All</Text>
									<ChevronRight size={16} color={colors.primary} />
								</Pressable>
							</View>

							{allTasks.length > 0 ? (
								<View style={styles.tasksList}>
									{allTasks.map((task) => (
										<TaskItem
											key={task._id}
											id={task._id}
											title={task.title}
											date={task.date}
											startTime={task.startTime}
											endTime={task.endTime}
											status={task.status}
											isUpdating={updatingTasks.has(task._id)}
											onToggleComplete={handleToggleTask}
										/>
									))}
								</View>
							) : (
								<View style={styles.emptyState}>
									<CheckSquare size={28} color={colors.mutedForeground} />
									<Text style={styles.emptyTitle}>No upcoming tasks</Text>
									<Text style={styles.emptyText}>You're all caught up!</Text>
								</View>
							)}
						</View>
					</>
				) : (
					/* Calendar View */
					<View style={styles.calendarSection}>
						<AppCalendar
							selectedDate={selectedDate}
							onDateSelect={handleDateSelect}
							onMonthChange={handleMonthChange}
							tasks={calendarTasks}
							projects={calendarProjects}
						/>
					</View>
				)}
			</ScrollView>

			{/* Date Events Modal */}
			<Modal
				visible={showDateModal}
				transparent
				animationType="slide"
				onRequestClose={() => setShowDateModal(false)}
			>
				<TouchableOpacity
					style={styles.modalBackdrop}
					activeOpacity={1}
					onPress={() => setShowDateModal(false)}
				>
					<Pressable
						style={styles.modalContent}
						onPress={(e) => e.stopPropagation()}
					>
						{/* Modal Header */}
						<View style={styles.modalHeader}>
							<View style={styles.modalHandleBar} />
							<View style={styles.modalTitleContainer}>
								<Text style={styles.modalTitle}>
									{fromDateId(selectedDate).toLocaleDateString("en-US", {
										weekday: "long",
										month: "long",
										day: "numeric",
									})}
								</Text>
								<TouchableOpacity
									onPress={() => setShowDateModal(false)}
									style={styles.modalCloseButton}
								>
									<X size={24} color={colors.foreground} />
								</TouchableOpacity>
							</View>
						</View>

						{/* Modal Content */}
						<ScrollView style={styles.modalScrollView}>
							{/* Projects for this date */}
							{selectedDateEvents.projects.length > 0 && (
								<View style={styles.modalSection}>
									<Text style={styles.modalSectionTitle}>Projects</Text>
									{selectedDateEvents.projects.map((project) => (
										<Pressable
											key={project.id}
											style={styles.modalEventCard}
											onPress={() => {
												setShowDateModal(false);
												router.push(`/projects/${project.id}`);
											}}
										>
											<View style={styles.modalEventIcon}>
												<FolderKanban size={18} color={colors.primary} />
											</View>
											<View style={styles.modalEventContent}>
												<Text style={styles.modalEventTitle}>
													{project.title}
												</Text>
												<Text style={styles.modalEventSubtitle}>
													{project.clientName}
												</Text>
												{project.startDate && project.endDate && (
													<Text style={styles.modalEventMeta}>
														{new Date(project.startDate).toLocaleDateString()} -{" "}
														{new Date(project.endDate).toLocaleDateString()}
													</Text>
												)}
											</View>
											<ChevronRight size={18} color={colors.border} />
										</Pressable>
									))}
								</View>
							)}

							{/* Tasks for this date */}
							{selectedDateEvents.tasks.length > 0 && (
								<View style={styles.modalSection}>
									<Text style={styles.modalSectionTitle}>Tasks</Text>
									{selectedDateEvents.tasks.map((task) => (
										<Pressable
											key={task.id}
											style={styles.modalEventCard}
											onPress={() => {
												setShowDateModal(false);
												router.push(`/tasks`);
											}}
										>
											<View style={styles.modalEventIcon}>
												<CheckSquare size={18} color={colors.primary} />
											</View>
											<View style={styles.modalEventContent}>
												<Text style={styles.modalEventTitle}>{task.title}</Text>
												<Text style={styles.modalEventSubtitle}>
													{task.clientName}
												</Text>
												{task.startTime && (
													<Text style={styles.modalEventMeta}>
														{task.startTime}
														{task.endTime && ` - ${task.endTime}`}
													</Text>
												)}
											</View>
											<ChevronRight size={18} color={colors.border} />
										</Pressable>
									))}
								</View>
							)}

							{/* Empty State */}
							{selectedDateEvents.projects.length === 0 &&
								selectedDateEvents.tasks.length === 0 && (
									<View style={styles.modalEmptyState}>
										<View style={styles.modalEmptyIcon}>
											<CheckSquare size={28} color={colors.mutedForeground} />
										</View>
										<Text style={styles.modalEmptyTitle}>
											Nothing scheduled
										</Text>
										<Text style={styles.modalEmptyText}>
											No tasks or projects for this day
										</Text>
									</View>
								)}
						</ScrollView>
					</Pressable>
				</TouchableOpacity>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	headerSection: {
		marginBottom: spacing.md,
	},
	greeting: {
		fontSize: 26,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
	},
	viewToggleContainer: {
		alignItems: "center",
		marginBottom: spacing.lg,
		marginTop: spacing.sm,
	},
	statsRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginBottom: spacing.md,
	},
	statCard: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
	},
	statCardWide: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
		minHeight: 110,
	},
	statTopRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		marginBottom: spacing.sm,
	},
	statIconContainer: {
		width: 36,
		height: 36,
		borderRadius: radius.md,
		backgroundColor: "rgba(0, 166, 244, 0.1)",
		alignItems: "center",
		justifyContent: "center",
	},
	statValueContainer: {
		flex: 1,
		alignItems: "center",
	},
	statContent: {},
	statLabel: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		textAlign: "center",
		marginBottom: 2,
	},
	statValue: {
		fontSize: 28,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
		lineHeight: 32,
	},
	statBreakdownRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
	},
	statBreakdownItem: {
		flexDirection: "row",
		alignItems: "baseline",
	},
	statBreakdownNumber: {
		fontSize: 13,
		fontFamily: fontFamily.bold,
	},
	statBreakdownLabel: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	statBreakdownSeparator: {
		fontSize: 11,
		color: colors.mutedForeground,
	},
	statChange: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: spacing.xs,
		flexWrap: "wrap",
	},
	statChangeText: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
	},
	alertCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#fef2f2",
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: "#fecaca",
		marginBottom: spacing.md,
	},
	alertIcon: {
		marginRight: spacing.sm,
	},
	alertContent: {
		flex: 1,
	},
	alertTitle: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.danger,
	},
	alertText: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: "#991b1b",
	},
	revenueCard: {
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
		marginBottom: spacing.md,
	},
	revenueHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: spacing.md,
	},
	revenueIconContainer: {
		width: 36,
		height: 36,
		borderRadius: radius.md,
		backgroundColor: "rgba(0, 166, 244, 0.1)",
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	revenueInfo: {
		flex: 1,
	},
	revenueTitle: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	revenueSubtitle: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	revenueProgressRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	revenueStatsColumn: {
		flex: 1,
		gap: spacing.sm,
	},
	revenueStatLarge: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	revenueStatLabelLarge: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
	},
	revenueStatValueLarge: {
		fontSize: 16,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
	},
	section: {
		marginBottom: spacing.md,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: spacing.sm,
	},
	sectionTitle: {
		fontSize: 17,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	sectionAction: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	sectionActionText: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		color: colors.primary,
	},
	tasksList: {
		gap: spacing.sm,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: spacing.xl,
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: colors.border,
	},
	emptyTitle: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginTop: spacing.sm,
	},
	emptyText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: spacing.xs,
	},
	calendarSection: {
		gap: spacing.md,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "flex-end",
	},
	modalContent: {
		backgroundColor: colors.background,
		borderTopLeftRadius: radius.xl,
		borderTopRightRadius: radius.xl,
		maxHeight: "80%",
		paddingBottom: spacing.xl,
	},
	modalHeader: {
		paddingTop: spacing.sm,
		paddingHorizontal: spacing.md,
		paddingBottom: spacing.md,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	modalHandleBar: {
		width: 40,
		height: 4,
		backgroundColor: colors.muted,
		borderRadius: radius.full,
		alignSelf: "center",
		marginBottom: spacing.md,
	},
	modalTitleContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	modalTitle: {
		fontSize: 18,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	modalCloseButton: {
		padding: spacing.xs,
	},
	modalScrollView: {
		maxHeight: "100%",
	},
	modalSection: {
		padding: spacing.md,
	},
	modalSectionTitle: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.mutedForeground,
		textTransform: "uppercase",
		letterSpacing: 0.5,
		marginBottom: spacing.sm,
	},
	modalEventCard: {
		flexDirection: "row",
		alignItems: "center",
		padding: spacing.sm,
		backgroundColor: colors.card,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		marginBottom: spacing.sm,
	},
	modalEventIcon: {
		width: 36,
		height: 36,
		borderRadius: radius.md,
		backgroundColor: "rgba(0, 166, 244, 0.1)",
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	modalEventContent: {
		flex: 1,
	},
	modalEventTitle: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: 2,
	},
	modalEventSubtitle: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginBottom: 2,
	},
	modalEventMeta: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	modalEmptyState: {
		alignItems: "center",
		paddingVertical: spacing.xl * 2,
		paddingHorizontal: spacing.lg,
	},
	modalEmptyIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.muted,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	modalEmptyTitle: {
		fontSize: 16,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	modalEmptyText: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		textAlign: "center",
	},
});
