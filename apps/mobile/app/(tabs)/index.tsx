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
import { colors, fontFamily, spacing, radius, tokens } from "@/lib/theme";
import {
	FolderKanban,
	CheckSquare,
	ChevronRight,
	Check,
	Search,
	X,
	Receipt,
	Plus,
	FileText,
	UserPlus,
} from "lucide-react-native";
import {
	HalftoneBg,
	Eyebrow,
	SegmentedToggle,
	RevenueGauge,
	StatCard,
	SectionHeader,
	ListRow,
} from "@/components/ui";
import { JourneyProgress } from "@/components/JourneyProgress";
import { createGlyph } from "@/lib/theme";
import { formatCurrency } from "@/lib/format";
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

// Local midnight for a timestamp — used only for day-difference label rounding.
function startOfLocalDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

// Label an awaiting-signing quote by validUntil across the full 7-day window.
function quoteExpiryLabel(validUntil?: number): string {
	if (validUntil === undefined) return "Awaiting signature";
	const today = startOfLocalDay(Date.now());
	const days = Math.round((startOfLocalDay(validUntil) - today) / 86400000);
	if (days < 0) return "Expired";
	if (days === 0) return "Expires today";
	if (days === 1) return "Expires tomorrow";
	if (days <= 7) return `Expires in ${days} days`;
	return `Expires ${new Date(validUntil).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	})}`;
}

// Pick a needs/feed glyph for an activity type. Uses canonical lucide map keys
// (Signature/SquareCheckBig — the FileSignature/CheckSquare aliases are not keys).
function activityIcon(
	activityType: string
): "Signature" | "Receipt" | "SquareCheckBig" | "Activity" {
	if (activityType.startsWith("quote")) return "Signature";
	if (activityType.startsWith("invoice") || activityType.startsWith("payment"))
		return "Receipt";
	if (activityType.startsWith("task")) return "SquareCheckBig";
	return "Activity";
}

