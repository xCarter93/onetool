import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	Pressable,
	StyleSheet,
	TouchableOpacity,
	Animated,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, shadow, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { Badge, Card, Eyebrow, ListRow, Ring, SectionHeader } from "@/components/ui";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { MentionModal } from "@/components/MentionModal";
import { ProjectDocuments } from "@/components/ProjectDocuments";
import { AppCalendar, toDateId, fromDateId } from "@/components/AppCalendar";
import { Building2, MessageSquare, X } from "lucide-react-native";

const STATUS_OPTIONS = [
	{ value: "planned", label: "Planned" },
	{ value: "in-progress", label: "In Progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];

type DateField = "startDate" | "endDate";

function formatDate(timestamp: number | undefined): string | null {
	if (!timestamp) return null;
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function KV({
	label,
	value,
	onPress,
}: {
	label: string;
	value: string;
	onPress?: () => void;
}) {
	const t = useTokens();
	const body = (
		<View style={styles.kvRow}>
			<Text style={[styles.kvLabel, { color: t.faint }]}>{label}</Text>
			<Text style={[styles.kvValue, { color: t.ink }]}>{value}</Text>
		</View>
	);
	if (!onPress) return body;
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.kvEditable,
				{ borderBottomColor: t.faint },
				pressed && styles.pressed,
			]}
			accessibilityRole="button"
			accessibilityLabel={`Edit ${label}`}
		>
			{body}
		</Pressable>
	);
}

