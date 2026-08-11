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
import {
	DotGrid,
	SegmentedToggle,
	ScrollFade,
	SCROLL_TOP_INSET,
	type Segment,
} from "@/components/ui";
import { useShellNav } from "@/lib/shell-nav";
import { WeekStrip } from "@/components/today/week-strip";
import {
	AttentionLine,
	attentionItems,
} from "@/components/today/attention-line";
import { TomorrowPeek } from "@/components/today/tomorrow-peek";
import { DayPlanView, type Assignee } from "@/components/today/day-plan";
import {
	buildDayPlan,
	countTasksByDay,
	formatClockLabel,
	isDoneStatus,
	projectInScope,
	projectsForDay,
	taskInScope,
	tomorrowPeek,
	weekDaysFor,
	type AgendaProject,
	type AgendaTask,
	type DayScope,
} from "@/lib/agenda";
import { localDayStartMs } from "@/lib/date";
import { DAY_MS } from "@/components/calendar/dateUtils";
import { useDayScope } from "@/lib/useDayScope";
import { Plus, User, Users } from "lucide-react-native";
import { PaneAction, PaneHeader } from "@/components/ipad/pane-header";

const TASK_FORM: Href = "/tasks/form" as Href;
const WORK: Href = "/(tabs)/work" as Href;

const SCOPE_SEGMENTS: readonly Segment<DayScope>[] = [
	{ value: "me", label: "Me", Icon: User },
	{ value: "team", label: "Team", Icon: Users },
];

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
 * Today — the action hub for the selected day. Two pinned controls: the week
 * strip picks the DATE, the Me/Team toggle picks the SCOPE. Everything else
 * (attention, all-day projects, the chronological day plan, tomorrow peek) is
 * ONE scroll — the old pinned-band layout left most of the page inert.
 *
 * Task dates are UTC-midnight date-ids, so they are COMPARED in UTC — but
 * "today" is derived from the instant via the LOCAL calendar (see lib/date.ts).
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
	const { scope, setScope, hydrated } = useDayScope();

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

	// The strip is DERIVED from the selection, so jumping to a day in another
	// week rolls the whole strip there.
	const days = useMemo(() => weekDaysFor(selectedDayMs), [selectedDayMs]);

	// One task subscription covers the visible week plus a day of overflow, so a
	// Saturday's "tomorrow" (next week's Sunday) is still in range.
	const weekTasks = useQuery(api.tasks.list, {
		dateFrom: days[0],
		dateTo: days[6] + 2 * DAY_MS - 1,
	});
	// Spillover can predate the window, so it needs its own query.
	const overdue = useQuery(api.tasks.getOverdue, {});
	const clients = useQuery(api.clients.list, {});
	// Scheduled project work — filtered client-side: `projects` has no date
	// index, and adding one needs a Convex deploy. Revisit if an org's project
	// count gets large.
	const projects = useQuery(api.projects.list, {});
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

	// Merge week + overdue, de-duped (an overdue task earlier in the visible
	// week arrives from both queries), then scope. Scoping BEFORE the derived
	// feeds means the week-strip bars and tomorrow peek reflect what you see.
	const tasks = useMemo<AgendaTask[]>(() => {
		const byId = new Map<string, AgendaTask>();
		for (const task of [...(weekTasks ?? []), ...(overdue ?? [])]) {
			byId.set(task._id, {
				_id: task._id,
				title: task.title,
				date: task.date,
				startTime: task.startTime,
				endTime: task.endTime,
				status: task.status,
				context: task.clientId ? clientNames.get(task.clientId) : undefined,
				assigneeUserId: task.assigneeUserId,
			});
		}
		return [...byId.values()].filter((task) =>
			taskInScope(task, meId, effectiveScope),
		);
	}, [weekTasks, overdue, clientNames, meId, effectiveScope]);

	const scopedProjects = useMemo<AgendaProject[]>(
		() =>
			(projects ?? [])
				.map((p) => ({
					_id: p._id,
					title: p.title,
					status: p.status,
					startDate: p.startDate,
					endDate: p.endDate,
					context: clientNames.get(p.clientId),
					assignedUserIds: p.assignedUserIds,
				}))
				.filter((p) => projectInScope(p, meId, effectiveScope)),
		[projects, clientNames, meId, effectiveScope],
	);
	const dayProjects = useMemo<AgendaProject[]>(
		() => projectsForDay(scopedProjects, selectedDayMs),
		[scopedProjects, selectedDayMs],
	);

	const nowDate = new Date(nowMs);
	const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
	const plan = useMemo(
		() => buildDayPlan(tasks, selectedDayMs, todayMs, nowMinutes),
		[tasks, selectedDayMs, todayMs, nowMinutes],
	);
	const counts = useMemo(() => countTasksByDay(tasks), [tasks]);
	// The subscription follows the SELECTED week, so browsing away puts actual
	// tomorrow outside it — and a zero count would render a confident, false
	// "Nothing scheduled". Only show the peek when tomorrow is really in range.
	const tomorrowMs = todayMs + DAY_MS;
	const peekInRange =
		tomorrowMs >= days[0] && tomorrowMs <= days[6] + 2 * DAY_MS - 1;
	const peek = useMemo(() => tomorrowPeek(tasks, todayMs), [tasks, todayMs]);

	// Effective done state = optimistic override, else server status. Derived
	// (not an override log) so it collapses back to the server value on its own.
	const doneIds = useMemo(
		() =>
			new Set(
				tasks
					.filter((task) => overrides.get(task._id) ?? isDoneStatus(task.status))
					.map((task) => task._id),
			),
		[tasks, overrides],
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
	const todayVisits = useMemo(
		() => projectsForDay(scopedProjects, todayMs).length,
		[scopedProjects, todayMs],
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
	// selectedDayMs is UTC-midnight — render in UTC or the label shows the prior
	// evening in a western timezone.
	const dateLabel = new Date(selectedDayMs).toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});

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
				<CommandHero
					eyebrow={dateLabel}
					greeting={firstName ? `${greeting}, ${firstName}` : greeting}
					stats={heroStats}
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
			    phone the strip moved into the hero and only the scope toggle stays. */}
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
				{multiMember ? (
					<SegmentedToggle
						segments={SCOPE_SEGMENTS}
						value={scope}
						onChange={setScope}
					/>
				) : null}
				{/* At the real chrome/scroll boundary. In AppHeader it painted over
				    the week strip, which has no inset to absorb it. */}
				<ScrollFade edge="top" />
			</View>

			{!hydrated ? null : (
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
					<DayPlanView
						plan={plan}
						projects={dayProjects}
						nowLabel={nowLabel}
						completedIds={doneIds}
						updatingIds={updatingIds}
						onToggleTask={handleToggle}
						onOpenTask={(id) =>
							router.push(`/tasks/form?taskId=${id}` as Href)
						}
						onOpenProject={(id) =>
							shellNav
								? shellNav.open({ kind: "project", id })
								: router.push(`/projects/${id}` as Href)
						}
						onNewTask={() => router.push(TASK_FORM)}
						assigneeFor={assigneeFor}
					/>
					{peekInRange ? (
						<TomorrowPeek
							count={peek.count}
							firstStart={peek.firstStart}
							onPress={() => setSelectedDayMs(tomorrowMs)}
						/>
					) : null}
				</ScrollView>
			)}
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
