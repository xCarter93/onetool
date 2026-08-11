import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { useUser } from "@clerk/expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { DOCK_CLEARANCE, useTokens } from "@/lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatCurrency } from "@/lib/format";
import { CommandHero, type HeroStat } from "@/components/today/command-hero";
import { DotGrid, ScrollFade, SCROLL_TOP_INSET } from "@/components/ui";
import { useShellNav } from "@/lib/shell-nav";
import { WeekStrip } from "@/components/today/week-strip";
import {
	AttentionLine,
	attentionItems,
} from "@/components/today/attention-line";
import { TomorrowPeek } from "@/components/today/tomorrow-peek";
import { DayPlanView, type Assignee } from "@/components/today/day-plan";
import { UpcomingList } from "@/components/today/upcoming-list";
import { ScheduleSkeleton } from "@/components/today/schedule-skeleton";
import {
	buildDayPlan,
	buildUpcomingAgenda,
	countScheduleByDay,
	formatClockLabel,
	isDoneStatus,
	projectsForDay,
	scopeCalendarEvents,
	taskInScope,
	tomorrowPeek,
	weekDaysFor,
	UPCOMING_DAYS,
	type AgendaTask,
	type DayScope,
} from "@/lib/agenda";
import { localDayStartMs, utcDayStartMs } from "@/lib/date";
import { DAY_MS } from "@/components/calendar/dateUtils";
import { useDayScope } from "@/lib/useDayScope";
import { useScheduleView } from "@/lib/useScheduleView";
import { Plus } from "lucide-react-native";
import { ScheduleControls } from "@/components/today/schedule-controls";
import { PaneAction, PaneHeader } from "@/components/ipad/pane-header";

const TASK_FORM: Href = "/tasks/form" as Href;
const WORK: Href = "/(tabs)/work" as Href;

/**
 * Days of calendar events fetched past the anchored week's Sunday. The List
 * view runs `UPCOMING_DAYS` from the anchor, and the anchor can be the week's
 * Saturday — 6 + 13 = 19, so 20 is a safe superset.
 *
 * The window is quantised to the WEEK, never the anchor: query args that change
 * on every strip tap would drop `useQuery` back to `undefined` and flash the
 * skeleton on every day you touch.
 */
const WINDOW_DAYS = 20;

function greetingFor(hour: number): string {
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

/** "Pat Carter" → "PC"; single-word names take their first two letters. */
function initialsFor(name: string, email: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	}
	const base = words[0] ?? email;
	return base.slice(0, 2).toUpperCase();
}

/**
 * Today — run the day. The week strip is the DATE anchor, Day | List picks the
 * representation and Me | Team the scope; everything below the hero is one
 * scroll. Day and List read ONE calendar-events subscription, and so do the
 * strip's workload bars, so the strip can never disagree with the schedule.
 *
 * Task/project dates are UTC-midnight date-ids, so they are COMPARED in UTC —
 * but "today" is derived from the instant via the LOCAL calendar (lib/date.ts).
 * Mixing those up is what made Today roll over at 5pm Pacific.
 */
