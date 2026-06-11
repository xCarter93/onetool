import {
	View,
	Text,
	TextInput,
	ScrollView,
	Pressable,
	Alert,
	ActivityIndicator,
	StyleSheet,
	Animated,
} from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { X, ChevronDown } from "lucide-react-native";
import { fontFamily, type, radii, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { FieldMenu } from "@/components/FieldMenu";
import { AppCalendar } from "@/components/AppCalendar";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { utcMsFromDateId, todayUtcDateId, dateIdFromUtcMs } from "@/lib/date";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";

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
	const { device } = useDevice();
	const params = useLocalSearchParams<{
		taskId?: string;
		clientId?: string;
		projectId?: string;
	}>();
	const isEdit = !!params.taskId;

	const task = useQuery(
		api.tasks.get,
		params.taskId ? { id: params.taskId as Id<"tasks"> } : "skip"
	);
	const taskLoading = isEdit && task === undefined;
	const taskMissing = isEdit && task === null;

	// Form state
	const [type, setType] = useState<TaskType>("external");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [clientId, setClientId] = useState<Id<"clients"> | "">(
		(params.clientId as Id<"clients">) || ""
	);
	const [projectId, setProjectId] = useState<Id<"projects"> | "">(
		(params.projectId as Id<"projects">) || ""
	);
	const [dateId, setDateId] = useState<string>(todayUtcDateId());
	const [assigneeUserId, setAssigneeUserId] = useState<Id<"users"> | "">("");
	const [status, setStatus] = useState<TaskStatus>("pending");
	const [repeat, setRepeat] = useState<TaskRepeat>("none");
	const [repeatUntilId, setRepeatUntilId] = useState<string | undefined>(
		undefined
	);

	// In-flight flags
	const [submitting, setSubmitting] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Calendar modal open flags (date fields keep the sheet calendar)
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

	// Queries
	const clients = useQuery(api.clients.list, {});
	const projects = useQuery(
		api.projects.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const users = useQuery(api.users.listByOrg);

	// Mutations
	const createTask = useMutation(api.tasks.create);
	const updateTask = useMutation(api.tasks.update);
	const removeTask = useMutation(api.tasks.remove);

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

	const handleSave = async () => {
		if (submitting) return;
		if (saveDisabled) return;
		setSubmitting(true);
		try {
			const date = utcMsFromDateId(dateId);
			const payload = {
				title: title.trim(),
				description: description.trim() || undefined,
				type,
				clientId:
					type === "external" && clientId
						? (clientId as Id<"clients">)
						: undefined,
				projectId:
					type === "external" && projectId
						? (projectId as Id<"projects">)
						: undefined,
				date,
				assigneeUserId: assigneeUserId
					? (assigneeUserId as Id<"users">)
					: undefined,
				status,
				repeat,
				repeatUntil:
					repeat !== "none" && repeatUntilId
						? utcMsFromDateId(repeatUntilId)
						: undefined,
			};
			if (isEdit && params.taskId) {
				await updateTask({ id: params.taskId as Id<"tasks">, ...payload });
			} else {
				await createTask(payload);
			}
			router.back();
		} catch {
			Alert.alert(
				"Couldn't save your task",
				"Check your connection and try again."
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleDelete = () => {
		Alert.alert("Delete this task?", "This can't be undone.", [
			{ text: "Keep task", style: "cancel" },
			{
				text: "Delete task",
				style: "destructive",
				onPress: async () => {
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
				},
			},
		]);
	};

	const headerTitle = isEdit ? "Edit task" : "New task";

	const content = (
		<>
			<View style={styles.header}>
				<View style={{ flex: 1 }} />
				<Text style={[styles.headerTitle, { color: t.ink }]}>
					{headerTitle}
				</Text>
				<View style={styles.headerAction}>
					<Pressable
						onPress={() => router.back()}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
						style={styles.closeBtn}
					>
						<X size={22} color={t.sub} />
					</Pressable>
				</View>
			</View>

			{taskLoading ? (
				<View style={styles.state}>
					<ActivityIndicator size="small" color={t.accent} />
					<Text style={[styles.stateText, { color: t.sub }]}>
						Loading task...
					</Text>
				</View>
			) : taskMissing ? (
				<View style={styles.state}>
					<Text style={[styles.stateTitle, { color: t.ink }]}>
						Task not found
					</Text>
					<Text style={[styles.stateText, { color: t.sub }]}>
						This task may have been deleted.
					</Text>
					<Button
						title="Close"
						variant="secondary"
						onPress={() => router.back()}
						style={styles.closeButton}
					/>
				</View>
			) : (
				<ScrollView
					style={{ flex: 1 }}
					contentContainerStyle={styles.body}
					keyboardShouldPersistTaps="handled"
				>
					{/* Type */}
					<FieldLabel text="Type" color={t.sub} />
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

					{/* Title */}
					<FieldLabel text="Title" color={t.sub} />
					<TextInput
						value={title}
						onChangeText={setTitle}
						placeholder="What needs doing?"
						placeholderTextColor={t.faint}
						style={[
							styles.input,
							{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
						]}
					/>
					{!title.trim() ? (
						<Text style={[styles.hint, { color: t.faint }]}>
							Title is required.
						</Text>
					) : null}

					{/* Description */}
					<FieldLabel text="Description" color={t.sub} />
					<TextInput
						value={description}
						onChangeText={setDescription}
						placeholder="Add a few details"
						placeholderTextColor={t.faint}
						style={[
							styles.input,
							styles.multiline,
							{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
						]}
						multiline
						textAlignVertical="top"
					/>

					{/* Client + Project — external only */}
					{type === "external" ? (
						<>
							<FieldLabel text="Client" color={t.sub} />
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
							{!clientId ? (
								<Text style={[styles.hint, { color: t.faint }]}>
									Choose a client for an external task.
								</Text>
							) : null}

							<FieldLabel text="Project" color={t.sub} />
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
						</>
					) : null}

					{/* Date */}
					<FieldLabel text="Date" color={t.sub} />
					<SelectRow
						label={formatDateLabel(dateId)}
						onPress={() => setDatePickerOpen(true)}
						t={t}
					/>

					{/* Assignee */}
					<FieldLabel text="Assignee" color={t.sub} />
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

					{/* Status */}
					<FieldLabel text="Status" color={t.sub} />
					<FieldMenu
						title="Status"
						value={status}
						options={STATUS_OPTIONS}
						label={labelFor(STATUS_OPTIONS, status, "Pending")}
						onSelect={(next) => setStatus(next as TaskStatus)}
					/>

					{/* Repeat */}
					<FieldLabel text="Repeat" color={t.sub} />
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

					{/* Repeat until — only when repeat != none */}
					{repeat !== "none" ? (
						<>
							<FieldLabel text="Repeat until" color={t.sub} />
							<SelectRow
								label={
									repeatUntilId
										? formatDateLabel(repeatUntilId)
										: "Select end date"
								}
								placeholder={!repeatUntilId}
								onPress={() => setRepeatUntilPickerOpen(true)}
								t={t}
							/>
							{!repeatUntilId ? (
								<Text style={[styles.hint, { color: t.faint }]}>
									Choose a date the repeat ends.
								</Text>
							) : null}
						</>
					) : null}

					{/* Submit */}
					<Button
						title={isEdit ? "Save changes" : "Create task"}
						onPress={handleSave}
						disabled={saveDisabled}
						icon={
							submitting ? (
								<ActivityIndicator size="small" color="#ffffff" />
							) : undefined
						}
						style={styles.submit}
					/>

					{/* Delete — edit mode only */}
					{isEdit ? (
						<Pressable
							onPress={handleDelete}
							disabled={deleting || submitting}
							style={styles.deleteBtn}
							accessibilityRole="button"
							accessibilityLabel="Delete task"
						>
							<Text
								style={[
									styles.deleteText,
									{ color: t.destructive, opacity: deleting || submitting ? 0.5 : 1 },
								]}
							>
								Delete task
							</Text>
						</Pressable>
					) : null}
				</ScrollView>
			)}

			{/* Date pickers (AppCalendar in an in-sheet overlay, not a Modal) */}
			<CalendarModal
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
			<CalendarModal
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
	);

	// iPad (Strategy B): centered card; maxHeight 92% so the tall form + keyboard
	// scroll within it and never clip (this is a 0.9,1.0 sheet on iPhone).
	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="92%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					{content}
				</View>
			</CenteredModal>
		);
	}

	// iPhone — existing bottom sheet, byte-identical.
	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom },
			]}
		>
			<View style={[styles.grabber, { backgroundColor: t.border }]} />
			{content}
		</View>
	);
}