// Short relative timestamp for the activity feed (mirrors the web feed intent).
function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.round(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

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
	// Real optimistic completion set for inline needs-attention task rows. An id
	// added here renders completed (green + strikethrough); rolled back on throw.
	const [completedTaskIds, setCompletedTaskIds] = useState<Set<Id<"tasks">>>(
		new Set()
	);

	const user = useQuery(api.users.current);
	const homeStats = useQuery(api.homeStatsOptimized.getHomeStats, {});
	const overdueTasks = useQuery(api.tasks.getOverdue, {});

	// Query clients and projects for stat cards
	const allClients = useQuery(api.clients.list, {});
	const allProjects = useQuery(api.projects.list, {});

	// Org doc — the gauge gate reads monthlyRevenueTarget directly. getHomeStats
	// always returns a 50k fallback target, so we MUST detect "no goal" here.
	const org = useQuery(api.organizations.get, {});

	// Open quotes (status=sent) + overdue invoices for the KPI grid.
	const openQuotes = useQuery(api.quotes.list, { status: "sent" });
	const overdueInvoices = useQuery(api.invoices.getOverdue, {});

	// Needs-attention: awaiting-signing quotes (sent + validUntil within 7d window,
	// includes already-expired). Recent activity feed (real data).
	const awaitingQuotes = useQuery(api.quotes.getAwaitingSigning, {});
	const recentActivity = useQuery(api.activities.getRecent, { limit: 5 });

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

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	const getTimeBasedGreeting = () => {
		const hour = new Date().getHours();
		if (hour < 12) return "Good morning";
		if (hour < 17) return "Good afternoon";
		return "Good evening";
	};

	// UPPERCASE date eyebrow — e.g. "SATURDAY · JUNE 7"
	const now = new Date();
	const dateEyebrow = `${now.toLocaleDateString("en-US", {
		weekday: "long",
	})} · ${now.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
	})}`.toUpperCase();
	const currentMonthUpper = now
		.toLocaleDateString("en-US", { month: "long" })
		.toUpperCase();

	// Inline complete for a past-due needs-attention task. Optimistically marks
	// the row completed, then calls tasks.complete; rolls back the local id on a
	// throw (e.g. already-completed) so no falsely-checked row remains (T-20-05).
	const handleCompleteTask = async (taskId: Id<"tasks">) => {
		if (completedTaskIds.has(taskId)) return;
		setCompletedTaskIds((prev) => new Set(prev).add(taskId));
		try {
			await completeTask({ id: taskId });
		} catch {
			setCompletedTaskIds((prev) => {
				const next = new Set(prev);
				next.delete(taskId);
				return next;
			});
		}
	};

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

	// Revenue gauge gate: only a real, positive org target counts. NEVER gate on
	// homeStats.revenueGoal.target (always >0 via the 50k fallback).
	const hasTarget =
		typeof org?.monthlyRevenueTarget === "number" &&
		org.monthlyRevenueTarget > 0;

	// Open-quotes value = sum of calculated quote totals (quotes.list exposes q.total).
	const openQuotesValue = (openQuotes ?? []).reduce(
		(sum, q) => sum + (q.total ?? 0),
		0
	);

	// Needs-attention aggregate count. The whole section renders only when > 0.
	const naCount =
		(overdueInvoices?.length ?? 0) +
		(awaitingQuotes?.length ?? 0) +
		(overdueTasks?.length ?? 0);

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
				{/* Hero — halftone brand wash bleeding from the top, fading before the toggle */}
				<View style={styles.hero}>
					{/* Brand wash sits absolutely behind the hero content */}
					<View style={styles.heroWash} pointerEvents="none">
						<HalftoneBg brand={0.6} />
					</View>

					<Eyebrow>{dateEyebrow}</Eyebrow>
					<Text style={styles.greeting}>
						{getTimeBasedGreeting()}
						{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
					</Text>

					{/* Search pill — render only; behavior lands in P24 */}
					<View
						style={styles.searchPill}
						importantForAccessibility="no"
						accessibilityElementsHidden
					>
						<Search size={18} color={tokens.faint} />
						<Text style={styles.searchPlaceholder}>
							Search clients, projects, invoices…
						</Text>
					</View>

					<View style={styles.toggleRow}>
						<SegmentedToggle value={viewMode} onChange={setViewMode} />
					</View>
				</View>

				{viewMode === "dashboard" ? (
					<>
						{/* 2x2 KPI grid */}
						<View style={styles.kpiGrid}>
							<View style={styles.kpiRow}>
								<View style={styles.kpiCell}>
									<StatCard
										label="Active Clients"
										value={activeClients}
										foot={`${leadClients} new leads`}
										icon="Users"
										tone="#00a6f4"
										showExternalAffordance
										onPress={() => router.push("/clients")}
									/>
								</View>
								<View style={styles.kpiCell}>
									<StatCard
										label="Active Projects"
										value={activeProjects}
										foot={`${plannedProjects} planned`}
										icon="FolderKanban"
										tone="#7c5cff"
										showExternalAffordance
										onPress={() => router.push("/projects")}
									/>
								</View>
							</View>
							<View style={styles.kpiRow}>
								<View style={styles.kpiCell}>
									<StatCard
										label="Unpaid"
										value={formatCurrency(homeStats?.invoicesSent.outstanding ?? 0)}
										foot={`${overdueInvoices?.length ?? 0} overdue`}
										icon="Receipt"
										tone="#e8930c"
										showExternalAffordance
										onPress={() => router.push("/money")}
									/>
								</View>
								<View style={styles.kpiCell}>
									<StatCard
										label="Open Quotes"
										value={formatCurrency(openQuotesValue)}
										foot={`${openQuotes?.length ?? 0} awaiting reply`}
										icon="FileText"
										tone="#1f9d57"
										showExternalAffordance
										onPress={() => router.push("/money")}
									/>
								</View>
							</View>
						</View>

						{/* Needs attention — renders ONLY when non-empty (no empty state).
						    Aggregates overdue invoices + awaiting-signing quotes + past-due
						    tasks. Invoices/quotes deep-link to /money; tasks complete inline. */}
						{naCount > 0 && (
							<View style={styles.section}>
								<View style={styles.naHeader}>
									<SectionHeader title="Needs attention" />
									<View style={styles.naBadge}>
										<Text style={styles.naBadgeText}>{naCount}</Text>
									</View>
								</View>
								<View style={styles.naList}>
									{(overdueInvoices ?? []).map((inv) => (
										<ListRow
											key={inv._id}
											icon="Receipt"
											iconColor={tokens.danger}
											title={`Invoice ${inv.invoiceNumber}`}
											sub={`${formatCurrency(inv.total)} overdue`}
											onPress={() => router.push("/money")}
										/>
									))}
									{(awaitingQuotes ?? []).map((q) => (
										<ListRow
											key={q._id}
											icon="Signature"
											iconColor={tokens.warning}
											title={q.title || "Quote"}
											sub={quoteExpiryLabel(q.validUntil)}
											onPress={() => router.push("/money")}
										/>
									))}
									{(overdueTasks ?? []).map((task) => {
										const done = completedTaskIds.has(task._id);
										return (
											<ListRow
												key={task._id}
												showChevron={false}
												icon="SquareCheckBig"
												iconColor={tokens.accent}
												title={task.title}
												sub={`Due ${new Date(task.date).toLocaleDateString(
													"en-US",
													{ month: "short", day: "numeric" }
												)}`}
												right={
													<Pressable
														onPress={() => handleCompleteTask(task._id)}
														hitSlop={10}
														style={[
															styles.checkbox,
															done && styles.checkboxDone,
														]}
													>
														{done ? (
															<Check size={16} color="#fff" strokeWidth={3} />
														) : null}
													</Pressable>
												}
											/>
										);
									})}
								</View>
							</View>
						)}

						{/* Revenue — gauge only when a real org target is set, else earned-only */}
						{homeStats &&
							(hasTarget ? (
								<View style={styles.revenueBlock}>
									<RevenueGauge
										pct={homeStats.revenueGoal.percentage}
										label={`${currentMonthUpper} REVENUE`}
										value={formatCurrency(homeStats.revenueGoal.current)}
										goal={`of ${formatCurrency(
											org!.monthlyRevenueTarget!
										)} goal`}
										trend={`${
											homeStats.revenueGoal.changeType === "decrease"
												? "-"
												: "+"
										}${Math.abs(homeStats.revenueGoal.changePercentage)}%`}
										toGo={`${formatCurrency(
											Math.max(
												org!.monthlyRevenueTarget! -
													homeStats.revenueGoal.current,
												0
											)
										)} to go`}
									/>
								</View>
							) : (
								<View style={styles.earnedOnlyCard}>
									<Eyebrow>{`${currentMonthUpper} REVENUE`}</Eyebrow>
									<Text style={styles.earnedValue}>
										{formatCurrency(homeStats.revenueGoal.current)}
									</Text>
									<Pressable onPress={() => router.push("/profile")}>
										<Text style={styles.earnedLink}>Set a monthly goal</Text>
									</Pressable>
								</View>
							))}

						{/* Active-projects summary row — opens Work (distinct from KPI tile) */}
						<View style={styles.section}>
							<ListRow
								icon="FolderKanban"
								iconColor="#7c5cff"
								title="Active projects"
								sub={`${activeProjects} in progress`}
								last
								onPress={() => router.push("/projects")}
							/>
						</View>

						{/* Quick actions */}
						<View style={styles.section}>
							<SectionHeader title="Quick actions" />
							<View style={styles.quickGrid}>
								<Pressable
									style={styles.quickTile}
									onPress={() => router.push("/tasks/new")}
								>
									<View
										style={[
											styles.quickIcon,
											{ backgroundColor: createGlyph.task + "1A" },
										]}
									>
										<Plus size={20} color={createGlyph.task} />
									</View>
									<Text style={styles.quickLabel}>New Task</Text>
								</Pressable>
								<Pressable
									style={styles.quickTile}
									onPress={() => router.push("/money")}
								>
									<View
										style={[
											styles.quickIcon,
											{ backgroundColor: createGlyph.quote + "1A" },
										]}
									>
										<FileText size={20} color={createGlyph.quote} />
									</View>
									<Text style={styles.quickLabel}>New Quote</Text>
								</Pressable>
								<Pressable
									style={styles.quickTile}
									onPress={() => router.push("/clients")}
								>
									<View
										style={[
											styles.quickIcon,
											{ backgroundColor: createGlyph.client + "1A" },
										]}
									>
										<UserPlus size={20} color={createGlyph.client} />
									</View>
									<Text style={styles.quickLabel}>Add Client</Text>
								</Pressable>
								<Pressable
									style={styles.quickTile}
									onPress={() => router.push("/money")}
								>
									<View
										style={[
											styles.quickIcon,
											{ backgroundColor: createGlyph.invoice + "1A" },
										]}
									>
										<Receipt size={20} color={createGlyph.invoice} />
									</View>
									<Text style={styles.quickLabel}>New Invoice</Text>
								</Pressable>
							</View>
						</View>

						{/* Recent activity — real data; section header retained even when empty */}
						<View style={styles.section}>
							<SectionHeader title="Recent activity" />
							<View style={styles.naList}>
								{recentActivity && recentActivity.length > 0 ? (
									recentActivity.map((item, i) => (
										<ListRow
											key={item._id}
											showChevron={false}
											icon={activityIcon(item.activityType)}
											iconColor={tokens.accent}
											title={item.description}
											sub={relativeTime(item.timestamp)}
											last={i === recentActivity.length - 1}
										/>
									))
								) : (
									<ListRow
										showChevron={false}
										icon="Activity"
										iconColor={tokens.faint}
										title="No recent activity"
										sub="Activity will appear here as you work"
										last
									/>
								)}
							</View>
						</View>

						{/* Journey progress — capability retained, re-homed after the hero rewrite */}
						<JourneyProgress />
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
	hero: {
		position: "relative",
		// Bleed the brand wash to the screen edges (escape ScrollView padding)
		marginHorizontal: -spacing.md,
		marginTop: -spacing.md,
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
		paddingBottom: spacing.lg,
		marginBottom: spacing.md,
	},
	heroWash: {
		...StyleSheet.absoluteFill,
	},
	greeting: {
		fontSize: 25,
		fontFamily: fontFamily.semibold,
		color: tokens.ink,
		marginTop: 6,
	},
	searchPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		backgroundColor: tokens.card,
		borderWidth: 1,
		borderColor: tokens.line,
		borderRadius: 9999,
		paddingVertical: 12,
		paddingHorizontal: spacing.md,
		marginTop: spacing.md,
	},
	searchPlaceholder: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: tokens.faint,
	},
	toggleRow: {
		marginTop: spacing.md,
	},
	kpiGrid: {
		gap: 12,
		marginBottom: spacing.md,
	},
	kpiRow: {
		flexDirection: "row",
		gap: 12,
	},
	kpiCell: {
		flex: 1,
	},
	revenueBlock: {
		marginBottom: spacing.md,
	},
	earnedOnlyCard: {
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: tokens.line,
		marginBottom: spacing.md,
	},
	earnedValue: {
		fontSize: 28,
		fontFamily: fontFamily.bold,
		color: tokens.ink,
		marginTop: 6,
	},
	earnedLink: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		color: tokens.accent,
		marginTop: spacing.sm,
	},
	section: {
		marginBottom: spacing.md,
	},
	naHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.xs,
	},
	naBadge: {
		minWidth: 22,
		height: 22,
		paddingHorizontal: 7,
		borderRadius: radius.full,
		backgroundColor: tokens.danger,
		alignItems: "center",
		justifyContent: "center",
	},
	naBadgeText: {
		fontSize: 12,
		fontFamily: fontFamily.bold,
		color: "#fff",
	},
	naList: {
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: tokens.line,
		paddingHorizontal: spacing.md,
	},
	checkbox: {
		width: 26,
		height: 26,
		borderRadius: 7,
		borderWidth: 2,
		borderColor: tokens.border,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxDone: {
		backgroundColor: tokens.success,
		borderColor: tokens.success,
	},
	quickGrid: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.sm,
	},
	quickTile: {
		flex: 1,
		alignItems: "center",
		gap: spacing.xs,
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: tokens.line,
		paddingVertical: spacing.md,
	},
	quickIcon: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	quickLabel: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: tokens.ink,
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