export default function TodayScreen({
	headerMode = "root",
}: {
	/** "pane" = the iPad shell's Today pane: a light title row, no bell/avatar/org
	 * (the rail owns those). Today keeps its OWN header either way because the
	 * greeting and selected date are its identity. */
	headerMode?: "root" | "pane";
} = {}) {
	const t = useTokens();
	const { user } = useUser();
	const insets = useSafeAreaInsets();
	const pane = headerMode === "pane";
	// iPad only — null on iPhone, where navigation falls back to the router.
	const shellNav = useShellNav();
	const { scope, setScope, hydrated: scopeHydrated } = useDayScope();
	const { view, setView, hydrated: viewHydrated } = useScheduleView();

	// Ticks once a minute so the greeting and the now separator stay honest
	// across a long session. Async setState — not the synchronous-in-effect
	// pattern this app lints as an error.
	const [nowMs, setNowMs] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNowMs(Date.now()), 60_000);
		return () => clearInterval(id);
	}, []);

	// LOCAL calendar, not UTC — see lib/date.ts. Flooring the instant in UTC rolls
	// "today" over at 5pm Pacific, which opened Today on tomorrow and marked the
	// evening's in-progress jobs Overdue.
	const todayMs = localDayStartMs(nowMs);
	const [selectedDayMs, setSelectedDayMs] = useState(() =>
		localDayStartMs(Date.now()),
	);
	const anchorMs = utcDayStartMs(selectedDayMs);

	// The strip is DERIVED from the selection, so jumping to a day in another
	// week rolls the whole strip there.
	const days = useMemo(() => weekDaysFor(selectedDayMs), [selectedDayMs]);
	const windowEndMs = days[0] + WINDOW_DAYS * DAY_MS;

	// The one schedule subscription: the anchored week plus enough overflow for
	// the List view's rolling window.
	const events = useQuery(api.calendar.getCalendarEvents, {
		startDate: days[0],
		endDate: windowEndMs,
	});
	// Spillover predates any window, so it needs its own query.
	const overdue = useQuery(api.tasks.getOverdue, {});
	// Only used to name the overdue rows — getOverdue returns raw task docs, with
	// no client name of their own.
	const clients = useQuery(api.clients.list, {});
	const sentQuotes = useQuery(api.quotes.list, { status: "sent" });
	const overdueInvoices = useQuery(api.invoices.getOverdue, {});
	// Scope plumbing: me = current user's Convex id; org members drive both the
	// toggle's visibility (solo orgs never see it) and Team-mode assignee chips.
	const me = useQuery(api.users.current, {});
	const orgUsers = useQuery(api.users.listByOrg, {});
	const completeTask = useMutation(api.tasks.complete);
	const updateTask = useMutation(api.tasks.update);

	// id -> optimistic done value. A Set can only express "became done", but the
	// checkbox is a real toggle, so un-completing needs a false to store.
	const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
	const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

	const clientNames = useMemo(() => {
		const m = new Map<string, string>();
		for (const c of clients ?? []) m.set(c._id, c.companyName);
		return m;
	}, [clients]);

	const meId = me?._id ?? null;
	const multiMember = (orgUsers?.length ?? 0) > 1;
	// A solo org's scope control would be a no-op — never render it, and treat
	// the data as team-wide so a stale persisted "me" can't hide anything.
	const effectiveScope: DayScope = multiMember ? scope : "team";

	// Adapt + scope once. Every feed below (day plan, upcoming list, strip bars,
	// tomorrow peek) reads this, so they cannot disagree.
	const schedule = useMemo(
		() => scopeCalendarEvents(events, meId, effectiveScope),
		[events, meId, effectiveScope],
	);

	// Overdue spillover joins the day plan only: it can predate the window, so it
	// is not part of the shared schedule feed. De-duped against in-window rows.
	const overdueTasks = useMemo<AgendaTask[]>(() => {
		const inWindow = new Set(schedule.tasks.map((task) => task._id));
		return (overdue ?? [])
			.filter((task) => !inWindow.has(task._id))
			.map((task) => ({
				_id: task._id,
				title: task.title,
				date: task.date,
				startTime: task.startTime,
				endTime: task.endTime,
				status: task.status,
				context: task.clientId ? clientNames.get(task.clientId) : undefined,
				assigneeUserId: task.assigneeUserId,
			}))
			.filter((task) => taskInScope(task, meId, effectiveScope));
	}, [overdue, schedule.tasks, clientNames, meId, effectiveScope]);

	const dayTasks = useMemo(
		() => [...schedule.tasks, ...overdueTasks],
		[schedule.tasks, overdueTasks],
	);

	const dayProjects = useMemo(
		() => projectsForDay(schedule.projects, anchorMs),
		[schedule.projects, anchorMs],
	);

	const nowDate = new Date(nowMs);
	const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
	const plan = useMemo(
		() => buildDayPlan(dayTasks, anchorMs, todayMs, nowMinutes),
		[dayTasks, anchorMs, todayMs, nowMinutes],
	);
	const upcoming = useMemo(
		() => buildUpcomingAgenda(schedule, anchorMs, UPCOMING_DAYS),
		[schedule, anchorMs],
	);
	const counts = useMemo(
		() => countScheduleByDay(schedule.tasks, schedule.projects, days),
		[schedule, days],
	);

	// The subscription follows the SELECTED week, so browsing away puts actual
	// tomorrow outside it — and a zero count would render a confident, false
	// "Nothing scheduled". Only show the peek when tomorrow is really in range.
	const tomorrowMs = todayMs + DAY_MS;
	const peekInRange = tomorrowMs >= days[0] && tomorrowMs <= windowEndMs;
	const peek = useMemo(
		() => tomorrowPeek(schedule.tasks, todayMs),
		[schedule.tasks, todayMs],
	);

	// Effective done state = optimistic override, else server status. Derived
	// (not an override log) so it collapses back to the server value on its own.
	const doneIds = useMemo(
		() =>
			new Set(
				dayTasks
					.filter((task) => overrides.get(task._id) ?? isDoneStatus(task.status))
					.map((task) => task._id),
			),
		[dayTasks, overrides],
	);

	// Team mode labels rows with who owns them; in Me mode a chip would repeat
	// the tab you're on.
	const assigneeFor = useMemo(() => {
		if (effectiveScope !== "team" || !multiMember) return undefined;
		const byId = new Map<string, Assignee>();
		for (const u of orgUsers ?? []) {
			byId.set(u._id, {
				initials: initialsFor(u.name, u.email),
				name: u.name || u.email,
			});
		}
		return (task: AgendaTask) =>
			task.assigneeUserId ? byId.get(task.assigneeUserId) : undefined;
	}, [effectiveScope, multiMember, orgUsers]);

	const attention = useMemo(
		() =>
			attentionItems([
				{
					count: sentQuotes?.length ?? 0,
					singular: "quote awaiting approval",
					plural: "quotes awaiting approval",
				},
				{
					count: overdueInvoices?.length ?? 0,
					singular: "invoice overdue",
					plural: "invoices overdue",
				},
			]),
		[sentQuotes, overdueInvoices],
	);

	// The line names a specific problem, so the tap has to land on it. One record
	// → open it; one category → Work scoped to that chip; mixed → Work unscoped.
	const openAttention = () => {
		const quotes = sentQuotes ?? [];
		const invoices = overdueInvoices ?? [];
		const only =
			quotes.length && !invoices.length
				? ({ kind: "quote", rows: quotes } as const)
				: invoices.length && !quotes.length
					? ({ kind: "invoice", rows: invoices } as const)
					: null;
		if (!only) {
			if (shellNav) shellNav.browse("quote");
			else router.push(WORK);
			return;
		}
		if (only.rows.length === 1) {
			const id = only.rows[0]._id;
			if (shellNav) return shellNav.open({ kind: only.kind, id });
			return router.push(
				(only.kind === "quote" ? `/quote/${id}` : `/invoice/${id}`) as Href,
			);
		}
		if (shellNav) return shellNav.browse(only.kind);
		router.push(`/(tabs)/work?kind=${only.kind}` as Href);
	};

	// Optimistic toggle: flip locally, then call; drop the override on throw.
	// `tasks.complete` throws on an already-completed task, so the un-complete
	// direction has to go through `update` — a checkbox that only ever completes
	// would make its own "Mark not done" label a lie.
	const handleToggle = async (id: string) => {
		if (updatingIds.has(id)) return;
		const next = !doneIds.has(id);
		setOverrides((prev) => new Map(prev).set(id, next));
		setUpdatingIds((prev) => new Set(prev).add(id));
		try {
			if (next) {
				await completeTask({ id: id as Id<"tasks"> });
			} else {
				await updateTask({ id: id as Id<"tasks">, status: "pending" });
			}
		} catch {
			setOverrides((prev) => {
				const m = new Map(prev);
				m.delete(id);
				return m;
			});
		} finally {
			setUpdatingIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	};

	const greeting = greetingFor(nowDate.getHours());
	const firstName = user?.firstName ?? null;

	// Hero stats — honest to what this screen already subscribes to. "Overdue"
	// (not the canvas's "due this week"): due-dated aggregation isn't available
	// client-side, and a wrong money number is worse than a narrower true one.
	// Only rendered when the anchor IS today, which is exactly when the window
	// is guaranteed to contain today.
	const todayVisits = useMemo(
		() => projectsForDay(schedule.projects, todayMs).length,
		[schedule.projects, todayMs],
	);
	const overdueTotal = useMemo(
		() =>
			(overdueInvoices ?? []).reduce((sum, inv) => sum + (inv.total ?? 0), 0),
		[overdueInvoices],
	);
	const heroStats: HeroStat[] = [
		{ value: String(todayVisits), caption: "Visits today" },
		{ value: formatCurrency(overdueTotal), caption: "Overdue", accent: true },
		{ value: String(sentQuotes?.length ?? 0), caption: "Quotes waiting" },
	];
	const nowLabel =
		formatClockLabel(
			`${String(nowDate.getHours()).padStart(2, "0")}:${String(
				nowDate.getMinutes(),
			).padStart(2, "0")}`,
		) ?? "";
	// anchorMs is UTC-midnight — render in UTC or the label shows the prior
	// evening in a western timezone.
	const dateLabel = new Date(anchorMs).toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});

	const anchoredElsewhere = anchorMs !== utcDayStartMs(todayMs);
	const hydrated = scopeHydrated && viewHydrated;
	const loading = events === undefined;
	const windowEmpty =
		!loading && schedule.tasks.length === 0 && schedule.projects.length === 0;

	const openTask = (id: string) =>
		router.push(`/tasks/form?taskId=${id}` as Href);
	const openProject = (id: string) =>
		shellNav
			? shellNav.open({ kind: "project", id })
			: router.push(`/projects/${id}` as Href);
	const newTask = () => router.push(TASK_FORM);

	return (
		<View style={[styles.screen, { backgroundColor: t.bg }]}>
			{/* Page canvas, matching web's .workspace-canvas. First child so every
			    surface paints over it. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{pane ? (
				<PaneHeader
					title={firstName ? `${greeting}, ${firstName}` : greeting}
					sub={dateLabel}
					right={
						<PaneAction
							icon={Plus}
							label="New task"
							onPress={() => router.push(TASK_FORM)}
						/>
					}
				/>
			) : (
				// 3.0 ink command hero (canvas 1a): org bar, greeting, day stats and
				// the ink-tone week strip live in the band; the body scrolls beneath.
				// Anchoring off today compresses it so the schedule gets the room.
				<CommandHero
					eyebrow={dateLabel}
					greeting={firstName ? `${greeting}, ${firstName}` : greeting}
					stats={heroStats}
					compact={anchoredElsewhere}
				>
					<WeekStrip
						tone="ink"
						days={days}
						selectedDayMs={selectedDayMs}
						todayMs={todayMs}
						counts={counts}
						onSelectDay={setSelectedDayMs}
						onPageWeek={(dir) =>
							setSelectedDayMs((ms) => ms + dir * 7 * DAY_MS)
						}
					/>
				</CommandHero>
			)}

			{/* Pinned controls — the iPad pane keeps the light strip here; on the
			    phone the strip moved into the hero. ONE eyebrow-level row: the two
			    stacked full-width toggles this replaced read as chrome and pushed the
			    schedule (the reason for the tab) below the fold. Pinned, not folded
			    into a section header — Day | List swaps the whole body, and this block
			    anchors the ScrollFade at the chrome/scroll boundary. */}
			<View style={styles.controls}>
				{pane ? (
					<WeekStrip
						days={days}
						selectedDayMs={selectedDayMs}
						todayMs={todayMs}
						counts={counts}
						onSelectDay={setSelectedDayMs}
						onPageWeek={(dir) =>
							setSelectedDayMs((ms) => ms + dir * 7 * DAY_MS)
						}
					/>
				) : null}
				<ScheduleControls
					view={view}
					onChangeView={setView}
					scope={scope}
					onChangeScope={setScope}
					showScope={multiMember}
				/>
				{/* At the real chrome/scroll boundary. In AppHeader it painted over
				    the week strip, which has no inset to absorb it. */}
				<ScrollFade edge="top" />
			</View>

			<ScrollView
				style={styles.scroll}
				contentContainerStyle={[
					styles.scrollBody,
					// Content runs under the floating glass dock (phone only — the
					// iPad pane has no dock).
					!pane && { paddingBottom: DOCK_CLEARANCE + insets.bottom },
				]}
				showsVerticalScrollIndicator={false}
			>
				<AttentionLine items={attention} onPress={openAttention} />
				{!hydrated || loading ? (
					<ScheduleSkeleton />
				) : view === "list" ? (
					<UpcomingList
						days={upcoming}
						anchorDayMs={anchorMs}
						todayMs={todayMs}
						completedIds={doneIds}
						updatingIds={updatingIds}
						onToggleTask={handleToggle}
						onOpenTask={openTask}
						onOpenProject={openProject}
						onNewTask={newTask}
						assigneeFor={assigneeFor}
					/>
				) : (
					<>
						<DayPlanView
							plan={plan}
							dayMs={anchorMs}
							projects={dayProjects}
							nowLabel={nowLabel}
							windowEmpty={windowEmpty}
							completedIds={doneIds}
							updatingIds={updatingIds}
							onToggleTask={handleToggle}
							onOpenTask={openTask}
							onOpenProject={openProject}
							onNewTask={newTask}
							assigneeFor={assigneeFor}
						/>
						{/* Day view only — in List, tomorrow is literally the next group. */}
						{peekInRange ? (
							<TomorrowPeek
								count={peek.count}
								firstStart={peek.firstStart}
								onPress={() => setSelectedDayMs(tomorrowMs)}
							/>
						) : null}
					</>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	controls: {
		paddingHorizontal: 18,
		gap: 10,
		paddingTop: 10,
		paddingBottom: 12,
		// Anchors the ScrollFade to this block's bottom edge.
		position: "relative",
	},
	scroll: {
		flex: 1,
	},
	scrollBody: {
		paddingHorizontal: 18,
		paddingTop: 2,
		paddingBottom: SCROLL_TOP_INSET + 40,
		gap: 18,
	},
});
