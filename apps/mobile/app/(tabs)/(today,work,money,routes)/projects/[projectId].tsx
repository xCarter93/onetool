import { useOfflinePartition } from "@/lib/offline/partition-context";
import {
	View,
	Text,
	RefreshControl,
	Pressable,
	StyleSheet,
	TouchableOpacity,
	Animated,
} from "react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	fontFamily,
	radii,
	touch,
	type,
	useTokens,
} from "@/lib/theme";
import { formatCurrency } from "@/lib/format";
import { appleMapsAddressUrl, appleMapsUrl } from "@/lib/route-run";
import { openExternal } from "@/lib/open-external";
import { recordRecentView } from "@/lib/recents";
import { usePermissions } from "@/lib/use-permissions";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { IdentityBlock, IdentityMeta } from "@/components/identity-block";
import {
	ContactChipRow,
	countSuffix,
	DetailSkeleton,
	type ChipAction,
} from "@/components/record-detail";
import {
	CanvasScroll,
	EmptyPanel,
	AttributeRow,
	MetricStrip,
	Panel,
	PanelHeader,
	RecordRow,
	UnderlineTabs,
	type UnderlineTab,
} from "@/components/canvas";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { MentionModal } from "@/components/MentionModal";
import { RecordDocuments } from "@/components/RecordDocuments";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { saveOffline, useOpenOps } from "@/lib/offline/hooks";
import { overlayFields } from "@/lib/offline/field-patch";
import { AppCalendar, toDateId, fromDateId } from "@/components/AppCalendar";
import { useScreenChrome } from "@/lib/shell-chrome";
import {
	CalendarDays,
	ClipboardCheck,
	FileText,
	MapPin,
	MessageCircle,
	MessageSquare,
	Navigation,
	Phone,
	Receipt,
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
type ProjectTab = "overview" | "quotes" | "invoices";

function formatDate(timestamp: number | undefined): string | null {
	if (!timestamp) return null;
	return new Date(timestamp).toLocaleDateString("en-US", {
		// Project dates are UTC-midnight instants — render UTC or west-of-
		// Greenwich users see the prior day.
		timeZone: "UTC",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// Date "well" — a bordered field matching EditableField's read state so the
// Schedule panel speaks the same grammar as the rest of the screen.
function DateWell({
	label,
	value,
	onPress,
}: {
	label: string;
	value: string | null;
	onPress: () => void;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			// Painted height, not hitSlop: Start and Due are adjacent, so 8pt of slop
			// each left a 16pt band that could open the wrong date picker.
			style={({ pressed }) => [
				styles.dateWell,
				{ backgroundColor: t.card, borderColor: t.input },
				pressed && styles.pressed,
			]}
			accessibilityRole="button"
			accessibilityLabel={`Edit ${label}`}
		>
			<View style={styles.dateWellBody}>
				<Text style={[styles.dateWellLabel, { color: t.sub }]}>{label}</Text>
				<Text
					style={[
						styles.dateWellValue,
						{ color: value ? t.ink : t.faint },
						!value && styles.dateWellEmpty,
					]}
					numberOfLines={1}
				>
					{value ?? "Not set"}
				</Text>
			</View>
			<CalendarDays size={14} color={t.faint} />
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
	const isPane = headerMode === "pane";
	const [refreshing, setRefreshing] = useState(false);
	const [dateField, setDateField] = useState<DateField | null>(null);
	const [mentionVisible, setMentionVisible] = useState(false);
	const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
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

	const project = useCachedQuery(
		api.projects.get,
		projectId ? { id: projectId as Id<"projects"> } : "skip"
	);
	const clients = useCachedQuery(api.clients.list, {});
	const quotes = useCachedQuery(
		api.quotes.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);
	const invoices = useCachedQuery(
		api.invoices.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);
	const tasks = useCachedQuery(
		api.tasks.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);
	// Quick-action data hangs off the project's client — same resolution the
	// client detail screen uses (primary contact / primary property).
	const contacts =
		useCachedQuery(
			api.clientContacts.listByClient,
			project ? { clientId: project.clientId } : "skip"
		) ?? [];
	const properties =
		useCachedQuery(
			api.clientProperties.listByClient,
			project ? { clientId: project.clientId } : "skip"
		) ?? [];

	// Queued field patches for this project, overlaid on the loaded doc so the
	// screen shows the edited value while the write is still in the outbox.
	const openOps = useOpenOps(projectId ? `project:${projectId}` : undefined);

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

	// Task progress — only render when tasks.list cleanly supplies it.
	const taskProgress = useMemo(() => {
		if (!tasks) return null;
		const total = tasks.length;
		const done = tasks.filter((tk) => tk.status === "completed").length;
		return { done, total };
	}, [tasks]);

	// Recents trail — once per visit, after the real title exists. A ref (not
	// state) keeps this out of the render cycle.
	const recordedRef = useRef<string | null>(null);
	const recentsScope = useOfflinePartition() ?? undefined;
	const projectTitle = project?.title;
	useEffect(() => {
		// The scope gates too: recordRecentView no-ops without it, and the ref below
		// would burn the one-shot before Clerk resolves the active org.
		if (!projectId || !projectTitle || !recentsScope) return;
		if (recordedRef.current === projectId) return;
		recordedRef.current = projectId;
		recordRecentView(recentsScope, {
			kind: "project",
			id: projectId,
			title: projectTitle,
			sub: clientName,
		});
		// clientName is a late-arriving snapshot detail — re-running on it would
		// double-record the same visit.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId, projectTitle, recentsScope]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	// Overlays queued field patches on the loaded doc — expectedValues for the
	// NEXT edit must key off what's on screen (which may include an earlier
	// still-pending edit), not the last server snapshot, or a second offline
	// edit in the same chain would replay against a base the server never saw.
	const displayProject = useMemo(
		() => (project ? overlayFields(project, openOps) : null),
		[project, openOps]
	);

	// Send ONLY the edited field — projects.update throws on zero updates (Pitfall 3).
	const saveField = useCallback(
		async (field: "title" | "description", value: string) => {
			if (!projectId || !displayProject) return;
			if (value === (displayProject[field] ?? "")) return;
			const saved = await saveOffline(
				"projects.update",
				{
					id: projectId as Id<"projects">,
					[field]: value,
					expectedValues: { [field]: displayProject[field] },
				},
				{ display: { title: `Update: ${displayProject.title}` } }
			);
			// saveOffline already explained the refusal; throwing keeps the editor open.
			if (!saved) throw new Error("Change not saved");
		},
		[projectId, displayProject]
	);

	const handleStatusSelect = useCallback(
		async (next: string) => {
			if (!projectId || !displayProject || next === displayProject.status) return;
			await saveOffline(
				"projects.update",
				{
					id: projectId as Id<"projects">,
					status: next as ProjectStatus,
					expectedValues: { status: displayProject.status },
				},
				{ display: { title: `Status: ${displayProject.title}` } }
			);
		},
		[projectId, displayProject]
	);

	const handleDateSelect = useCallback(
		async (dateId: string) => {
			if (!projectId || !dateField || !displayProject) return;
			const ms = fromDateId(dateId).getTime();
			const field = dateField;
			const saved = await saveOffline(
				"projects.update",
				{
					id: projectId as Id<"projects">,
					[field]: ms,
					expectedValues: { [field]: displayProject[field] },
				},
				{ display: { title: `${field === "startDate" ? "Start" : "Due"} date: ${displayProject.title}` } }
			);
			if (saved) setDateField(null);
		},
		[projectId, dateField, displayProject]
	);

	const canCreateQuote = permsLoading || can("quotes", "modify");

	const openAddTask = useCallback(() => {
		if (!project) return;
		router.push({
			pathname: "/tasks/form",
			params: { clientId: project.clientId, projectId },
		} as unknown as Href);
	}, [router, project, projectId]);
	const openNewQuote = useCallback(() => {
		if (!project) return;
		// Cast: /quote/new isn't in the generated route map yet.
		router.push({
			pathname: "/quote/new",
			params: { clientId: project.clientId, projectId },
		} as unknown as Href);
	}, [router, project, projectId]);

	// Tray, phone only — pane mode passes null so no chrome is published.
	useScreenChrome(
		isPane || !project
			? null
			: {
					tray: [
						...(permsLoading || can("tasks", "modify")
							? [{ key: "add-task", label: "Add task", icon: ClipboardCheck, onPress: openAddTask }]
							: []),
						...(canCreateQuote
							? [{ key: "new-quote", label: "New quote", icon: FileText, onPress: openNewQuote }]
							: []),
					],
				}
	);

	if (!project || !displayProject) {
		return (
			<View style={[styles.flex, { backgroundColor: t.bg }]}>
				{isPane ? <PaneHeader onBack={onBack} /> : null}
				<CanvasScroll>
					<DetailSkeleton />
				</CanvasScroll>
			</View>
		);
	}

	const status = displayProject.status;

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

	const contactName = primaryContact
		? `${primaryContact.firstName} ${primaryContact.lastName}`.trim() ||
			"Unnamed contact"
		: undefined;

	const chips: ChipAction[] = [];
	if (phone) {
		chips.push({
			key: "call",
			label: "Call",
			Icon: Phone,
			onPress: () => openExternal(`tel:${phone}`, "Phone"),
		});
	}
	if (directionsUrl) {
		chips.push({
			key: "map",
			label: "Map",
			Icon: Navigation,
			onPress: () => openExternal(directionsUrl, "Maps"),
		});
	}
	const overflow: ChipAction[] = [];
	if (phone) {
		overflow.push({
			key: "message",
			label: "Message",
			Icon: MessageCircle,
			onPress: () => openExternal(`sms:${phone}`, "Messages"),
		});
	}
	overflow.push({
		key: "team-chat",
		label: "Team chat",
		Icon: MessageSquare,
		onPress: () => setMentionVisible(true),
	});

	const tabs: UnderlineTab<ProjectTab>[] = [
		{ value: "overview", label: "Overview" },
		{ value: "quotes", label: "Quotes", count: quotes?.length ?? 0 },
		{ value: "invoices", label: "Invoices", count: invoices?.length ?? 0 },
	];

	return (
		<View style={[styles.flex, { backgroundColor: t.bg }]}>
			{isPane ? (
				// No title — the identity row right below carries the name.
				<PaneHeader onBack={onBack} />
			) : null}
			<CanvasScroll
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Identity — status is a Badge; the FieldMenu hangs off it so the
				    one place a project status can change keeps working. */}
				<IdentityBlock
					kind="project"
					statusKey={status}
					name={displayProject.title}
					meta={
						<Pressable
							onPress={() =>
								shellNav
									? shellNav.open({ kind: "client", id: project.clientId })
									: router.push(`/clients/${project.clientId}`)
							}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={`View client ${clientName ?? ""}`.trim()}
						>
							<IdentityMeta>{clientName ?? "View client"}</IdentityMeta>
						</Pressable>
					}
					renderStatus={(badge) => (
						<FieldMenu
							title="Project status"
							value={status}
							options={STATUS_OPTIONS}
							onSelect={handleStatusSelect}
						>
							{badge}
						</FieldMenu>
					)}
				/>

				<ContactChipRow chips={chips} overflow={overflow} />

				<MetricStrip
					cells={[
						{
							icon: ClipboardCheck,
							label: "Tasks",
							value: taskProgress ? `${taskProgress.done}/${taskProgress.total}` : "0",
						},
						{
							icon: FileText,
							label: "Quotes",
							value: String(quotes?.length ?? 0),
							onPress: () => setActiveTab("quotes"),
						},
						{
							icon: Receipt,
							label: "Invoices",
							value: String(invoices?.length ?? 0),
							onPress: () => setActiveTab("invoices"),
						},
					]}
				/>

				<UnderlineTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

				{activeTab === "overview" ? (
					<>
						{contactName ? (
							<Panel header={<PanelHeader title="Primary contact" />}>
								<AttributeRow label="Name" value={contactName} />
								{primaryContact?.jobTitle ? (
									<AttributeRow label="Role" value={primaryContact.jobTitle} />
								) : null}
								{phone ? (
									<AttributeRow
										label="Phone"
										value={phone}
										onPress={() => openExternal(`tel:${phone}`, "Phone")}
									/>
								) : null}
							</Panel>
						) : (
							<EmptyPanel icon={Phone} title="No contact on file" />
						)}

						{propertyAddress ? (
							<Panel header={<PanelHeader title="Property" />}>
								<AttributeRow
									icon={MapPin}
									label="Address"
									value={propertyAddress}
									onPress={
										directionsUrl
											? () => openExternal(directionsUrl, "Maps")
											: undefined
									}
								/>
							</Panel>
						) : (
							<EmptyPanel icon={MapPin} title="No property on file" />
						)}

						<Panel header={<PanelHeader title="Schedule" />}>
							<View style={styles.datePair}>
								<DateWell
									label="Start"
									value={formatDate(displayProject.startDate)}
									onPress={() => openDatePicker("startDate")}
								/>
								<DateWell
									label="Due"
									value={formatDate(displayProject.endDate)}
									onPress={() => openDatePicker("endDate")}
								/>
							</View>
						</Panel>

						<Panel header={<PanelHeader title="Details" />}>
							<View style={styles.editableRow}>
								<EditableField
									label="Title"
									value={displayProject.title}
									onSave={(v) => saveField("title", v)}
									placeholder="Project title"
								/>
							</View>
							<View style={styles.editableRow}>
								<EditableField
									label="Description"
									value={displayProject.description}
									onSave={(v) => saveField("description", v)}
									placeholder="Add a description…"
									multiline
									numberOfLines={4}
								/>
							</View>
						</Panel>

						{projectId && (permsLoading || can("documents", "view")) ? (
							<Panel header={<PanelHeader title="Documents" />}>
								<RecordDocuments
									target={{ kind: "project", id: projectId as Id<"projects"> }}
									style={styles.flushCard}
								/>
							</Panel>
						) : null}
					</>
				) : null}

				{activeTab === "quotes" ? (
					<Panel
						header={
							<PanelHeader
								title={`Quotes${countSuffix(quotes?.length ?? 0)}`}
								// The tray's secondary action already creates a quote on the
								// phone — this link would duplicate it. Pane mode has no tray.
								action={isPane && canCreateQuote ? "New" : undefined}
								onAction={openNewQuote}
							/>
						}
					>
						{(quotes ?? []).map((quote) => (
							<RecordRow
								key={quote._id}
								kind="quote"
								title={quote.title || `Quote #${quote.quoteNumber}`}
								subtitle={formatCurrency(quote.total, { exact: true })}
								status={quote.status}
								onPress={() =>
									shellNav
										? shellNav.open({ kind: "quote", id: quote._id })
										: router.push({
												pathname: "/quote/[id]",
												params: { id: quote._id },
											} as unknown as Href)
								}
							/>
						))}
						{(quotes ?? []).length === 0 ? (
							<AttributeRow label="Quotes" value="No quotes yet" />
						) : null}
					</Panel>
				) : null}

				{activeTab === "invoices" ? (
					<Panel header={<PanelHeader title={`Invoices${countSuffix(invoices?.length ?? 0)}`} />}>
						{(invoices ?? []).map((invoice) => (
							<RecordRow
								key={invoice._id}
								kind="invoice"
								title={`Invoice #${invoice.invoiceNumber}`}
								subtitle={formatCurrency(invoice.total, { exact: true })}
								status={invoice.status}
								onPress={() =>
									shellNav
										? shellNav.open({ kind: "invoice", id: invoice._id })
										: router.push({
												pathname: "/invoice/[id]",
												params: { id: invoice._id },
											} as unknown as Href)
								}
							/>
						))}
						{(invoices ?? []).length === 0 ? (
							<AttributeRow label="Invoices" value="No invoices yet" />
						) : null}
					</Panel>
				) : null}
			</CanvasScroll>

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
										? displayProject.endDate
											? toDateId(new Date(displayProject.endDate))
											: undefined
										: displayProject.startDate
											? toDateId(new Date(displayProject.startDate))
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
				entityName={displayProject.title}
			/>
		</View>
	);
}

// Thin route wrapper — iPhone-identical (renders the body in "root" mode).
export default function ProjectDetailScreen() {
	const { projectId } = useLocalSearchParams<{ projectId: string }>();
	return <ProjectDetailBody id={projectId} />;
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	pressed: {
		opacity: 0.6,
	},

	editableRow: { paddingHorizontal: 14, paddingVertical: 10 },
	flushCard: { borderWidth: 0, borderRadius: 0, padding: 12 },

	datePair: { flexDirection: "row", gap: 8, padding: 12 },
	dateWell: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: touch.min,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		paddingVertical: 9,
	},
	dateWellBody: { flex: 1, minWidth: 0, gap: 2 },
	dateWellLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.eyebrow,
	},
	dateWellValue: {
		fontFamily: fontFamily.regular,
		fontSize: type.rowTitle,
	},
	dateWellEmpty: { fontStyle: "italic" },

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
		fontSize: type.h3,
	},
});
