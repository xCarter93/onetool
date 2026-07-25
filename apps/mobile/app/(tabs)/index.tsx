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
	tomorrowPeek,
	weekDaysFor,
	type AgendaTask,
} from "@/lib/agenda";
import { utcDayStartMs } from "@/lib/date";
import { DAY_MS } from "@/components/calendar/dateUtils";
import { useViewMode } from "@/lib/useViewMode";
import { useDevice } from "@/lib/use-device";

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
 * Task dates are UTC-midnight ms (see lib/date.ts), so every day boundary here
 * is a UTC boundary. The greeting and the timeline's now-line are the only
 * local-clock reads — those track the human, not the record.
 */
export default function TodayScreen() {
	const t = useTokens();
	const { user } = useUser();
	const { device } = useDevice();
	const pane = device === "ipad";
	const { viewMode, setViewMode } = useViewMode();

	// Ticks once a minute so the greeting and the now-line stay honest across a
	// long session. Async setState — not the synchronous-in-effect pattern this
	// app lints as an error.
	const [nowMs, setNowMs] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNowMs(Date.now()), 60_000);
		return () => clearInterval(id);
	}, []);

	const todayMs = utcDayStartMs(nowMs);
	const [selectedDayMs, setSelectedDayMs] = useState(() =>
		utcDayStartMs(Date.now()),
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

	const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
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
	const peek = useMemo(() => tomorrowPeek(tasks, todayMs), [tasks, todayMs]);
	const dayTasks = useMemo(
		() =>
			tasks.filter(
				(task) =>
					task.date !== undefined && utcDayStartMs(task.date) === selectedDayMs,
			),
		[tasks, selectedDayMs],
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

	// Optimistic complete: flip locally, then call; roll the flip back on throw.
	const handleToggle = async (id: string) => {
		if (updatingIds.has(id)) return;
		setCompletedIds((prev) => new Set(prev).add(id));
		setUpdatingIds((prev) => new Set(prev).add(id));
		try {
			await completeTask({ id: id as Id<"tasks"> });
		} catch {
			setCompletedIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
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
			{!pane ? (
				<AppHeader
					mode="root"
					title={firstName ? `${greeting}, ${firstName}` : greeting}
					sub={dateLabel}
					onAdd={() => router.push(TASK_FORM)}
					addLabel="New task"
				/>
			) : null}

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

			{viewMode === "timeline" ? (
				<DayTimeline
					dayMs={selectedDayMs}
					tasks={dayTasks}
					todayMs={todayMs}
					nowMinutes={nowDate.getHours() * 60 + nowDate.getMinutes()}
					onPressTask={(id) => router.push(`/tasks/form?taskId=${id}` as Href)}
					onToggleComplete={handleToggle}
					completedIds={completedIds}
					updatingIds={updatingIds}
				/>
			) : (
				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.scrollBody}
					showsVerticalScrollIndicator={false}
				>
					<AttentionLine items={attention} onPress={() => router.push(WORK)} />

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
											completed={completedIds.has(task._id)}
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

					<TomorrowPeek
						count={peek.count}
						firstStart={peek.firstStart}
						onPress={() => setSelectedDayMs(todayMs + DAY_MS)}
					/>
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
