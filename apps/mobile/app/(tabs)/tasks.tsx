import { View, Text, StyleSheet, RefreshControl, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import { useState, useCallback, useMemo, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Card, StatCard, Button } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { TaskRow } from "@/components/TaskRow";
import { utcDayStartMs, dateIdFromUtcMs } from "@/lib/date";
import { Plus } from "lucide-react-native";

type Task = Doc<"tasks">;
type EffStatus = "pending" | "in-progress" | "completed" | "cancelled";

type GroupKey = "overdue" | "today" | "upcoming" | "completed" | "cancelled";

const GROUP_META: Record<GroupKey, { label: string; color: string }> = {
	overdue: { label: "Overdue", color: "#e23b3b" },
	today: { label: "Today", color: "#00a6f4" },
	upcoming: { label: "Upcoming", color: "#8a94a3" },
	completed: { label: "Completed", color: "#1f9d57" },
	cancelled: { label: "Cancelled", color: "#e23b3b" },
};

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

// "YYYY-MM-DD" -> "Jun 12" (UTC day, matching the form's stored convention).
function dateLabelFromMs(ms: number): string {
	const [, m, d] = dateIdFromUtcMs(ms).split("-").map(Number);
	return `${MONTHS[m - 1]} ${d}`;
}

function avatarTextFrom(name?: string, email?: string): string {
	const src = name ?? email ?? "?";
	return src
		.split(" ")
		.map((s) => s[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

interface GroupBlock {
	key: GroupKey;
	tasks: Task[];
	total: number;
}

export default function TasksScreen() {
	const router = useRouter();
	const t = useTokens();
	const [refreshing, setRefreshing] = useState(false);

	const tasks = useQuery(api.tasks.list, {});
	const clients = useQuery(api.clients.list, {});
	const users = useQuery(api.users.listByOrg);
	const completeTask = useMutation(api.tasks.complete);
	const updateTask = useMutation(api.tasks.update);

	const loading =
		tasks === undefined || clients === undefined || users === undefined;

	// Optimistic status overlay + in-flight set (Map so un-complete also renders).
	const [optimisticStatus, setOptimisticStatus] = useState(
		new Map<Id<"tasks">, "completed" | "pending">()
	);
	const [updating, setUpdating] = useState(new Set<Id<"tasks">>());

	// Reconcile the overlay against server truth: once the query reflects the
	// override (or the task is gone), drop it so cross-screen changes (e.g.
	// completing from Home) aren't shadowed by a stale local override.
	useEffect(() => {
		if (!tasks) return;
		setOptimisticStatus((prev) => {
			if (prev.size === 0) return prev;
			const serverById = new Map(tasks.map((task) => [task._id, task.status]));
			const next = new Map(prev);
			let changed = false;
			for (const [id, override] of prev) {
				const server = serverById.get(id);
				if (
					server === undefined ||
					(server === "completed") === (override === "completed")
				) {
					next.delete(id);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [tasks]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	const clientsById = useMemo(() => {
		const m = new Map<Id<"clients">, string>();
		(clients ?? []).forEach((c) => m.set(c._id, c.companyName));
		return m;
	}, [clients]);

	const usersById = useMemo(() => {
		const m = new Map<
			Id<"users">,
			{ name?: string; email?: string; image?: string | null }
		>();
		(users ?? []).forEach((u) =>
			m.set(u._id, { name: u.name, email: u.email, image: u.image })
		);
		return m;
	}, [users]);

	// UTC-day boundaries (matches the form's Date.UTC storage — no local midnight).
	// Lazy useState init keeps Date.now() out of render (react-hooks/purity).
	const [today] = useState(() => utcDayStartMs(Date.now()));
	const tomorrow = useMemo(() => today + 86400000, [today]);

	const effStatus = useCallback(
		(task: Task): EffStatus =>
			(optimisticStatus.get(task._id) ?? task.status) as EffStatus,
		[optimisticStatus]
	);

	const groups = useMemo((): GroupBlock[] => {
		const all = tasks ?? [];
		const cancelled: Task[] = [];
		const completed: Task[] = [];
		const overdue: Task[] = [];
		const todayTasks: Task[] = [];
		const upcoming: Task[] = [];

		for (const task of all) {
			const status = effStatus(task);
			// Branch cancelled + completed FIRST so they never leak into a date bucket.
			if (status === "cancelled") {
				cancelled.push(task);
			} else if (status === "completed") {
				completed.push(task);
			} else if (task.date < today) {
				overdue.push(task);
			} else if (task.date < tomorrow) {
				todayTasks.push(task);
			} else {
				upcoming.push(task);
			}
		}

		cancelled.sort((a, b) => (b.completedAt ?? b.date) - (a.completedAt ?? a.date));
		completed.sort((a, b) => (b.completedAt ?? b.date) - (a.completedAt ?? a.date));
		overdue.sort((a, b) => a.date - b.date);
		todayTasks.sort((a, b) => {
			const ta = a.startTime ?? "";
			const tb = b.startTime ?? "";
			if (ta !== tb) return ta.localeCompare(tb);
			return a.title.localeCompare(b.title);
		});
		upcoming.sort((a, b) => a.date - b.date);

		const result: GroupBlock[] = [];
		if (overdue.length)
			result.push({ key: "overdue", tasks: overdue, total: overdue.length });
		if (todayTasks.length)
			result.push({ key: "today", tasks: todayTasks, total: todayTasks.length });
		if (upcoming.length)
			result.push({ key: "upcoming", tasks: upcoming, total: upcoming.length });
		if (completed.length)
			result.push({
				key: "completed",
				tasks: completed.slice(0, 10),
				total: completed.length,
			});
		if (cancelled.length)
			result.push({
				key: "cancelled",
				tasks: cancelled.slice(0, 10),
				total: cancelled.length,
			});
		return result;
	}, [tasks, today, tomorrow, effStatus]);

	const stats = useMemo(() => {
		let open = 0;
		let overdueN = 0;
		let todayN = 0;
		for (const g of groups) {
			if (g.key === "overdue") {
				overdueN = g.total;
				open += g.total;
			} else if (g.key === "today") {
				todayN = g.total;
				open += g.total;
			} else if (g.key === "upcoming") {
				open += g.total;
			}
		}
		return { open, overdue: overdueN, today: todayN };
	}, [groups]);

	const onToggle = useCallback(
		async (task: Task) => {
			const eff = optimisticStatus.get(task._id) ?? task.status;
			const goingComplete = eff !== "completed";
			setOptimisticStatus((prev) => {
				const next = new Map(prev);
				next.set(task._id, goingComplete ? "completed" : "pending");
				return next;
			});
			setUpdating((prev) => new Set(prev).add(task._id));
			try {
				if (goingComplete) {
					await completeTask({ id: task._id });
				} else {
					await updateTask({ id: task._id, status: "pending" });
				}
			} catch {
				setOptimisticStatus((prev) => {
					const next = new Map(prev);
					next.delete(task._id);
					return next;
				});
				Alert.alert("Couldn't update that task. Try again.");
			} finally {
				setUpdating((prev) => {
					const next = new Set(prev);
					next.delete(task._id);
					return next;
				});
			}
		},
		[optimisticStatus, completeTask, updateTask]
	);

	const renderGroup = useCallback(
		({ item }: { item: GroupBlock }) => {
			const meta = GROUP_META[item.key];
			return (
				<View style={styles.groupBlock}>
					<View style={styles.groupHeader}>
						<View style={[styles.groupDot, { backgroundColor: meta.color }]} />
						<Text style={[styles.groupLabel, { color: t.ink }]}>
							{meta.label}
						</Text>
						<View
							style={[styles.countPill, { backgroundColor: meta.color + "18" }]}
						>
							<Text style={[styles.countText, { color: meta.color }]}>
								{item.total}
							</Text>
						</View>
					</View>
					<Card style={styles.groupCard}>
						{item.tasks.map((task, index) => {
							const status = effStatus(task);
							const assignee = task.assigneeUserId
								? usersById.get(task.assigneeUserId)
								: undefined;
							const clientName = task.clientId
								? clientsById.get(task.clientId)
								: undefined;
							return (
								<TaskRow
									key={task._id}
									title={task.title}
									dateLabel={dateLabelFromMs(task.date)}
									timeLabel={task.startTime || undefined}
									clientName={clientName}
									status={status}
									assigneeText={avatarTextFrom(
										assignee?.name,
										assignee?.email
									)}
									assigneeImage={assignee?.image}
									assigneeName={assignee?.name ?? assignee?.email}
									isCompleted={status === "completed"}
									isUpdating={updating.has(task._id)}
									isLast={index === item.tasks.length - 1}
									onToggle={() => onToggle(task)}
									onOpen={() =>
										router.push({
											pathname: "/tasks/form",
											params: { taskId: task._id },
										})
									}
								/>
							);
						})}
					</Card>
				</View>
			);
		},
		[t, effStatus, usersById, clientsById, updating, onToggle, router]
	);

	const ListHeader = (
		<View style={styles.statsRow}>
			<StatCard label="Open" value={stats.open} style={styles.statCard} />
			<StatCard
				label="Overdue"
				value={stats.overdue}
				tone="#e23b3b"
				style={styles.statCard}
			/>
			<StatCard
				label="Today"
				value={stats.today}
				tone="#00a6f4"
				style={styles.statCard}
			/>
		</View>
	);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			<AppHeader mode="root" title="Tasks" />

			{loading ? (
				<View style={styles.listContent}>
					{[0, 1, 2].map((i) => (
						<View key={i} style={styles.skeletonBlock}>
							<View style={[styles.skeleton, { width: "30%", height: 16 }]} />
							<View style={[styles.skeletonCard]}>
								{[0, 1, 2].map((j) => (
									<View key={j} style={styles.skeletonRow}>
										<View style={[styles.skeleton, styles.skeletonBox]} />
										<View style={{ flex: 1 }}>
											<View
												style={[styles.skeleton, { width: "55%", height: 15 }]}
											/>
											<View
												style={[
													styles.skeleton,
													{ width: "35%", height: 13, marginTop: 6 },
												]}
											/>
										</View>
									</View>
								))}
							</View>
						</View>
					))}
				</View>
			) : (
				<FlashList
					data={groups}
					keyExtractor={(item) => item.key}
					renderItem={renderGroup}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={styles.listContent}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							<Text style={[styles.emptyTitle, { color: t.ink }]}>
								No tasks yet
							</Text>
							<Text style={[styles.emptyText, { color: t.sub }]}>
								Create your first task to plan your work.
							</Text>
							<Button
								title="New task"
								icon={<Plus size={18} color="#fff" />}
								onPress={() => router.push({ pathname: "/tasks/form" })}
								style={styles.emptyBtn}
							/>
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
		paddingTop: 12,
		paddingBottom: 32,
	},
	statsRow: {
		flexDirection: "row",
		gap: 10,
		marginBottom: 16,
	},
	statCard: {
		flex: 1,
	},
	groupBlock: {
		marginBottom: 18,
	},
	groupHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 8,
		paddingHorizontal: 2,
	},
	groupDot: {
		width: 9,
		height: 9,
		borderRadius: 9,
	},
	groupLabel: {
		flex: 1,
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	countPill: {
		paddingHorizontal: 9,
		paddingVertical: 2,
		borderRadius: 999,
	},
	countText: {
		fontFamily: fontFamily.bold,
		fontSize: type.xs,
	},
	groupCard: {
		paddingVertical: 6,
		paddingHorizontal: 6,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		textAlign: "center",
		marginBottom: 20,
	},
	emptyBtn: {
		paddingHorizontal: 22,
		alignSelf: "center",
	},
	skeletonBlock: {
		marginBottom: 18,
	},
	skeleton: {
		backgroundColor: "#e9edf2",
		borderRadius: 6,
	},
	skeletonCard: {
		backgroundColor: "#fff",
		borderRadius: radii.rLg,
		borderWidth: 1,
		borderColor: "#e9edf2",
		padding: 12,
		marginTop: 10,
		gap: 12,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	skeletonBox: {
		width: 28,
		height: 28,
		borderRadius: 9,
	},
});
