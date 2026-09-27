import { useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { CalendarDays, X } from "lucide-react-native";
import { colors, fontFamily, radii, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { AppCalendar } from "@/components/AppCalendar";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { ClientPicker } from "@/components/create/client-picker";
import { usePermissions } from "@/lib/use-permissions";
import { hapticSuccess } from "@/lib/haptics";
import { describeMutationError } from "@/lib/mutation-error";
import { utcMsFromDateId } from "@/lib/date";
import { useOnlineAction } from "@/lib/offline/hooks";
import { CreateSheet, SheetField, SheetInput } from "@/components/sheets/create-sheet";

// Fast-capture project create (Slice 5 speed-dial). Deliberately minimal —
// client, title, optional start date. Status and type mirror web's minimal
// new-project path ("planned" / "one-off"); everything else is edited on the
// detail screen the create lands on.
const DEFAULT_STATUS = "planned" as const;
const DEFAULT_PROJECT_TYPE = "one-off" as const;

// Off-screen start distance for the calendar slide-up (>= sheet height).
const SHEET_SLIDE = 600;

function formatDateLabel(dateId: string): string {
	return new Date(utcMsFromDateId(dateId)).toLocaleDateString("en-US", {
		timeZone: "UTC",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export default function NewProjectSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { can, isLoading: permsLoading } = usePermissions();
	const onlineAction = useOnlineAction();
	const params = useLocalSearchParams<{ clientId?: string }>();

	// Preselect the client when pushed from a client detail screen
	// ("/project/new?clientId=…") — initializer form, no setState-in-effect.
	const [clientId, setClientId] = useState<Id<"clients"> | "">(
		(params.clientId as Id<"clients">) || ""
	);
	// Arriving with a client means the picker has nothing to ask — it renders
	// read-only and the sheet opens on Title.
	const clientLocked = !!params.clientId;
	const [title, setTitle] = useState("");
	const [startDateId, setStartDateId] = useState<string | undefined>(undefined);
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<{
		message: string;
		planLimit: boolean;
	} | null>(null);

	const createProject = useMutation(api.projects.create);
	// Reactive and NOT gated on: a single property is a convenience, not a
	// prerequisite. Read whatever has arrived at submit time.
	const properties = useQuery(
		api.clientProperties.listByClient,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);

	const canCreate = can("projects", "modify");
	const valid = !!clientId && title.trim().length > 0;

	const submit = async () => {
		if (!valid || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			const propertyId =
				properties && properties.length === 1 ? properties[0]._id : undefined;
			const projectId = (await createProject({
				clientId: clientId as Id<"clients">,
				propertyId,
				title: title.trim(),
				status: DEFAULT_STATUS,
				projectType: DEFAULT_PROJECT_TYPE,
				startDate: startDateId ? utcMsFromDateId(startDateId) : undefined,
			})) as Id<"projects">;
			hapticSuccess();
			router.replace(`/projects/${projectId}`);
		} catch (err) {
			setError(
				describeMutationError(
					err,
					"Couldn't create that project. Check your connection and try again."
				)
			);
		} finally {
			setSubmitting(false);
		}
	};

	// `can` is false while permissions resolve, so wait before hiding — otherwise
	// every open flashes an empty sheet. Once it resolves to "no", leave rather
	// than sitting on a blank sheet the user can't dismiss.
	if (!permsLoading && !canCreate) return <Redirect href="/projects" />;

	return (
		<CreateSheet
			kind="project"
			title="New project"
			onClose={() => router.back()}
			footer={
				<Button
					title="Create project"
					onPress={() => onlineAction("Creating a project", submit)}
					disabled={!valid || submitting}
					icon={
						submitting ? (
							<ActivityIndicator size="small" color={colors.primaryForeground} />
						) : undefined
					}
				/>
			}
			overlay={
				<CalendarOverlay
					visible={datePickerOpen}
					selectedDate={startDateId}
					onSelect={(id) => {
						setStartDateId(id);
						setDatePickerOpen(false);
					}}
					onClose={() => setDatePickerOpen(false)}
					t={t}
					insets={insets}
				/>
			}
		>
			<SheetField label="Client">
				<ClientPicker
					value={clientId}
					onChange={setClientId}
					allowQuickAdd={!clientLocked && can("clients", "modify")}
					locked={clientLocked}
				/>
			</SheetField>

			<SheetField label="Project">
				<SheetInput
					value={title}
					onChangeText={setTitle}
					placeholder="What's the job?"
					accessibilityLabel="Project title"
				/>
			</SheetField>

			<SheetField label="Start date" hint="Optional">
				<Pressable
					onPress={() => setDatePickerOpen(true)}
					accessibilityRole="button"
					accessibilityLabel="Choose a start date"
					style={[styles.select, { borderColor: t.input, backgroundColor: t.card }]}
				>
					<Text
						style={[styles.selectText, { color: startDateId ? t.ink : t.sub }]}
						numberOfLines={1}
					>
						{startDateId ? formatDateLabel(startDateId) : "Optional"}
					</Text>
					{startDateId ? (
						<Pressable
							onPress={() => setStartDateId(undefined)}
							hitSlop={10}
							accessibilityRole="button"
							accessibilityLabel="Clear start date"
						>
							<X size={16} color={t.sub} />
						</Pressable>
					) : (
						<CalendarDays size={18} color={t.sub} />
					)}
				</Pressable>
			</SheetField>

			{error ? (
				<Text style={[styles.error, { color: t.danger }]}>{error.message}</Text>
			) : null}
		</CreateSheet>
	);
}

/**
 * In-sheet calendar overlay — a nested RN <Modal> inside an Expo Router
 * formSheet deadlocks iOS touch handling (see tasks/form.tsx), so this stays a
 * plain absolute overlay in the RN hierarchy.
 */
function CalendarOverlay({
	visible,
	selectedDate,
	onSelect,
	onClose,
	t,
	insets,
}: {
	visible: boolean;
	selectedDate?: string;
	onSelect: (dateId: string) => void;
	onClose: () => void;
	t: ReturnType<typeof useTokens>;
	insets: { bottom: number };
}) {
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
					<Text style={[styles.calendarTitle, { color: t.ink }]}>Start date</Text>
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
					<AppCalendar selectedDate={selectedDate} onDateSelect={onSelect} />
				</View>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
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
	error: {
		fontFamily: fontFamily.medium,
		fontSize: 12.5,
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