function FieldLabel({ text, color }: { text: string; color: string }) {
	return <Text style={[styles.fieldLabel, { color }]}>{text}</Text>;
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
					borderColor: t.border,
					backgroundColor: t.card,
					opacity: disabled ? 0.5 : 1,
				},
			]}
		>
			<Text
				style={[styles.selectText, { color: placeholder ? t.faint : t.ink }]}
				numberOfLines={1}
			>
				{label}
			</Text>
			<ChevronDown size={18} color={t.sub} />
		</Pressable>
	);
}

function CalendarModal({
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
			<Animated.View
				style={[styles.backdrop, { opacity: progress }]}
				pointerEvents="none"
			/>
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
				<View style={[styles.grabber, { backgroundColor: t.border }]} />
				<View style={styles.header}>
					<View style={{ flex: 1 }} />
					<Text style={[styles.headerTitle, { color: t.ink }]}>{title}</Text>
					<View style={styles.headerAction}>
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
				</View>
				<View style={styles.calendarWrap}>
					<AppCalendar
						selectedDate={selectedDate}
						onDateSelect={onSelect}
						minDate={minDate}
					/>
				</View>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + maxHeight bound).
	padCard: {
		flexShrink: 1,
		paddingTop: 18,
	},
	overlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 10,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 12,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 12,
	},
	headerTitle: {
		flex: 2,
		textAlign: "center",
		fontSize: type.h2,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	headerAction: {
		flex: 1,
		alignItems: "flex-end",
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	state: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
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
	closeButton: {
		marginTop: 8,
		minWidth: 140,
	},
	body: {
		paddingHorizontal: 20,
		paddingBottom: 32,
	},
	fieldLabel: {
		fontSize: type.sm,
		fontFamily: fontFamily.semibold,
		marginTop: 16,
		marginBottom: 8,
	},
	input: {
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: type.h4,
		fontFamily: fontFamily.regular,
	},
	multiline: {
		minHeight: 96,
	},
	select: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 14,
		paddingVertical: 14,
	},
	selectText: {
		flex: 1,
		fontSize: type.h4,
		fontFamily: fontFamily.regular,
		marginRight: 8,
	},
	hint: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		marginTop: 6,
	},
	submit: {
		marginTop: 28,
	},
	deleteBtn: {
		marginTop: 16,
		alignItems: "center",
		paddingVertical: 12,
	},
	deleteText: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
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
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	calendarWrap: {
		paddingHorizontal: 16,
		paddingBottom: 8,
	},
});