// Body extracted (P26 Option B). headerMode DEFAULTS to "root" → the iPhone
// route wrapper below stays byte-identical. The iPad pane passes "pane".
export function ProjectDetailBody({
	id,
	headerMode = "root",
	onBack,
}: {
	id: string;
	headerMode?: "root" | "pane";
	// See ClientDetailBody — onBack clears the shell selection (router.back would
	// pop out of the shell); keeps one header per pane.
	onBack?: () => void;
}) {
	const projectId = id;
	const router = useRouter();
	const t = useTokens();
	// iPad: cross-links navigate via the shell selection (no router.push to a
	// (tabs) sibling, which slides the whole shell). iPhone: null → router.push.
	const shellNav = useShellNav();
	// In an iPad pane the header is a PaneHeader (onBack clears the shell
	// selection; router.back would pop out of the shell). onBack is undefined in
	// landscape (list always visible → no back button).
	const isPane = headerMode === "pane";
	const appHeaderMode = headerMode === "pane" ? "pane" : "detail";
	const [refreshing, setRefreshing] = useState(false);
	const [dateField, setDateField] = useState<DateField | null>(null);
	const [mentionVisible, setMentionVisible] = useState(false);

	// Animated date overlay. `shownField` is set when opening (not cleared on
	// close) so the header/selection don't flip while the sheet slides out.
	const { mounted: dateMounted, progress: dateProgress } =
		useOverlayTransition(dateField !== null);
	const [shownField, setShownField] = useState<DateField | null>(null);
	const openDatePicker = useCallback((field: DateField) => {
		setShownField(field);
		setDateField(field);
	}, []);

	const updateProject = useMutation(api.projects.update);

	const project = useQuery(
		api.projects.get,
		projectId ? { id: projectId as Id<"projects"> } : "skip"
	);
	const clients = useQuery(api.clients.list, {});
	const quotes = useQuery(
		api.quotes.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);
	const invoices = useQuery(
		api.invoices.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);
	const tasks = useQuery(
		api.tasks.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);

	// Single org-scoped clients query → name lookup. No per-row clients.get (N+1).
	const clientNameById = useMemo(
		() =>
			new Map<Id<"clients">, string>(
				(clients ?? []).map((c) => [c._id, c.companyName])
			),
		[clients]
	);

	// Optional task progress — only render when tasks.list cleanly supplies it.
	const taskProgress = useMemo(() => {
		if (!tasks || tasks.length === 0) return null;
		const total = tasks.length;
		const done = tasks.filter((tk) => tk.status === "completed").length;
		return { done, total, pct: Math.round((done / total) * 100) };
	}, [tasks]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	// Send ONLY the edited field — projects.update throws on zero updates (Pitfall 3).
	const saveField = useCallback(
		async (field: "title" | "description", value: string) => {
			if (!projectId) return;
			await updateProject({ id: projectId as Id<"projects">, [field]: value });
		},
		[projectId, updateProject]
	);

	const handleStatusSelect = useCallback(
		async (next: string) => {
			if (!projectId) return;
			try {
				await updateProject({
					id: projectId as Id<"projects">,
					status: next as
						| "planned"
						| "in-progress"
						| "completed"
						| "cancelled",
				});
			} catch (error) {
				console.error("Failed to update status:", error);
			}
		},
		[projectId, updateProject]
	);

	const handleDateSelect = useCallback(
		async (dateId: string) => {
			if (!projectId || !dateField) return;
			const ms = fromDateId(dateId).getTime();
			const field = dateField;
			setDateField(null);
			try {
				await updateProject({
					id: projectId as Id<"projects">,
					[field]: ms,
				});
			} catch (error) {
				console.error("Failed to update date:", error);
			}
		},
		[projectId, dateField, updateProject]
	);

	if (!project) {
		return (
			<SafeAreaView
				style={{ flex: 1, backgroundColor: t.bg }}
				edges={[]}
			>
				{isPane ? (
					<PaneHeader onBack={onBack} />
				) : (
					<AppHeader mode={appHeaderMode} />
				)}
				<ScrollView contentContainerStyle={styles.scroll}>
					<View style={[styles.skeletonHeader, { backgroundColor: t.card }]} />
					<View
						style={[styles.skeletonBlock, { backgroundColor: t.card }]}
					/>
					<View
						style={[styles.skeletonBlock, { backgroundColor: t.card }]}
					/>
				</ScrollView>
			</SafeAreaView>
		);
	}

	const clientName =
		clientNameById.get(project.clientId) ?? "View client";

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={[]}>
			{isPane ? (
				<PaneHeader title={project.title} onBack={onBack} />
			) : (
				<AppHeader mode={appHeaderMode} />
			)}
			<ScrollView
				contentContainerStyle={styles.scroll}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Header card: title, client link, status, optional progress, dates */}
				<Card>
					<View style={styles.headerTop}>
						<View style={styles.headerTitleCol}>
							<EditableField
								label="Title"
								value={project.title}
								onSave={(v) => saveField("title", v)}
								placeholder="Project title"
								renderValue={(v) => (
									<Text style={[styles.title, { color: t.ink }]}>
										{v}
									</Text>
								)}
							/>
							<Pressable
								onPress={() =>
									shellNav
										? shellNav.open("clients", project.clientId)
										: router.push(`/clients/${project.clientId}`)
								}
								style={({ pressed }) => [
									styles.clientLink,
									pressed && styles.pressed,
								]}
								accessibilityRole="button"
								accessibilityLabel="View client"
							>
								<Building2 size={14} color={t.accent} />
								<Text style={[styles.clientLinkText, { color: t.accent }]}>
									{clientName}
								</Text>
							</Pressable>
						</View>
						<View style={styles.headerActions}>
							<FieldMenu
								title="Project status"
								value={project.status}
								options={STATUS_OPTIONS}
								onSelect={handleStatusSelect}
							>
								<View
									accessibilityRole="button"
									accessibilityLabel="Change status"
									style={[
										styles.statusTrigger,
										{ borderBottomColor: t.faint },
									]}
								>
									<Badge status={project.status} big />
								</View>
							</FieldMenu>
						</View>
					</View>

					{taskProgress ? (
						<View style={styles.progressRow}>
							<Ring
								pct={taskProgress.pct}
								size={72}
								stroke={9}
								track="#eef1f5"
								color={
									project.status === "completed" ? t.success : t.accent
								}
							>
								<Text style={[styles.ringText, { color: t.ink }]}>
									{taskProgress.pct}%
								</Text>
							</Ring>
							<View style={styles.kvCol}>
								<KV
									label="Tasks"
									value={`${taskProgress.done} of ${taskProgress.total} done`}
								/>
								<KV
									label="Start"
									value={formatDate(project.startDate) ?? "Not set"}
									onPress={() => openDatePicker("startDate")}
								/>
								<KV
									label="Due"
									value={formatDate(project.endDate) ?? "Not set"}
									onPress={() => openDatePicker("endDate")}
								/>
							</View>
						</View>
					) : (
						<View style={styles.kvColStandalone}>
							<KV
								label="Start"
								value={formatDate(project.startDate) ?? "Not set"}
								onPress={() => openDatePicker("startDate")}
							/>
							<KV
								label="Due"
								value={formatDate(project.endDate) ?? "Not set"}
								onPress={() => openDatePicker("endDate")}
							/>
						</View>
					)}
				</Card>

				{/* Team chat — full-width pill, matching the client detail screen */}
				<Pressable
					onPress={() => setMentionVisible(true)}
					accessibilityRole="button"
					accessibilityLabel="Open team chat"
					style={({ pressed }) => [
						styles.teamChat,
						{ backgroundColor: t.accentSoft },
						pressed && styles.pressed,
					]}
				>
					<MessageSquare size={18} color={t.accent} />
					<Text style={[styles.teamChatText, { color: t.accent }]}>
						Team chat
					</Text>
				</Pressable>

				{/* Description — inline editable */}
				<Card style={styles.section}>
					<Eyebrow>Description</Eyebrow>
					<View style={{ marginTop: 8 }}>
						<EditableField
							label=""
							value={project.description}
							onSave={(v) => saveField("description", v)}
							placeholder="Add a description…"
							multiline
							numberOfLines={3}
						/>
					</View>
				</Card>

				{/* Related quotes */}
				<View style={styles.section}>
					<SectionHeader title="Quotes" />
					{quotes && quotes.length > 0 ? (
						<Card style={styles.listCard}>
							{quotes.slice(0, 3).map((quote, i) => (
								<ListRow
									key={quote._id}
									title={
										quote.title || `Quote #${quote.quoteNumber}`
									}
									status={quote.status}
									onPress={() =>
										// Cast: dynamic detail route isn't in the generated route map.
										router.push({
											pathname: "/quote/[id]",
											params: { id: quote._id },
										} as unknown as Href)
									}
									last={i === Math.min(quotes.length, 3) - 1}
								/>
							))}
							{quotes.length > 3 ? (
								<Text style={[styles.more, { color: t.faint }]}>
									+{quotes.length - 3} more
								</Text>
							) : null}
						</Card>
					) : (
						<Card style={styles.emptyCard}>
							<Text style={[styles.emptyText, { color: t.faint }]}>
								No quotes yet
							</Text>
						</Card>
					)}
				</View>

				{/* Related invoices */}
				<View style={styles.section}>
					<SectionHeader title="Invoices" />
					{invoices && invoices.length > 0 ? (
						<Card style={styles.listCard}>
							{invoices.slice(0, 3).map((invoice, i) => (
								<ListRow
									key={invoice._id}
									title={`Invoice #${invoice.invoiceNumber}`}
									status={invoice.status}
									onPress={() =>
										// Cast: dynamic detail route isn't in the generated route map.
										router.push({
											pathname: "/invoice/[id]",
											params: { id: invoice._id },
										} as unknown as Href)
									}
									last={i === Math.min(invoices.length, 3) - 1}
								/>
							))}
							{invoices.length > 3 ? (
								<Text style={[styles.more, { color: t.faint }]}>
									+{invoices.length - 3} more
								</Text>
							) : null}
						</Card>
					) : (
						<Card style={styles.emptyCard}>
							<Text style={[styles.emptyText, { color: t.faint }]}>
								No invoices yet
							</Text>
						</Card>
					)}
				</View>

				{/* Documents — rewired component (Plan 02) */}
				{projectId && (
					<ProjectDocuments projectId={projectId as Id<"projects">} />
				)}

				<View style={{ height: 32 }} />
			</ScrollView>

			{/* Date picker — in-screen overlay (not a RN Modal): a Modal opened
			    after a SwiftUI menu (FieldMenu) interaction deadlocks touch
			    handling on iOS. A plain overlay stays in the RN hierarchy. */}
			{dateMounted ? (
				<View style={styles.dateOverlay}>
					<Animated.View
						style={[styles.dateBackdrop, { opacity: dateProgress }]}
					>
						<Animated.View
							style={[
								styles.dateSheet,
								{
									backgroundColor: t.bg,
									transform: [
										{
											translateY: dateProgress.interpolate({
												inputRange: [0, 1],
												outputRange: [24, 0],
											}),
										},
									],
								},
							]}
						>
							<View style={styles.dateSheetHeader}>
								<Text style={[styles.dateSheetTitle, { color: t.ink }]}>
									{shownField === "endDate"
										? "Select due date"
										: "Select start date"}
								</Text>
								<TouchableOpacity
									onPress={() => setDateField(null)}
									accessibilityRole="button"
									accessibilityLabel="Close"
								>
									<X size={24} color={t.ink} />
								</TouchableOpacity>
							</View>
							<AppCalendar
								selectedDate={
									shownField === "endDate"
										? project.endDate
											? toDateId(new Date(project.endDate))
											: undefined
										: project.startDate
											? toDateId(new Date(project.startDate))
											: undefined
								}
								onDateSelect={handleDateSelect}
							/>
						</Animated.View>
					</Animated.View>
				</View>
			) : null}

			{/* Team chat */}
			<MentionModal
				visible={mentionVisible}
				onClose={() => setMentionVisible(false)}
				entityType="project"
				entityId={projectId as Id<"projects">}
				entityName={project.title}
			/>
		</SafeAreaView>
	);
}

