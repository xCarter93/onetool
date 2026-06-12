import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	Pressable,
	StyleSheet,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fontFamily, spacing, radius, tokens } from "@/lib/theme";
import { Check, Search } from "lucide-react-native";
import {
	HalftoneBg,
	Eyebrow,
	SegmentedToggle,
	RevenueGauge,
	StatCard,
	SectionHeader,
	ListRow,
} from "@/components/ui";
import { JourneyCard } from "@/components/JourneyCard";
import { formatCurrency } from "@/lib/format";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import {
	buildMonthCells,
	cellDayKey,
	DAY_MS,
} from "@/components/calendar/dateUtils";
import { useViewMode } from "@/lib/useViewMode";
import { AppHeader } from "@/components/app-header";
import { useShellNav } from "@/lib/shell-nav";
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

// headerMode/wide default off → the iPhone path (AppHeader mode="root" home,
// single-column ScrollView, raw router.push) is byte-identical. The iPad shell
// renders this as a single pane: headerMode="pane" suppresses the self-mounted
// AppHeader (shell mounts the one PaneHeader with the search affordance), and
// wide=true (landscape) re-flows the dashboard into two columns.
export default function HomeScreen({
	headerMode = "root",
	wide = false,
}: {
	headerMode?: "root" | "pane";
	wide?: boolean;
} = {}) {
	const router = useRouter();
	const shellNav = useShellNav();
	const isPane = headerMode === "pane";
	const [refreshing, setRefreshing] = useState(false);
	const { viewMode, setViewMode, hydrated } = useViewMode();
	// Displayed month drives both the MonthGrid render and the fetch window.
	const today = new Date();
	const [displayed, setDisplayed] = useState<{ year: number; month: number }>({
		year: today.getFullYear(),
		month: today.getMonth(),
	});
	// Optimistic completion set for the inline needs-attention task rows. An id
	// here renders completed (green + strikethrough); rolled back on throw.
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

	// Fetch window covers the FIRST..LAST visible cell of the 42-grid so the
	// adjacent-month cells (and their markers) have data. Hydration-gated skip
	// (Pitfall 4): a calendar-first persisted user must not see a dashboard flash,
	// and the query must not fire in dashboard view.
	const calendarArgs =
		!hydrated || viewMode !== "calendar"
			? ("skip" as const)
			: (() => {
					const cells = buildMonthCells(displayed.year, displayed.month);
					// UTC-day window covering the first..last visible cell, matching the
					// Date.UTC storage of task.date / project dates (see dateUtils).
					return {
						startDate: cellDayKey(cells[0]),
						endDate: cellDayKey(cells[41]) + DAY_MS - 1,
					};
				})();
	const calendarEvents = useQuery(
		api.calendar.getCalendarEvents,
		calendarArgs
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
	const activeClients =
		allClients?.filter((c) => c.status === "active").length ?? 0;
	const leadClients =
		allClients?.filter((c) => c.status === "lead").length ?? 0;

	// Calculate project stats
	const activeProjects =
		allProjects?.filter(
			(p) => p.status === "planned" || p.status === "in-progress"
		).length ?? 0;
	const plannedProjects =
		allProjects?.filter((p) => p.status === "planned").length ?? 0;

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

	// Single bucketing path: DaySheet buckets the day arrays internally via
	// dateUtils (tasksOnDay/projectsOnDay) — no duplicate filtering memo here.

	// Home internal navigation. On iPad (inside the shell) every tab jump MUST go
	// through the ShellNav context — a raw router.push to a (tabs) sibling re-mounts
	// the whole shell and slides it (26-01). useShellNav() is null on iPhone, so the
	// raw router.push fallback keeps the iPhone path byte-identical.
	//
	// KPI / needs-attention rows currently target the bare LIST routes (/clients,
	// /projects, /money). The 26-01 usePathname reconciliation layer DOES map these
	// to the matching activeTab on a real route change, but on iPad we route through
	// the shell directly so no push leaves the shell stale or slides a fresh (tabs).
	const goTab = (tab: "clients" | "projects" | "money", route: Href) =>
		shellNav ? shellNav.open(tab) : router.push(route);
	// The search pill opens the centered Search overlay (26-05) — a transparentModal
	// over the mounted shell, so it stays a plain router.push on both devices.
	const openSearch = () => router.push("/search" as Href);

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={[]}
		>
			{/* Brand wash. iPhone + iPad-portrait: fixed 380 band (byte-identical).
			    iPad-landscape (wide): the HalftoneBg image is sized off the full
			    ~1366pt window while this pane is only ~1136pt wide, so the image's
			    own bottomFade gets cropped mid-fade by the fixed band → a hard
			    horizontal edge. A taller wide band plus a transparent→background
			    LinearGradient over the lower band dissolves that crop into the page. */}
			<View
				style={[styles.pageWash, wide && styles.pageWashWide]}
				pointerEvents="none"
			>
				<HalftoneBg brand={0.85} imageFit="width" imageOffsetTop={-10} />
				{wide ? (
					<LinearGradient
						pointerEvents="none"
						colors={["rgba(245,245,245,0)", colors.background]}
						style={styles.washFadeWide}
					/>
				) : null}
			</View>
			{/* iPhone: AppHeader root. iPad pane: shell mounts the one PaneHeader
			    (single-header convention) so the self-mounted AppHeader is suppressed. */}
			{isPane ? null : <AppHeader mode="root" home />}
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={styles.scrollContent}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View style={styles.hero}>
					<Eyebrow color={tokens.ink}>{dateEyebrow}</Eyebrow>
					<Text style={styles.greeting}>
						{getTimeBasedGreeting()}
						{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
					</Text>

					{/* Search pill — opens the /search overlay */}
					<Pressable
						style={styles.searchPill}
						onPress={openSearch}
						accessibilityRole="button"
						accessibilityLabel="Search clients, projects"
					>
						<Search size={18} color={tokens.faint} />
						<Text style={styles.searchPlaceholder}>
							Search clients, projects…
						</Text>
					</Pressable>

					<View style={styles.toggleRow}>
						<SegmentedToggle value={viewMode} onChange={setViewMode} />
					</View>
				</View>

				{viewMode === "dashboard" ? (
					(() => {
						// Dashboard sections extracted as inline JSX (NOT new hooks — no
						// useQuery/useMemo/useState added/removed/reordered between paths,
						// so hook order is identical for iPhone and iPad). Composed single-
						// column (iPhone + iPad portrait) or 2-column (iPad landscape, wide).

						// 2x2 KPI grid. On iPad these jump through the shell (goTab); on
						// iPhone goTab falls back to the same router.push as before.
						const kpiGrid = (
							<View style={styles.kpiGrid}>
								<View style={styles.kpiRow}>
									<View style={styles.kpiCell}>
										<StatCard
											label="Active Clients"
											value={activeClients}
											foot={`${leadClients} new leads`}
											icon="Users"
											tone="#00a6f4"
											onPress={() => goTab("clients", "/clients")}
										/>
									</View>
									<View style={styles.kpiCell}>
										<StatCard
											label="Active Projects"
											value={activeProjects}
											foot={`${plannedProjects} planned`}
											icon="FolderKanban"
											tone="#7c5cff"
											onPress={() => goTab("projects", "/projects")}
										/>
									</View>
								</View>
								<View style={styles.kpiRow}>
									<View style={styles.kpiCell}>
										<StatCard
											label="Unpaid"
											value={formatCurrency(
												homeStats?.invoicesSent.outstanding ?? 0
											)}
											foot={`${overdueInvoices?.length ?? 0} overdue`}
											icon="Receipt"
											tone="#e8930c"
											onPress={() => goTab("money", "/money")}
										/>
									</View>
									<View style={styles.kpiCell}>
										<StatCard
											label="Open Quotes"
											value={formatCurrency(openQuotesValue)}
											foot={`${openQuotes?.length ?? 0} awaiting reply`}
											icon="FileText"
											tone="#1f9d57"
											onPress={() => goTab("money", "/money")}
										/>
									</View>
								</View>
							</View>
						);

						// Needs attention — renders ONLY when non-empty (no empty state).
						// Invoices/quotes deep-link to /money via the shell; tasks complete inline.
						const kpiGridWide = (
								<View style={styles.kpiRowWide}>
									<View style={styles.kpiCell}>
										<StatCard
											label="Active Clients"
											value={activeClients}
											foot={`${leadClients} new leads`}
											icon="Users"
											tone="#00a6f4"
											onPress={() => goTab("clients", "/clients")}
										/>
									</View>
									<View style={styles.kpiCell}>
										<StatCard
											label="Active Projects"
											value={activeProjects}
											foot={`${plannedProjects} planned`}
											icon="FolderKanban"
											tone="#7c5cff"
											onPress={() => goTab("projects", "/projects")}
										/>
									</View>
									<View style={styles.kpiCell}>
										<StatCard
											label="Unpaid"
											value={formatCurrency(
												homeStats?.invoicesSent.outstanding ?? 0
											)}
											foot={`${overdueInvoices?.length ?? 0} overdue`}
											icon="Receipt"
											tone="#e8930c"
											onPress={() => goTab("money", "/money")}
										/>
									</View>
									<View style={styles.kpiCell}>
										<StatCard
											label="Open Quotes"
											value={formatCurrency(openQuotesValue)}
											foot={`${openQuotes?.length ?? 0} awaiting reply`}
											icon="FileText"
											tone="#1f9d57"
											onPress={() => goTab("money", "/money")}
										/>
									</View>
								</View>
							);

							// Needs attention block (single-column path) below.
							const needsAttention = naCount > 0 && (
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
											onPress={() => goTab("money", "/money")}
										/>
									))}
									{(awaitingQuotes ?? []).map((q) => (
										<ListRow
											key={q._id}
											icon="Signature"
											iconColor={tokens.warning}
											title={q.title || "Quote"}
											sub={quoteExpiryLabel(q.validUntil)}
											onPress={() => goTab("money", "/money")}
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
													{
														month: "short",
														day: "numeric",
														timeZone: "UTC",
													}
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
						);

						// Revenue — gauge only when a real org target is set, else earned-only.
						const revenueBlock = homeStats ? (
							hasTarget ? (
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
							)
						) : null;

						// Recent activity — real data; section header retained even when empty.
						const recentActivityBlock = (
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
						);

						// Journey — compact gauge tile; opens the /journey sheet for detail.
						const journey = <JourneyCard />;

						// iPad landscape (Option A): full-width revenue, 4-across KPI row,
						// then a two-column row - recent activity (wider) beside journey +
						// needs-attention stacked. Portrait + iPhone keep the EXISTING
						// single-column order below, byte-identical.
						if (wide) {
							return (
								<>
									{revenueBlock}
									{kpiGridWide}
									<View style={styles.wideRow}>
										<View style={styles.wideMain}>
											{recentActivityBlock}
										</View>
										<View style={styles.wideSide}>
											{journey}
											{needsAttention}
										</View>
									</View>
								</>
							);
						}

						return (
							<>
								{kpiGrid}
								{needsAttention}
								{revenueBlock}
								{recentActivityBlock}
								{journey}
							</>
						);
					})()
				) : (
					/* Calendar View — custom MonthGrid fed by getCalendarEvents */
					<View style={styles.calendarSection}>
						<MonthGrid
							projects={calendarEvents?.projects ?? []}
							tasks={calendarEvents?.tasks ?? []}
							year={displayed.year}
							month={displayed.month}
							onMonthChange={(y, m) => setDisplayed({ year: y, month: m })}
							onDayPress={(ts) =>
								router.push(`/day-sheet?dayTs=${ts}` as Href)
							}
						/>
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	pageWash: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: 380,
		overflow: "hidden",
	},
	// iPad-landscape only: a taller wash band gives the hero image's own
	// bottomFade room to complete inside the visible strip instead of being
	// cropped mid-fade by the fixed 380 band (the hard horizontal edge).
	pageWashWide: {
		height: 460,
	},
	// iPad-landscape only: transparent→page-background gradient over the lower
	// wash band, dissolving any residual crop into the page (no hard edge).
	washFadeWide: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 180,
	},
	hero: {
		position: "relative",
		marginHorizontal: -spacing.md,
		marginTop: -spacing.md,
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
		paddingBottom: spacing.lg,
		marginBottom: spacing.md,
	},
	scrollContent: {
		flexGrow: 1,
		padding: spacing.md,
		paddingBottom: spacing.md,
	},
	greeting: {
		fontSize: 22,
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
		fontSize: 13,
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
	// iPad-landscape only: the four StatCards 4-across in one flex:1 row.
	kpiRowWide: {
		flexDirection: "row",
		gap: 12,
		marginBottom: spacing.md,
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
		fontSize: 24,
		fontFamily: fontFamily.bold,
		color: tokens.ink,
		marginTop: 6,
	},
	earnedLink: {
		fontSize: 12,
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
		fontSize: 11,
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
	calendarSection: {
		gap: spacing.md,
	},
	// iPad-landscape lower row: recent activity (wider, flex 1.5) beside the
	// journey + needs-attention stack (flex 1). Items start-aligned so the
	// shorter column does not stretch to match the taller one.
	wideRow: {
		flexDirection: "row",
		gap: 18,
		alignItems: "flex-start",
	},
	wideMain: {
		flex: 1.5,
	},
	wideSide: {
		flex: 1,
	},
});
