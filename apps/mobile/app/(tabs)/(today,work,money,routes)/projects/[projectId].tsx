import { useOfflinePartition } from "@/lib/offline/partition-context";
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
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	colors,
	DOCK_CLEARANCE,
	fontFamily,
	radii,
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
import { InkTabHeader } from "@/components/ink-tab-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { Button, DotGrid, ListRow } from "@/components/ui";
import { IdentityBlock } from "@/components/identity-block";
import {
	countSuffix,
	detailStyles,
	DetailSkeleton,
	EmptyRow,
	FactCard,
	FactRow,
	ProgressBar,
	SectionLabel,
	TeamChatButton,
	type FactAction,
} from "@/components/record-detail";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { useOverlayTransition } from "@/components/useOverlayTransition";
import { MentionModal } from "@/components/MentionModal";
import { RecordDocuments } from "@/components/RecordDocuments";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { saveOffline, useOpenOps } from "@/lib/offline/hooks";
import { overlayFields } from "@/lib/offline/field-patch";
import { AppCalendar, toDateId, fromDateId } from "@/components/AppCalendar";
import {
	CalendarDays,
	MapPin,
	MessageCircle,
	Navigation,
	Phone,
	Plus,
	User,
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
		// Project dates are UTC-midnight instants — render UTC or west-of-
		// Greenwich users see the prior day.
		timeZone: "UTC",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// Date "well" — same grammar as EditableField's display state (filled card,
// hairline, trailing glyph) so every editable on the screen speaks one language.
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
				{ backgroundColor: t.card, borderColor: t.lineSoft },
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
	// In an iPad pane the header is a PaneHeader (onBack clears the shell
	// selection; router.back would pop out of the shell). onBack is undefined in
	// landscape (list always visible → no back button).
	const isPane = headerMode === "pane";
	const insets = useSafeAreaInsets();
	// The floating dock takes no layout height — scroll content clears it
	// itself. iPad panes have no dock (the shell replaces Tabs).
	const scrollBottom = isPane ? 16 : DOCK_CLEARANCE + insets.bottom;
	const [refreshing, setRefreshing] = useState(false);
	const [dateField, setDateField] = useState<DateField | null>(null);
	const [mentionVisible, setMentionVisible] = useState(false);
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

	if (!project || !displayProject) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<DotGrid style={StyleSheet.absoluteFill} />
				{isPane ? (
					<PaneHeader onBack={onBack} />
				) : (
					<InkTabHeader title="Project" onBack={() => router.back()} />
				)}
				{/* Skeleton mirrors the real layout: hero, fact card, pill pair,
				    progress bar, then list rows. */}
				<ScrollView
					contentContainerStyle={[
						styles.scroll,
						{ paddingBottom: scrollBottom },
					]}
				>
					<DetailSkeleton variant="project" />
				</ScrollView>
			</SafeAreaView>
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

	// Fact-block actions. Unlike the client screen's peer tile row, a glyph with
	// nothing behind it is dropped — its row only exists when the data does.
	const contactName = primaryContact
		? `${primaryContact.firstName} ${primaryContact.lastName}`.trim() ||
			"Unnamed contact"
		: undefined;
	const contactSub =
		[primaryContact?.jobTitle, primaryContact?.email]
			.filter(Boolean)
			.join("  ·  ") || undefined;
	const contactActions: FactAction[] = phone
		? [
				{
					key: "call",
					label: `Call ${contactName ?? "contact"}`,
					Icon: Phone,
					onPress: () => openExternal(`tel:${phone}`, "Phone"),
				},
				{
					key: "message",
					label: `Message ${contactName ?? "contact"}`,
					Icon: MessageCircle,
					onPress: () => openExternal(`sms:${phone}`, "Messages"),
				},
			]
		: [];
	const addressActions: FactAction[] = directionsUrl
		? [
				{
					key: "directions",
					label: "Directions to job site",
					Icon: Navigation,
					onPress: () => openExternal(directionsUrl, "Maps"),
				},
			]
		: [];

	// Creation is permission-gated, and the FAB's convention is to hide (not
	// dim) what the user may not do — but stay visible-and-inert while the grant
	// is still loading, so the row doesn't reflow under a tap.
	const canCreateQuote = permsLoading || can("quotes", "modify");

	const recentQuotes = quotes?.slice(0, 3) ?? [];
	const recentInvoices = invoices?.slice(0, 3) ?? [];

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{isPane ? (
				// No title — the hero right below carries the name; a titled pane
				// header printed it twice.
				<PaneHeader onBack={onBack} />
			) : (
				<InkTabHeader title={displayProject.title} onBack={() => router.back()} />
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
					statusKey={status}
					name={displayProject.title}
					// The old standalone Building2 client-link row folds in here.
					meta={
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
							<Text style={[styles.clientLinkText, { color: t.frostedInk }]}>
								{clientName ?? "View client"}
							</Text>
						</Pressable>
					}
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
								style={[
									detailStyles.statusTrigger,
									{ borderBottomColor: t.faint },
								]}
							>
								{statusText}
							</View>
						</FieldMenu>
					)}
				/>

				{/* Facts — who to reach and where to go. Rows with no data are
				    hidden outright; the card disappears when both are. */}
				<FactCard>
					{contactName ? (
						<FactRow
							key="contact"
							Icon={User}
							title={contactName}
							sub={contactSub}
							actions={contactActions}
							last={!propertyAddress}
						/>
					) : null}
					{propertyAddress ? (
						<FactRow
							key="address"
							Icon={MapPin}
							title={propertyAddress}
							actions={addressActions}
							last
						/>
					) : null}
				</FactCard>

				{/* Actions — call/message/directions now live in the fact card, so
				    only the two screen-level verbs remain. */}
				<View style={styles.pillRow}>
					{canCreateQuote ? (
						<Button
							title="New quote"
							variant="solid"
							disabled={permsLoading}
							icon={<Plus size={16} color={colors.primaryForeground} />}
							onPress={() =>
								// Cast: /quote/new isn't in the generated route map yet.
								router.push({
									pathname: "/quote/new",
									params: { clientId: project.clientId, projectId },
								} as unknown as Href)
							}
							style={styles.pill}
						/>
					) : null}
					<TeamChatButton
						onPress={() => setMentionVisible(true)}
						style={styles.pill}
					/>
				</View>

				{/* Schedule — the Start/Due pair plus the linear progress bar (the
				    72pt ring read as dashboard ornament on a screen whose job is
				    facts). */}
				<View style={detailStyles.section}>
					<SectionLabel title="Schedule" />
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
					{taskProgress ? (
						<ProgressBar
							done={taskProgress.done}
							total={taskProgress.total}
							// Completed projects keep the green they had on the ring.
							color={status === "completed" ? t.success : t.primarySolid}
						/>
					) : null}
				</View>

				{/* Details — the hero displays the name, so EDITING it lives here
				    (same idiom as the client screen's Company section). */}
				<View style={detailStyles.section}>
					<SectionLabel title="Details" />
					<View style={detailStyles.stack}>
						<EditableField
							label="Title"
							value={displayProject.title}
							onSave={(v) => saveField("title", v)}
							placeholder="Project title"
						/>
						<EditableField
							label="Description"
							value={displayProject.description}
							onSave={(v) => saveField("description", v)}
							placeholder="Add a description…"
							multiline
							numberOfLines={4}
						/>
					</View>
				</View>

				{/* Quotes */}
				<View style={detailStyles.section}>
					<SectionLabel title={`Quotes${countSuffix(quotes?.length ?? 0)}`} />
					{recentQuotes.length > 0 ? (
						<FactCard style={detailStyles.sectionCard}>
							{recentQuotes.map((quote, i) => (
								<ListRow
									key={quote._id}
									title={quote.title || `Quote #${quote.quoteNumber}`}
									sub={formatCurrency(quote.total, { exact: true })}
									status={quote.status}
									showChevron={false}
									onPress={() =>
										shellNav
											? shellNav.open({ kind: "quote", id: quote._id })
											: // Cast: dynamic detail route isn't in the generated route map.
												router.push({
													pathname: "/quote/[id]",
													params: { id: quote._id },
												} as unknown as Href)
									}
									last={i === recentQuotes.length - 1}
								/>
							))}
						</FactCard>
					) : (
						<EmptyRow text="No quotes yet" illo="quotes-none" />
					)}
				</View>

				{/* Invoices */}
				<View style={detailStyles.section}>
					<SectionLabel
						title={`Invoices${countSuffix(invoices?.length ?? 0)}`}
					/>
					{recentInvoices.length > 0 ? (
						<FactCard style={detailStyles.sectionCard}>
							{recentInvoices.map((invoice, i) => (
								<ListRow
									key={invoice._id}
									title={`Invoice #${invoice.invoiceNumber}`}
									sub={formatCurrency(invoice.total, { exact: true })}
									status={invoice.status}
									showChevron={false}
									onPress={() =>
										shellNav
											? shellNav.open({ kind: "invoice", id: invoice._id })
											: // Cast: dynamic detail route isn't in the generated route map.
												router.push({
													pathname: "/invoice/[id]",
													params: { id: invoice._id },
												} as unknown as Href)
									}
									last={i === recentInvoices.length - 1}
								/>
							))}
						</FactCard>
					) : (
						<EmptyRow text="No invoices yet" illo="invoices-none" />
					)}
				</View>

				{/* Documents — rewired component (Plan 02). Hidden without the view
				    grant (the list query throws on denial); visible while loading. */}
				{projectId && (permsLoading || can("documents", "view")) ? (
					<View style={detailStyles.section}>
						<SectionLabel title="Documents" />
						<RecordDocuments
							target={{ kind: "project", id: projectId as Id<"projects"> }}
						/>
					</View>
				) : null}

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
		</SafeAreaView>
	);
}

// Thin route wrapper — iPhone-identical (renders the body in "root" mode).
export default function ProjectDetailScreen() {
	const { projectId } = useLocalSearchParams<{ projectId: string }>();
	return <ProjectDetailBody id={projectId} />;
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

	clientLink: {
		alignSelf: "flex-start",
		justifyContent: "center",
		minHeight: touch.min - 12,
	},
	clientLinkText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
	},

	pillRow: { flexDirection: "row", gap: 8, marginTop: 14 },
	pill: { flex: 1, minWidth: 0 },

	datePair: { flexDirection: "row", gap: 8 },
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
