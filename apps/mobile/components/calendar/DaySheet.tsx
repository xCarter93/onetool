import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Calendar, Check, ChevronRight, Folder, X } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import {
	projectsOnDay,
	tasksOnDay,
	type ProjectEvent,
	type TaskEvent,
} from "./dateUtils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

const PROJECT_GREEN = "#1f9d57"; // STATUS green — project tile + done checkbox
const CHECKBOX = 24; // checkbox glyph box (wrapped in a 44x44 tap target)
const TAP = 44; // WCAG 2.1 AA minimum tap target

type DaySheetProps = {
	dayTs: number | null;
	projects: ProjectEvent[];
	tasks: TaskEvent[];
	onClose: () => void;
	onProjectPress: (id: Id<"projects">) => void;
	onCompleteTask: (id: Id<"tasks">) => void | Promise<void>;
	completedTaskIds: Set<Id<"tasks">>;
	updating: Set<Id<"tasks">>;
};

// Presentational day-sheet content, hosted by the /day-sheet form-sheet route
// (same native sheet type as /org-switch). The ROUTE owns the getCalendarEvents
// data, the tasks.complete mutation, and the optimistic Sets; DaySheet buckets
// the full day arrays internally via tasksOnDay/projectsOnDay.
// OWNERSHIP CONTRACT: the project row emits onProjectPress ONLY — it never calls
// onClose. The route dismisses the sheet AND navigates. Only the X button calls onClose.
export function DaySheet({
	dayTs,
	projects,
	tasks,
	onClose,
	onProjectPress,
	onCompleteTask,
	completedTaskIds,
	updating,
}: DaySheetProps) {
	const t = useTokens();

	const day = dayTs != null ? new Date(dayTs) : null;
	const dayProjects = day ? projectsOnDay(projects, day) : [];
	const dayTasks = day ? tasksOnDay(tasks, day) : [];
	const isEmpty = dayProjects.length === 0 && dayTasks.length === 0;

	const headerLabel = day
		? day.toLocaleDateString("en-US", {
				weekday: "long",
				month: "long",
				day: "numeric",
			})
		: "";

	return (
		<View style={styles.sheet}>
			<View style={styles.grabber}>
				<View style={[styles.grabberBar, { backgroundColor: t.line }]} />
			</View>

			{/* Header — full date + accessible X close (icon-only -> label REQUIRED) */}
			<View style={[styles.header, { borderBottomColor: t.line }]}>
				<Text style={[styles.headerTitle, { color: t.ink }]}>
					{headerLabel}
				</Text>
				<Pressable
					onPress={onClose}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Close"
					style={styles.closeBtn}
				>
					<X size={22} color={t.sub} />
				</Pressable>
			</View>

			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
			>
				{/* Projects FIRST when present. Row emits onProjectPress only. */}
				{dayProjects.length > 0 && (
					<View style={styles.section}>
						<Text style={[styles.eyebrow, { color: t.faint }]}>Projects</Text>
						{dayProjects.map((p) => {
							const start = new Date(p.startDate).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							});
							const end =
								p.endDate != null
									? new Date(p.endDate).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
										})
									: null;
							const dates = end && end !== start ? `${start} – ${end}` : start;
							const sub = p.clientName ? `${p.clientName} · ${dates}` : dates;
							return (
								<Pressable
									key={p.id}
									onPress={() => onProjectPress(p.id as Id<"projects">)}
									style={({ pressed }) => [
										styles.row,
										{ borderBottomColor: t.line },
										pressed && styles.pressed,
									]}
								>
									<View
										style={[
											styles.tile,
											{ backgroundColor: PROJECT_GREEN + "14" },
										]}
									>
										<Folder size={20} color={PROJECT_GREEN} />
									</View>
									<View style={styles.rowBody}>
										<Text
											style={[styles.rowTitle, { color: t.ink }]}
											numberOfLines={1}
										>
											{p.title}
										</Text>
										<Text
											style={[styles.rowSub, { color: t.sub }]}
											numberOfLines={1}
										>
											{sub}
										</Text>
									</View>
									<ChevronRight size={18} color={t.faint} />
								</Pressable>
							);
						})}
					</View>
				)}

				{/* Tasks AFTER projects. Checkbox -> onCompleteTask; never closes.
						    getCalendarEvents returns ALL statuses, so a just-completed
						    task stays visible here with completed styling. */}
				{dayTasks.length > 0 && (
					<View style={styles.section}>
						<Text style={[styles.eyebrow, { color: t.faint }]}>Tasks</Text>
						{dayTasks.map((task) => {
							const id = task.id as Id<"tasks">;
							const done =
								completedTaskIds.has(id) || task.status === "completed";
							const isUpdating = updating.has(id);
							const sub = [task.startTime, task.clientName]
								.filter(Boolean)
								.join(" · ");
							return (
								<View
									key={task.id}
									style={[styles.row, { borderBottomColor: t.line }]}
								>
									<Pressable
										onPress={() => onCompleteTask(id)}
										disabled={isUpdating}
										hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
										accessibilityRole="checkbox"
										accessibilityState={{ checked: done }}
										accessibilityLabel={
											done ? "Mark task incomplete" : "Complete task"
										}
										style={styles.checkTap}
									>
										<View
											style={[
												styles.checkbox,
												done
													? {
															backgroundColor: PROJECT_GREEN,
															borderColor: PROJECT_GREEN,
														}
													: { borderColor: "#cbd3de" },
												isUpdating && styles.checkboxPending,
											]}
										>
											{done ? (
												<Check size={15} color="#ffffff" strokeWidth={3} />
											) : null}
										</View>
									</Pressable>
									<View style={styles.rowBody}>
										<Text
											style={[
												styles.rowTitle,
												{ color: done ? t.faint : t.ink },
												done && styles.strike,
											]}
											numberOfLines={1}
										>
											{task.title}
										</Text>
										{sub ? (
											<Text
												style={[styles.rowSub, { color: t.sub }]}
												numberOfLines={1}
											>
												{sub}
											</Text>
										) : null}
									</View>
								</View>
							);
						})}
					</View>
				)}

				{/* Empty state — both sections empty. */}
				{isEmpty && (
					<View style={styles.empty}>
						<View style={[styles.emptyTile, { backgroundColor: t.muted }]}>
							<Calendar size={26} color={t.faint} />
						</View>
						<Text style={[styles.emptyTitle, { color: t.ink }]}>
							Nothing scheduled
						</Text>
						<Text style={[styles.emptyBody, { color: t.sub }]}>
							No tasks or projects on this day.
						</Text>
					</View>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	sheet: {
		flex: 1,
	},
	grabber: {
		alignItems: "center",
		paddingTop: 8,
		paddingBottom: 4,
	},
	grabberBar: {
		width: 40,
		height: 4,
		borderRadius: 999,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingTop: 4,
		paddingBottom: 12,
		borderBottomWidth: 1,
	},
	headerTitle: {
		fontSize: 18,
		fontFamily: fontFamily.semibold,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 8,
	},
	scroll: {
		flex: 1,
	},
	scrollContent: {
		paddingHorizontal: 16,
		paddingTop: 4,
	},
	section: {
		marginTop: 12,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.7,
		textTransform: "uppercase",
		marginBottom: 4,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	pressed: {
		opacity: 0.7,
	},
	tile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	rowBody: {
		flex: 1,
		minWidth: 0,
	},
	rowTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 15,
	},
	rowSub: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 2,
	},
	strike: {
		textDecorationLine: "line-through",
	},
	checkTap: {
		width: TAP,
		height: TAP,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: -10,
		marginVertical: -10,
	},
	checkbox: {
		width: CHECKBOX,
		height: CHECKBOX,
		borderRadius: 7,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxPending: {
		opacity: 0.5,
	},
	empty: {
		alignItems: "center",
		paddingVertical: 56,
		paddingHorizontal: 24,
	},
	emptyTile: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	emptyTitle: {
		fontSize: 16,
		fontFamily: fontFamily.semibold,
		marginBottom: 4,
	},
	emptyBody: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
});
