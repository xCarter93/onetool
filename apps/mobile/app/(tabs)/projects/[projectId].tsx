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
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useOrganization } from "@clerk/expo";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	DOCK_CLEARANCE,
	fontFamily,
	radii,
	recordTint,
	STATUS,
	touch,
	type,
	useTokens,
} from "@/lib/theme";
import { formatCurrency } from "@/lib/format";
import { appleMapsAddressUrl, appleMapsUrl } from "@/lib/route-run";
import { openExternal } from "@/lib/open-external";
import { recordRecentView } from "@/lib/recents";
import { usePermissions } from "@/lib/use-permissions";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { DotGrid, ListRow, Ring, SectionHeader } from "@/components/ui";
import {
	Illustration,
	type IllustrationName,
} from "@/components/illustrations";
import { IdentityBlock } from "@/components/identity-block";
import { QuickActions, type QuickAction } from "@/components/quick-actions";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { MentionModal } from "@/components/MentionModal";
import { ProjectDocuments } from "@/components/ProjectDocuments";
import { AppCalendar, toDateId, fromDateId } from "@/components/AppCalendar";
import {
	Building2,
	MessageSquare,
	Navigation,
	Phone,
	Plus,
	X,
} from "lucide-react-native";

const STATUS_OPTIONS = [
	{ value: "planned", label: "Planned" },
	{ value: "in-progress", label: "In Progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];

type ProjectStatus = "planned" | "in-progress" | "completed" | "cancelled";
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
	const insets = useSafeAreaInsets();
	// The floating dock takes no layout height — scroll content clears it
	// itself. iPad panes have no dock (the shell replaces Tabs).
	const scrollBottom = isPane ? 16 : DOCK_CLEARANCE + insets.bottom;
	const appHeaderMode = headerMode === "pane" ? "pane" : "detail";
	const [refreshing, setRefreshing] = useState(false);
	const [dateField, setDateField] = useState<DateField | null>(null);
	const [mentionVisible, setMentionVisible] = useState(false);
	const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
	const { organization } = useOrganization();
	const { can, isLoading: permsLoading } = usePermissions();

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
	// Quick-action data hangs off the project's client — same resolution the
	// client detail screen uses (primary contact / primary property).
	const contacts =
		useQuery(
			api.clientContacts.listByClient,
			project ? { clientId: project.clientId } : "skip"
		) ?? [];
	const properties =
		useQuery(
			api.clientProperties.listByClient,
			project ? { clientId: project.clientId } : "skip"
		) ?? [];

	// Single org-scoped clients query → name lookup. No per-row clients.get (N+1).
	const clientNameById = useMemo(
		() =>
			new Map<Id<"clients">, string>(
				(clients ?? []).map((c) => [c._id, c.companyName])
			),
		[clients]
	);
	const clientName = project
		? clientNameById.get(project.clientId)
		: undefined;

	// Optional task progress — only render when tasks.list cleanly supplies it.
	const taskProgress = useMemo(() => {
		if (!tasks || tasks.length === 0) return null;
		const total = tasks.length;
		const done = tasks.filter((tk) => tk.status === "completed").length;
		return { done, total, pct: Math.round((done / total) * 100) };
	}, [tasks]);

	// Recents trail — once per visit, after the real title exists. A ref (not
	// state) keeps this out of the render cycle.
	const recordedRef = useRef<string | null>(null);
	const orgId = organization?.id;
	const projectTitle = project?.title;
	useEffect(() => {
		// orgId gates too: recordRecentView no-ops without it, and the ref below
		// would burn the one-shot before Clerk resolves the active org.
		if (!projectId || !projectTitle || !orgId) return;
		if (recordedRef.current === projectId) return;
		recordedRef.current = projectId;
		recordRecentView(orgId, {
			kind: "project",
			id: projectId,
			title: projectTitle,
			sub: clientName,
		});
		// clientName is a late-arriving snapshot detail — re-running on it would
		// double-record the same visit.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId, projectTitle, orgId]);

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
			setOptimisticStatus(next);
			try {
				await updateProject({
					id: projectId as Id<"projects">,
					status: next as ProjectStatus,
				});
			} catch (error) {
				setOptimisticStatus(null);
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
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<DotGrid style={StyleSheet.absoluteFill} />
				{isPane ? (
					<PaneHeader onBack={onBack} />
				) : (
					<AppHeader mode={appHeaderMode} />
				)}
				{/* Skeleton is shaped like the real layout: monogram + name, the
				    action tiles, then list rows. */}
				<ScrollView
					contentContainerStyle={[
						styles.scroll,
						{ paddingBottom: scrollBottom },
					]}
				>
					<View style={styles.skeletonIdentity}>
						<View
							style={[styles.skeletonMonogram, { backgroundColor: t.lineSoft }]}
						/>
						<View style={styles.skeletonIdentityBody}>
							<View
								style={[
									styles.skeletonBar,
									{ width: "70%", height: 20, backgroundColor: t.lineSoft },
								]}
							/>
							<View
								style={[
									styles.skeletonBar,
									{
										width: "30%",
										height: 11,
										marginTop: 8,
										backgroundColor: t.lineSoft,
									},
								]}
							/>
						</View>
					</View>
					<View style={styles.skeletonTiles}>
						{[0, 1, 2, 3].map((i) => (
							<View
								key={i}
								style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]}
							/>
						))}
					</View>
					{[0, 1, 2].map((i) => (
						<View key={i} style={styles.skeletonRow}>
							<View
								style={[styles.skeletonRowTile, { backgroundColor: t.lineSoft }]}
							/>
							<View style={styles.skeletonIdentityBody}>
								<View
									style={[
										styles.skeletonBar,
										{ width: "55%", height: 13, backgroundColor: t.lineSoft },
									]}
								/>
								<View
									style={[
										styles.skeletonBar,
										{
											width: "35%",
											height: 11,
											marginTop: 6,
											backgroundColor: t.lineSoft,
										},
									]}
								/>
							</View>
						</View>
					))}
				</ScrollView>
			</SafeAreaView>
		);
	}

	const status = optimisticStatus ?? project.status;

	const primaryContact = contacts.find((c) => c.isPrimary) ?? contacts[0];
	// The project's own property wins; otherwise fall back to the client's primary.
	const directionsProperty =
		(project.propertyId
			? properties.find((p) => p._id === project.propertyId)
			: undefined) ??
		properties.find((p) => p.isPrimary) ??
		properties[0];
	const propertyAddress = directionsProperty
		? directionsProperty.formattedAddress ||
			[
				directionsProperty.streetAddress,
				directionsProperty.city,
				directionsProperty.state,
				directionsProperty.zipCode,
			]
				.filter(Boolean)
				.join(", ")
		: undefined;

	const phone = primaryContact?.phone;
	const directionsUrl =
		directionsProperty &&
		directionsProperty.latitude !== undefined &&
		directionsProperty.longitude !== undefined
			? appleMapsUrl(directionsProperty.latitude, directionsProperty.longitude)
			: propertyAddress
				? appleMapsAddressUrl(propertyAddress)
				: undefined;

	// Every tile stays visible; missing data dims it rather than hiding it. The
	// quote tile is the exception — creation is permission-gated, and the FAB's
	// convention is to hide (not dim) what the user may not do.
	const quickActions: QuickAction[] = [
		{
			key: "call",
			label: "Call",
			Icon: Phone,
			disabled: !phone,
			onPress: () => phone && openExternal(`tel:${phone}`, "Phone"),
		},
		{
			key: "message",
			label: "Message",
			Icon: MessageSquare,
			disabled: !phone,
			onPress: () => phone && openExternal(`sms:${phone}`, "Messages"),
		},
		{
			key: "directions",
			label: "Directions",
			Icon: Navigation,
			disabled: !directionsUrl,
			onPress: () => directionsUrl && openExternal(directionsUrl, "Maps"),
		},
	];
	if (permsLoading || can("quotes", "modify")) {
		quickActions.push({
			key: "new-quote",
			label: "New quote",
			Icon: Plus,
			onPress: () =>
				// Cast: /quote/new isn't in the generated route map yet.
				router.push({
					pathname: "/quote/new",
					params: { clientId: project.clientId, projectId },
				} as unknown as Href),
		});
	}

	const recentQuotes = quotes?.slice(0, 3) ?? [];
	const recentInvoices = invoices?.slice(0, 3) ?? [];

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{isPane ? (
				<PaneHeader title={project.title} onBack={onBack} />
			) : (
				<AppHeader mode={appHeaderMode} title={project.title} />
			)}
			<ScrollView
				contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottom }]}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Identity — status is TEXT; the FieldMenu hangs off it so the one
				    place a project status can change keeps working. */}
				<IdentityBlock
					tint={recordTint.project}
					monogram={project.title}
					statusKey={status}
					sub={clientName}
					renderStatus={(statusText) => (
						<FieldMenu
							title="Project status"
							value={status}
							options={STATUS_OPTIONS}
							onSelect={handleStatusSelect}
						>
							{/* A single bare child is the whole trigger — a row sibling
							    gets squeezed by the native menu host and clips the label. */}
							<View
								accessibilityRole="button"
								// Status-as-text removed the badge, so the label must still
								// speak the CURRENT value.
								accessibilityLabel={`Status: ${
									STATUS[status as keyof typeof STATUS]?.label ?? status
								}. Tap to change`}
								style={[styles.statusTrigger, { borderBottomColor: t.faint }]}
							>
								{statusText}
							</View>
						</FieldMenu>
					)}
				/>

				{/* Client link stays adjacent to identity — the sub line is text only. */}
				<Pressable
					onPress={() =>
						shellNav
							? shellNav.open({ kind: "client", id: project.clientId })
							: router.push(`/clients/${project.clientId}`)
					}
					hitSlop={8}
					style={({ pressed }) => [
						styles.clientLink,
						pressed && styles.pressed,
					]}
					accessibilityRole="button"
					accessibilityLabel={`View client ${clientName ?? ""}`.trim()}
				>
					<Building2 size={14} color={t.frostedInk} />
					<Text style={[styles.clientLinkText, { color: t.frostedInk }]}>
						{clientName ?? "View client"}
					</Text>
				</Pressable>

				<View style={styles.actionsWrap}>
					<QuickActions actions={quickActions} />
				</View>

				{/* Team chat — relocated from the old floating FAB */}
				<Pressable
					onPress={() => setMentionVisible(true)}
					accessibilityRole="button"
					accessibilityLabel="Open team chat"
					style={({ pressed }) => [
						styles.teamChat,
						{ backgroundColor: t.frostedBg, borderColor: t.frostedBorder },
						pressed && styles.pressed,
					]}
				>
					<MessageSquare size={18} color={t.frostedInk} />
					<Text style={[styles.teamChatText, { color: t.frostedInk }]}>
						Team chat
					</Text>
				</Pressable>

				{/* Progress — card-free: the ring sits beside a quiet stat column. */}
				<View style={styles.section}>
					<SectionHeader title="Progress" />
					{taskProgress ? (
						<View style={styles.progressRow}>
							<Ring
								pct={taskProgress.pct}
								size={72}
								stroke={9}
								track={t.secondary}
								color={status === "completed" ? t.success : t.primarySolid}
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
				</View>

				{/* Details — the header owns the name, so title editing lives here
				    (same idiom as the client screen's Company section). */}
				<View style={styles.section}>
					<SectionHeader title="Details" />
					<View style={styles.stack}>
						<EditableField
							label="Title"
							value={project.title}
							onSave={(v) => saveField("title", v)}
							placeholder="Project title"
						/>
						<EditableField
							label="Description"
							value={project.description}
							onSave={(v) => saveField("description", v)}
							placeholder="Add a description…"
							multiline
							numberOfLines={4}
						/>
					</View>
				</View>

				{/* Quotes */}
				<View style={styles.section}>
					<SectionHeader
						title={`Quotes${countSuffix(quotes?.length ?? 0)}`}
					/>
					{recentQuotes.length > 0 ? (
						<View>
							{recentQuotes.map((quote, i) => (
								<ListRow
									key={quote._id}
									title={quote.title || `Quote #${quote.quoteNumber}`}
									sub={formatCurrency(quote.total, { exact: true })}
									status={quote.status}
									showChevron={false}
									onPress={() =>
										// Cast: dynamic detail route isn't in the generated route map.
										router.push({
											pathname: "/quote/[id]",
											params: { id: quote._id },
										} as unknown as Href)
									}
									last={i === recentQuotes.length - 1}
								/>
							))}
						</View>
					) : (
						<EmptyRow text="No quotes yet" illo="quotes-none" />
					)}
				</View>

				{/* Invoices */}
				<View style={styles.section}>
					<SectionHeader
						title={`Invoices${countSuffix(invoices?.length ?? 0)}`}
					/>
					{recentInvoices.length > 0 ? (
						<View>
							{recentInvoices.map((invoice, i) => (
								<ListRow
									key={invoice._id}
									title={`Invoice #${invoice.invoiceNumber}`}
									sub={formatCurrency(invoice.total, { exact: true })}
									status={invoice.status}
									showChevron={false}
									onPress={() =>
										// Cast: dynamic detail route isn't in the generated route map.
										router.push({
											pathname: "/invoice/[id]",
											params: { id: invoice._id },
										} as unknown as Href)
									}
									last={i === recentInvoices.length - 1}
								/>
							))}
						</View>
					) : (
						<EmptyRow text="No invoices yet" illo="invoices-none" />
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
									hitSlop={10}
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

function countSuffix(n: number) {
	return n > 0 ? `  ·  ${n}` : "";
}

function EmptyRow({ text, illo }: { text: string; illo: IllustrationName }) {
	const t = useTokens();
	return (
		<View style={styles.empty}>
			{/* Knockout = the page canvas, so cut-out shapes don't show card-white. */}
			<Illustration name={illo} size="sm" knockout={t.bg} />
			<Text style={[styles.emptyText, { color: t.sub }]}>{text}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	scroll: {
		padding: 16,
		gap: 0,
	},
	pressed: {
		opacity: 0.6,
	},

	skeletonIdentity: { flexDirection: "row", alignItems: "center", gap: 14 },
	skeletonMonogram: { width: 54, height: 54, borderRadius: radii.card },
	skeletonIdentityBody: { flex: 1, minWidth: 0 },
	skeletonBar: { borderRadius: radii.xs },
	skeletonTiles: { flexDirection: "row", gap: 8, marginTop: 18 },
	skeletonTile: {
		flex: 1,
		height: touch.min + 16,
		borderRadius: radii.ctrl,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 12,
		paddingHorizontal: 12,
		marginTop: 6,
	},
	skeletonRowTile: { width: 32, height: 32, borderRadius: 9 },

	statusTrigger: {
		alignSelf: "flex-start",
		paddingBottom: 4,
		borderBottomWidth: 1,
	},
	clientLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 12,
		alignSelf: "flex-start",
		minHeight: touch.min - 12,
	},
	clientLinkText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
	},

	actionsWrap: { marginTop: 10 },

	teamChat: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 44,
		borderRadius: radii.rSm,
		borderWidth: 1,
		marginTop: 10,
	},
	teamChatText: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},

	section: { marginTop: 22, gap: 10 },
	stack: { gap: 2 },

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
		gap: 10,
	},
	kvRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		// Painted height, not hitSlop: Start and Due are adjacent, so 8pt of slop
		// each left a 16pt band that could open the wrong date picker.
		minHeight: touch.min,
		paddingVertical: 11,
	},
	kvLabel: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
	},
	kvValue: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},

	empty: {
		paddingVertical: 18,
		alignItems: "center",
		gap: 8,
	},
	emptyText: { fontFamily: fontFamily.regular, fontSize: type.meta },
});