// Thin route wrapper — iPhone-identical (renders the body in "root" mode).
export default function ProjectDetailScreen() {
	const { projectId } = useLocalSearchParams<{ projectId: string }>();
	return <ProjectDetailBody id={projectId} />;
}

const styles = StyleSheet.create({
	scroll: {
		padding: 16,
		gap: 0,
	},
	skeletonHeader: {
		height: 140,
		borderRadius: radii.rLg,
		marginBottom: 14,
		boxShadow: shadow.card,
	},
	skeletonBlock: {
		height: 80,
		borderRadius: radii.rLg,
		marginBottom: 14,
		boxShadow: shadow.card,
	},
	headerTop: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 10,
	},
	headerTitleCol: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: 21,
		letterSpacing: -0.3,
	},
	clientLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 6,
	},
	clientLinkText: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	headerActions: {
		alignItems: "flex-end",
		gap: 10,
	},
	statusTrigger: {
		alignSelf: "flex-end",
		paddingBottom: 5,
		borderBottomWidth: 1,
	},
	teamChat: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 44,
		borderRadius: radii.rSm,
		marginTop: 12,
	},
	teamChatText: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	kvEditable: {
		paddingBottom: 5,
		borderBottomWidth: 1,
	},
	dateOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 10,
	},
	dateBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "center",
		alignItems: "center",
		padding: 16,
	},
	dateSheet: {
		width: "100%",
		maxWidth: 420,
		borderRadius: radii.r,
		padding: 16,
	},
	dateSheetHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	dateSheetTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 16,
	},
	progressRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginTop: 16,
	},
	ringText: {
		fontFamily: fontFamily.bold,
		fontSize: 16,
	},
	kvCol: {
		flex: 1,
		gap: 10,
	},
	kvColStandalone: {
		marginTop: 16,
		gap: 10,
	},
	kvRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
	},
	kvLabel: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
	},
	kvValue: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	section: {
		marginTop: 14,
	},
	description: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		lineHeight: 21,
		marginTop: 10,
	},
	listCard: {
		marginTop: 10,
		paddingVertical: 6,
		paddingHorizontal: 12,
	},
	emptyCard: {
		marginTop: 10,
		alignItems: "center",
		paddingVertical: 20,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
	},
	more: {
		fontFamily: fontFamily.medium,
		fontSize: 11,
		paddingVertical: 8,
		paddingHorizontal: 4,
	},
	pressed: {
		opacity: 0.6,
	},
});
