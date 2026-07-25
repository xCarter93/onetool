import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useUser } from "@clerk/expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, tracking, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { Button, SegmentedToggle, SCROLL_TOP_INSET } from "@/components/ui";
import { WeekStrip } from "@/components/today/week-strip";
import {
	AttentionLine,
	attentionItems,
} from "@/components/today/attention-line";
import { AgendaRow } from "@/components/today/agenda-row";
import { TomorrowPeek } from "@/components/today/tomorrow-peek";
import { DayTimeline } from "@/components/today/day-timeline";
import {
	buildAgenda,
	countTasksByDay,
	isDoneStatus,
	tomorrowPeek,
	weekDaysFor,
	type AgendaTask,
} from "@/lib/agenda";
import { localDayStartMs, utcDayStartMs } from "@/lib/date";
import { DAY_MS } from "@/components/calendar/dateUtils";
import { useViewMode } from "@/lib/useViewMode";
import { Plus } from "lucide-react-native";
import { PaneAction, PaneHeader } from "@/components/ipad/pane-header";

const TASK_FORM: Href = "/tasks/form" as Href;
const WORK: Href = "/(tabs)/work" as Href;

function greetingFor(hour: number): string {
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

/**
 * Today — the agenda-first landing surface. Two orthogonal controls: the week
 * strip picks the DATE, the Agenda/Timeline toggle picks the REPRESENTATION.
 * Both stay pinned above the scroll so neither can scroll away.
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
	const pane = headerMode === "pane";
	const { viewMode, setViewMode, hydrated } = useViewMode();

	// Ticks once a minute so the greeting and the now-line stay honest across a
	// long session. Async setState — not the synchronous-in-effect pattern this
	// app lints as an error.
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

	// The strip is DERIVED from the selection, so jumping to tomorrow from the
	// peek row rolls the strip into next week with no paging chrome.
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
	const sentQuotes = useQuery(api.quotes.list, { status: "sent" });
	const overdueInvoices = useQuery(api.invoices.getOverdue, {});
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

	// Merge week + overdue, de-duped: an overdue task earlier in the visible week
	// arrives from both queries.
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
			});
		}
		return [...byId.values()];
	}, [weekTasks, overdue, clientNames]);

	const groups = useMemo(
		() => buildAgenda(tasks, selectedDayMs, todayMs),
		[tasks, selectedDayMs, todayMs],
	);
	const counts = useMemo(() => countTasksByDay(tasks), [tasks]);
	// The subscription follows the SELECTED week, so browsing away puts actual
	// tomorrow outside it — and a zero count would render a confident, false
	// "Nothing scheduled". Only show the peek when tomorrow is really in range.
	const tomorrowMs = todayMs + DAY_MS;
	const peekInRange =
		tomorrowMs >= days[0] && tomorrowMs <= days[6] + 2 * DAY_MS - 1;
	const peek = useMemo(() => tomorrowPeek(tasks, todayMs), [tasks, todayMs]);
	const dayTasks = useMemo(
		() =>
			tasks.filter(
				(task) =>
					task.date !== undefined && utcDayStartMs(task.date) === selectedDayMs,
			),
		[tasks, selectedDayMs],
	);

	// Effective done state = optimistic override, else server status. Derived (not
	// an override log) so it collapses back to the server value on its own.
	const doneIds = useMemo(
		() =>
			new Set(
				tasks
					.filter((task) => overrides.get(task._id) ?? isDoneStatus(task.status))
					.map((task) => task._id),
			),
		[tasks, overrides],
	);

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

	const nowDate = new Date(nowMs);
	const greeting = greetingFor(nowDate.getHours());
	const firstName = user?.firstName ?? null;
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
				<AppHeader
					mode="root"
					title={firstName ? `${greeting}, ${firstName}` : greeting}
					sub={dateLabel}
					onAdd={() => router.push(TASK_FORM)}
					addLabel="New task"
				/>
			)}

			{/* Pinned date + representation controls — "persistent" is the point. */}
			<View style={styles.controls}>
				<WeekStrip
					days={days}
					selectedDayMs={selectedDayMs}
					todayMs={todayMs}
					counts={counts}
					onSelectDay={setSelectedDayMs}
				/>
				<SegmentedToggle value={viewMode} onChange={setViewMode} />
			</View>

			{/* Urgency is representation-independent — a Timeline user (the mode is
			    persisted) must still see it. */}
			<View style={styles.attention}>
				<AttentionLine items={attention} onPress={() => router.push(WORK)} />
			</View>

			{!hydrated ? null : viewMode === "timeline" ? (
				<DayTimeline
					dayMs={selectedDayMs}
					tasks={dayTasks}
					todayMs={todayMs}
					nowMinutes={nowDate.getHours() * 60 + nowDate.getMinutes()}
					onPressTask={(id) => router.push(`/tasks/form?taskId=${id}` as Href)}
					onToggleComplete={handleToggle}
					completedIds={doneIds}
					updatingIds={updatingIds}
				/>
			) : (
				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.scrollBody}
					showsVerticalScrollIndicator={false}
				>
					{groups.length === 0 ? (
						<View style={[styles.empty, { borderColor: t.line }]}>
							<Text style={[styles.emptyTitle, { color: t.ink }]}>
								Nothing scheduled
							</Text>
							<Text style={[styles.emptyCopy, { color: t.sub }]}>
								This day is clear.
							</Text>
							<Button
								title="New task"
								onPress={() => router.push(TASK_FORM)}
								style={styles.emptyAction}
							/>
						</View>
					) : (
						groups.map((group) => (
							<View key={group.key} style={styles.group}>
								<Text style={[styles.groupLabel, { color: t.faint }]}>
									{group.label.toUpperCase()}
								</Text>
								<View
									style={[
										styles.groupCard,
										{ backgroundColor: t.card, borderColor: t.line },
									]}
								>
									{group.tasks.map((task, i) => (
										<AgendaRow
											key={task._id}
											task={task}
											completed={doneIds.has(task._id)}
											updating={updatingIds.has(task._id)}
											last={i === group.tasks.length - 1}
											onToggle={() => handleToggle(task._id)}
											onOpen={() =>
												router.push(`/tasks/form?taskId=${task._id}` as Href)
											}
										/>
									))}
								</View>
							</View>
						))
					)}

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
		paddingBottom: 12,
	},
	attention: {
		paddingHorizontal: 18,
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
	group: {
		gap: 7,
	},
	groupLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
	},
	groupCard: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	empty: {
		alignItems: "center",
		gap: 4,
		borderWidth: 1,
		borderStyle: "dashed",
		borderRadius: radii.card,
		paddingVertical: 30,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	emptyCopy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	emptyAction: {
		marginTop: 12,
		alignSelf: "stretch",
	},
});
