import { useOfflinePartition } from "@/lib/offline/partition-context";
import {
	View,
	Text,
	Alert,
	ActivityIndicator,
	Animated,
	Pressable,
	StyleSheet,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { showToast } from "@/lib/toast";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ChevronDown, X } from "lucide-react-native";
import { colors, fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { FieldMenu } from "@/components/FieldMenu";
import { AppCalendar } from "@/components/AppCalendar";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { utcMsFromDateId, todayDateId, dateIdFromUtcMs } from "@/lib/date";
import { recordRecentView } from "@/lib/recents";
import { formatTaskDate } from "@/lib/work-search";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { canWith } from "@/lib/use-permissions";
import { saveOffline, useOnlineAction, useOpenOps } from "@/lib/offline/hooks";
import { overlayTaskOps, planTaskUpdate } from "@/lib/offline/field-patch";
import { CreateSheet, SheetActions, SheetField, SheetInput } from "@/components/sheets/create-sheet";

const TYPE_OPTIONS = [
	{ value: "external", label: "External" },
	{ value: "internal", label: "Internal" },
];
const STATUS_OPTIONS = [
	{ value: "pending", label: "Pending" },
	{ value: "in-progress", label: "In progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];
const REPEAT_OPTIONS = [
	{ value: "none", label: "None" },
	{ value: "daily", label: "Daily" },
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "yearly", label: "Yearly" },
];

// Off-screen start distance for the calendar slide-up (>= sheet height).
const SHEET_SLIDE = 600;

type TaskType = "external" | "internal";
type TaskStatus = "pending" | "in-progress" | "completed" | "cancelled";
type TaskRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

function labelFor(
	options: { value: string; label: string }[],
	value: string,
	fallback: string
): string {
	return options.find((o) => o.value === value)?.label ?? fallback;
}

function formatDateLabel(dateId: string): string {
	const d = new Date(utcMsFromDateId(dateId));
	return d.toLocaleDateString("en-US", {
		timeZone: "UTC",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export default function TaskFormSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const params = useLocalSearchParams<{
		taskId?: string;
		clientId?: string;
		projectId?: string;
	}>();
	const isEdit = !!params.taskId;

	const serverTask = useCachedQuery(
		api.tasks.get,
		params.taskId ? { id: params.taskId as Id<"tasks"> } : "skip"
	);
	// Queued edits are the base for the next edit, or a second offline save conflicts on replay.
	const pendingOps = useOpenOps(params.taskId ? `task:${params.taskId}` : "none");
	const task = useMemo(
		() => (serverTask ? overlayTaskOps(serverTask, pendingOps) : serverTask),
		[serverTask, pendingOps],
	);
	const taskLoading = isEdit && task === undefined;
	const taskMissing = isEdit && task === null;

	// Form state
	const [type, setType] = useState<TaskType>("external");
	const [title, setTitle] = useState("");
	const [titleTouched, setTitleTouched] = useState(false);
	const [description, setDescription] = useState("");
	const [clientId, setClientId] = useState<Id<"clients"> | "">(
		(params.clientId as Id<"clients">) || ""
	);
	const [projectId, setProjectId] = useState<Id<"projects"> | "">(
		(params.projectId as Id<"projects">) || ""
	);
	const [dateId, setDateId] = useState<string>(todayDateId());
	const [assigneeUserId, setAssigneeUserId] = useState<Id<"users"> | "">("");
	const [status, setStatus] = useState<TaskStatus>("pending");
	const [repeat, setRepeat] = useState<TaskRepeat>("none");
	const [repeatUntilId, setRepeatUntilId] = useState<string | undefined>(
		undefined
	);

	// In-flight flags
	const [submitting, setSubmitting] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Calendar overlay open flags (date fields keep the sheet calendar)
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const [repeatUntilPickerOpen, setRepeatUntilPickerOpen] = useState(false);

	// Init sentinel (mirror web prevInitKey) — seed once when edit task loads.
	// Render-safe setState-during-render pattern (not a ref) so re-renders don't clobber edits.
	const [appliedKey, setAppliedKey] = useState<string | null>(null);
	const initKey = `${isEdit}|${task?._id ?? ""}|${task?.date ?? ""}|${params.clientId ?? ""}|${params.projectId ?? ""}`;
	if (initKey !== appliedKey) {
		if (isEdit && task) {
			setAppliedKey(initKey);
			const loadedType: TaskType = task.type === "internal" ? "internal" : "external";
			setType(loadedType);
			setTitle(task.title);
			setDescription(task.description || "");
			// Internal tasks have no client/project regardless of any stale ids on the doc.
			setClientId(loadedType === "internal" ? "" : (task.clientId || ""));
			setProjectId(loadedType === "internal" ? "" : (task.projectId || ""));
			setDateId(dateIdFromUtcMs(task.date));
			setAssigneeUserId(task.assigneeUserId || "");
			setStatus(task.status as TaskStatus);
			setRepeat((task.repeat || "none") as TaskRepeat);
			setRepeatUntilId(
				task.repeatUntil ? dateIdFromUtcMs(task.repeatUntil) : undefined
			);
		} else if (!isEdit) {
			setAppliedKey(initKey);
		}
	}

	// On-device "Recently viewed" trail for the Work tab (Slice 6). Edit only —
	// a task being created has nothing to remember yet.
	const recentsScope = useOfflinePartition() ?? undefined;
	const recentId = isEdit ? task?._id : undefined;
	const recentTitle = task?.title;
	const recentSub = task ? formatTaskDate(task.date) : undefined;
	useEffect(() => {
		if (!recentId || !recentTitle) return;
		recordRecentView(recentsScope, {
			kind: "task",
			id: recentId,
			title: recentTitle,
			sub: recentSub,
		});
	}, [recentsScope, recentId, recentTitle, recentSub]);

	// Queries
	const perms = useCachedQuery(api.permissions.myPermissions, {});
	// A role without client access can only file internal tasks; clients.list would throw.
	const viewClients = canWith(perms, "clients");
	const clientsLocked = perms !== undefined && !viewClients;
	if (clientsLocked && !isEdit && type === "external") setType("internal");
	const clients = useCachedQuery(api.clients.list, viewClients ? {} : "skip");
	const projects = useCachedQuery(
		api.projects.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const users = useCachedQuery(api.users.listByOrg, {});

	// Mutations — create/delete are out of offline scope (Tier 2 covers only
	// edits to an already-existing task), so they stay online-gated.
	const createTask = useMutation(api.tasks.create);
	const removeTask = useMutation(api.tasks.remove);
	const onlineAction = useOnlineAction();

	const clientOptions = (clients ?? []).map((c) => ({
		value: c._id,
		label: c.companyName,
	}));
	const projectOptions = (projects ?? []).map((p) => ({
		value: p._id,
		label: p.title,
	}));
	const assigneeOptions = (users ?? []).map((u) => ({
		value: u._id,
		label: u.name || u.email,
	}));

	const saveDisabled =
		!title.trim() ||
		(type === "external" && !clientId) ||
		(repeat !== "none" && !repeatUntilId) ||
		submitting ||
		deleting ||
		taskLoading ||
		taskMissing;

	const buildEdited = () => ({
		title: title.trim(),
		description: description.trim() || undefined,
		type,
		clientId:
			type === "external" && clientId ? (clientId as Id<"clients">) : undefined,
		projectId:
			type === "external" && projectId ? (projectId as Id<"projects">) : undefined,
		date: utcMsFromDateId(dateId),
		assigneeUserId: assigneeUserId ? (assigneeUserId as Id<"users">) : undefined,
		status,
		repeat,
		repeatUntil:
			repeat !== "none" && repeatUntilId
				? utcMsFromDateId(repeatUntilId)
				: undefined,
	});

	// Edit mode: no direct mutation. A completing status change queues as
	// `tasks.complete`; any other changed fields queue as a `tasks.update`
	// patch with `expectedValues` from the task as loaded.
	const saveEdit = async () => {
		if (!params.taskId || !task) return;
		setSubmitting(true);
		try {
			const id = params.taskId as Id<"tasks">;
			const edited = buildEdited();
			const loaded = {
				title: task.title,
				description: task.description,
				type: task.type,
				clientId: task.clientId,
				projectId: task.projectId,
				date: task.date,
				assigneeUserId: task.assigneeUserId,
				status: task.status,
				repeat: task.repeat,
				repeatUntil: task.repeatUntil,
			};
			const plan = planTaskUpdate(loaded, edited);
			let ok = true;
			if (plan.completeOp) {
				ok = await saveOffline(
					"tasks.complete",
					{ id },
					{ display: { title: `Complete: ${edited.title}` } }
				);
			}
			if (ok && Object.keys(plan.patch).length > 0) {
				ok = await saveOffline(
					"tasks.update",
					{ id, ...plan.patch, expectedValues: plan.expectedValues },
					{ display: { title: `Update: ${edited.title}` } }
				);
			}
			if (ok) router.back();
		} finally {
			setSubmitting(false);
		}
	};

	// Create mode: out of offline scope — needs a connection.
	const saveCreate = () =>
		onlineAction("Creating a task", async () => {
			setSubmitting(true);
			try {
				const created = buildEdited();
				await createTask(created);
				router.back();
				showToast(`Task added: ${created.title}`);
			} catch {
				Alert.alert(
					"Couldn't save your task",
					"Check your connection and try again."
				);
			} finally {
				setSubmitting(false);
			}
		});

	const handleSave = () => {
		if (submitting) return;
		if (saveDisabled) return;
		if (isEdit) void saveEdit();
		else saveCreate();
	};

	const handleDelete = () => {
		Alert.alert("Delete this task?", "This can't be undone.", [
			{ text: "Keep task", style: "cancel" },
			{
				text: "Delete task",
				style: "destructive",
				// Deletes are out of offline scope — needs a connection.
				onPress: () =>
					onlineAction("Deleting this task", async () => {
						if (deleting) return;
						setDeleting(true);
						try {
							await removeTask({ id: params.taskId as Id<"tasks"> });
							router.back();
						} catch {
							Alert.alert("Couldn't delete that task", "Try again.");
						} finally {
							setDeleting(false);
						}
					}),
			},
		]);
	};

	return (
		<CreateSheet
			kind="task"
			title={isEdit ? "Edit task" : "New task"}
			onClose={() => router.back()}
			footer={
				taskLoading ? undefined : taskMissing ? (
					<Button title="Close" variant="secondary" onPress={() => router.back()} />
				) : isEdit ? (
					<SheetActions>
						<Button
							title="Delete"
							variant="destructive"
							onPress={handleDelete}
							disabled={deleting || submitting}
							style={styles.deleteAction}
							icon={
								deleting ? <ActivityIndicator size="small" color={t.danger} /> : undefined
							}
						/>
						<Button
							title="Save"
							onPress={handleSave}
							disabled={saveDisabled}
							style={styles.saveAction}
							icon={
								submitting ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : undefined
							}
						/>
					</SheetActions>
				) : (
					<Button
						title="Add task"
						onPress={handleSave}
						disabled={saveDisabled}
						icon={submitting ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : undefined}
					/>
				)
			}
			overlay={
				<>
					<CalendarOverlay
						visible={datePickerOpen}
						selectedDate={dateId}
						onSelect={(id) => {
							setDateId(id);
							setDatePickerOpen(false);
						}}
						onClose={() => setDatePickerOpen(false)}
						title="Select date"
						t={t}
						insets={insets}
					/>
					<CalendarOverlay
						visible={repeatUntilPickerOpen}
						selectedDate={repeatUntilId}
						minDate={dateId}
						onSelect={(id) => {
							setRepeatUntilId(id);
							setRepeatUntilPickerOpen(false);
						}}
						onClose={() => setRepeatUntilPickerOpen(false)}
						title="Repeat until"
						t={t}
						insets={insets}
					/>
				</>
			}
		>
			{taskLoading ? (
				<View style={styles.state}>
					<ActivityIndicator size="small" color={t.primary} />
					<Text style={[styles.stateText, { color: t.sub }]}>Loading task...</Text>
				</View>
			) : taskMissing ? (
				<View style={styles.state}>
					<Text style={[styles.stateTitle, { color: t.ink }]}>Task not found</Text>
					<Text style={[styles.stateText, { color: t.sub }]}>
						This task may have been deleted.
					</Text>
				</View>
			) : (
				<>
					{clientsLocked ? null : (
						<SheetField label="Type">
							<FieldMenu
								title="Task type"
								value={type}
								options={TYPE_OPTIONS}
								label={labelFor(TYPE_OPTIONS, type, "External")}
								onSelect={(next) => {
									const nextType = next as TaskType;
									setType(nextType);
									if (nextType === "internal") {
										setClientId("");
										setProjectId("");
									}
								}}
							/>
						</SheetField>
					)}

					<SheetField label="Title" error={titleTouched && !title.trim() ? "Title is required." : null}>
						<SheetInput
							value={title}
							onChangeText={setTitle}
							onBlur={() => setTitleTouched(true)}
							placeholder="What needs doing?"
							invalid={titleTouched && !title.trim()}
						/>
					</SheetField>

					<SheetField label="Description" hint="Optional">
						<SheetInput
							value={description}
							onChangeText={setDescription}
							placeholder="Add a few details"
							multiline
						/>
					</SheetField>

					{type === "external" ? (
						<>
							<SheetField
								label="Client"
								hint={!clientId ? "Choose a client for an external task." : undefined}
							>
								<FieldMenu
									title="Select client"
									value={clientId}
									options={clientOptions}
									label={
										clientId
											? labelFor(clientOptions, clientId, "Select a client")
											: "Select a client"
									}
									placeholder={!clientId}
									onSelect={(next) => {
										setClientId(next as Id<"clients">);
										setProjectId(""); // client change clears staged project
									}}
								/>
							</SheetField>

							<SheetField label="Project">
								<FieldMenu
									title="Select project"
									value={projectId}
									options={projectOptions}
									label={
										projectId
											? labelFor(projectOptions, projectId, "No project")
											: "No project"
									}
									placeholder={!projectId}
									disabled={!clientId}
									onSelect={(next) => setProjectId(next as Id<"projects">)}
								/>
							</SheetField>
						</>
					) : null}

					<SheetField label="Date">
						<SelectRow
							label={formatDateLabel(dateId)}
							onPress={() => setDatePickerOpen(true)}
							t={t}
						/>
					</SheetField>

					<SheetField label="Assignee">
						<FieldMenu
							title="Assignee"
							value={assigneeUserId}
							options={assigneeOptions}
							label={
								assigneeUserId
									? labelFor(assigneeOptions, assigneeUserId, "Unassigned")
									: "Unassigned"
							}
							placeholder={!assigneeUserId}
							onSelect={(next) => setAssigneeUserId(next as Id<"users">)}
						/>
					</SheetField>

					<SheetField label="Status">
						<FieldMenu
							title="Status"
							value={status}
							options={STATUS_OPTIONS}
							label={labelFor(STATUS_OPTIONS, status, "Pending")}
							onSelect={(next) => setStatus(next as TaskStatus)}
						/>
					</SheetField>

					<SheetField label="Repeat">
						<FieldMenu
							title="Repeat"
							value={repeat}
							options={REPEAT_OPTIONS}
							label={labelFor(REPEAT_OPTIONS, repeat, "None")}
							onSelect={(next) => {
								const nextRepeat = next as TaskRepeat;
								setRepeat(nextRepeat);
								if (nextRepeat === "none") setRepeatUntilId(undefined);
							}}
						/>
					</SheetField>

					{repeat !== "none" ? (
						<SheetField
							label="Repeat until"
							hint={!repeatUntilId ? "Choose a date the repeat ends." : undefined}
						>
							<SelectRow
								label={
									repeatUntilId ? formatDateLabel(repeatUntilId) : "Select end date"
								}
								placeholder={!repeatUntilId}
								onPress={() => setRepeatUntilPickerOpen(true)}
								t={t}
							/>
						</SheetField>
					) : null}
				</>
			)}
		</CreateSheet>
	);
}

function SelectRow({
	label,
	onPress,
	t,
	placeholder,
	disabled,
}: {
	label: string;
	onPress: () => void;
	t: ReturnType<typeof useTokens>;
	placeholder?: boolean;
	disabled?: boolean;
}) {
	return (
		<Pressable
			onPress={disabled ? undefined : onPress}
			disabled={disabled}
			accessibilityRole="button"
			style={[
				styles.select,
				{
					borderColor: t.input,
					backgroundColor: t.card,
					opacity: disabled ? 0.5 : 1,
				},
			]}
		>
			<Text
				style={[styles.selectText, { color: placeholder ? t.sub : t.ink }]}
				numberOfLines={1}
			>
				{label}
			</Text>
			<ChevronDown size={18} color={t.sub} />
		</Pressable>
	);
}

function CalendarOverlay({
	visible,
	selectedDate,
	minDate,
	onSelect,
	onClose,
	title,
	t,
	insets,
}: {
	visible: boolean;
	selectedDate?: string;
	minDate?: string;
	onSelect: (dateId: string) => void;
	onClose: () => void;
	title: string;
	t: ReturnType<typeof useTokens>;
	insets: { bottom: number };
}) {
	// In-sheet overlay instead of a nested RN <Modal>: a transparent Modal
	// presented from inside an Expo Router formSheet deadlocks touch handling
	// on iOS after a SwiftUI menu (FieldMenu) interaction. A plain absolute
	// overlay stays in the RN hierarchy, so there's no cross-window conflict.
	const { mounted, progress } = useOverlayTransition(visible);
	if (!mounted) return null;
	const translateY = progress.interpolate({
		inputRange: [0, 1],
		outputRange: [SHEET_SLIDE, 0],
	});
	return (
		<View style={styles.overlay}>
			<Animated.View style={[styles.backdrop, { opacity: progress }]} pointerEvents="none" />
			<Pressable
				style={StyleSheet.absoluteFill}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel="Close date picker"
			/>
			<Animated.View
				style={[
					styles.calendarSheet,
					{
						backgroundColor: t.card,
						paddingBottom: insets.bottom + 12,
						transform: [{ translateY }],
					},
				]}
			>
				<View style={[styles.grabber, { backgroundColor: t.line }]} />
				<View style={styles.calendarHeader}>
					<Text style={[styles.calendarTitle, { color: t.ink }]}>{title}</Text>
					<Pressable
						onPress={onClose}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
						style={styles.closeBtn}
					>
						<X size={20} color={t.sub} />
					</Pressable>
				</View>
				<View style={styles.calendarWrap}>
					<AppCalendar selectedDate={selectedDate} onDateSelect={onSelect} minDate={minDate} />
				</View>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	deleteAction: { flex: 1 },
	saveAction: { flex: 2 },
	state: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 48,
		gap: 8,
	},
	stateTitle: {
		fontSize: type.h4,
		fontFamily: fontFamily.semibold,
	},
	stateText: {
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
	select: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: radii.ctrl,
		minHeight: 44,
		paddingHorizontal: 12,
	},
	selectText: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 16,
		marginRight: 8,
	},
	overlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 10,
	},
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	calendarSheet: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: 2,
		marginTop: 8,
		marginBottom: 2,
	},
	calendarHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 12,
	},
	calendarTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 16,
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	calendarWrap: {
		paddingHorizontal: 16,
		paddingBottom: 8,
	},
});
