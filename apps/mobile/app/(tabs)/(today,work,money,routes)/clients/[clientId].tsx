import { useOfflinePartition } from "@/lib/offline/partition-context";
import { View, RefreshControl, StyleSheet } from "react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useTokens } from "@/lib/theme";
import { formatCurrency } from "@/lib/format";
import { appleMapsAddressUrl, appleMapsUrl } from "@/lib/route-run";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { MentionModal } from "@/components/MentionModal";
import { IdentityBlock } from "@/components/identity-block";
import {
	ContactChipRow,
	countSuffix,
	DetailSkeleton,
	LineRow,
	PersonRow,
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
import { openExternal } from "@/lib/open-external";
import { recordRecentView } from "@/lib/recents";
import { usePermissions } from "@/lib/use-permissions";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { saveOffline, useOpenOps } from "@/lib/offline/hooks";
import { expectedValue, overlayFields } from "@/lib/offline/field-patch";
import { RecordDocuments } from "@/components/RecordDocuments";
import { useScreenChrome } from "@/lib/shell-chrome";
import {
	CalendarClock,
	FileText,
	Folder,
	Mail,
	MapPin,
	MessageSquare,
	Navigation,
	Phone,
	Wallet,
} from "lucide-react-native";

type ClientStatus = "lead" | "active" | "inactive" | "archived";
type ClientTab = "overview" | "projects" | "quotes" | "invoices";

const STATUS_OPTIONS = [
	{ value: "lead", label: "Lead" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
	// archived is intentionally exposed — the detail screen is the only place a
	// status can change, so an admin must be able to revert a mis-set archived
	// client. The list still hides archived from its default view (Plan 03).
	{ value: "archived", label: "Archived" },
];

const LEAD_SOURCE_LABEL: Record<string, string> = {
	"word-of-mouth": "Word of mouth",
	website: "Website",
	"social-media": "Social media",
	referral: "Referral",
	advertising: "Advertising",
	"trade-show": "Trade show",
	"cold-outreach": "Cold outreach",
	"community-page": "Community page",
	other: "Other",
};

// One address string per property — the chip row and the Property panel must
// resolve the same thing.
const addressOf = (
	property: Pick<
		Doc<"clientProperties">,
		"formattedAddress" | "streetAddress" | "city" | "state" | "zipCode"
	>
) =>
	property.formattedAddress ||
	[property.streetAddress, property.city, property.state, property.zipCode]
		.filter(Boolean)
		.join(", ");

const sinceLabel = (creationTime: number) =>
	`since ${new Date(creationTime).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

// Body extracted (P26 Option B) so the iPad pane can render this without the
// route shell. headerMode DEFAULTS to "root" → the iPhone route wrapper below is
// byte-identical to before. In a pane the shell passes headerMode="pane".
export function ClientDetailBody({
	id,
	headerMode = "root",
	onBack,
}: {
	id: string;
	headerMode?: "root" | "pane";
	// iPad pane: when the shell provides onBack, the body's header is a PaneHeader
	// whose back CLEARS the shell selection (router.back would pop out of the
	// shell — selection-driven nav never pushed a route). Keeps ONE header.
	onBack?: () => void;
}) {
	const t = useTokens();
	const clientId = id;
	const router = useRouter();
	// On iPad the body renders inside the shell → cross-links navigate via the
	// shell selection (no router.push to a (tabs) sibling, which slides the whole
	// shell). On iPhone there's no provider → null → router.push (route nav).
	const shellNav = useShellNav();
	const isPane = headerMode === "pane";
	const [refreshing, setRefreshing] = useState(false);
	const [mentionModalVisible, setMentionModalVisible] = useState(false);
	const [activeTab, setActiveTab] = useState<ClientTab>("overview");
	const { can, isLoading: permsLoading } = usePermissions();

	const client = useCachedQuery(
		api.clients.get,
		clientId ? { id: clientId as Id<"clients"> } : "skip"
	);
	const contacts =
		useCachedQuery(
			api.clientContacts.listByClient,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const properties =
		useCachedQuery(
			api.clientProperties.listByClient,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const projects =
		useCachedQuery(
			api.projects.list,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const quotes =
		useCachedQuery(
			api.quotes.list,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const invoices =
		useCachedQuery(
			api.invoices.list,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];

	// Queued field patches for this client, overlaid on the loaded doc so the
	// screen shows the edited value while the write is still in the outbox.
	const openOps = useOpenOps(clientId ? `client:${clientId}` : undefined);
	const displayClient = useMemo(
		() => (client ? overlayFields(client, openOps) : null),
		[client, openOps]
	);

	// On-device "Recently viewed" trail for the Work tab (Slice 6). Fire-and-
	// forget, and only once the doc has loaded so the snapshot is a real title.
	const recentsScope = useOfflinePartition() ?? undefined;
	const recentId = client?._id;
	const recentTitle = client?.companyName;
	const recentSub = client?.companyDescription?.trim() || properties[0]?.city;
	// One-shot per visit (same guard as the projects screen): recentSub arrives
	// late with the properties query and would otherwise re-record the visit.
	const recordedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!recentId || !recentTitle || !recentsScope) return;
		if (recordedRef.current === recentId) return;
		recordedRef.current = recentId;
		recordRecentView(recentsScope, {
			kind: "client",
			id: recentId,
			title: recentTitle,
			sub: recentSub,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [recentsScope, recentId, recentTitle]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 800);
	}, []);

	// Send ONLY the edited field, queued with `expectedValues` from the value
	// on screen (which may itself be an earlier still-pending edit).
	const handleSaveField = async (
		field: "companyName" | "notes",
		value: string
	) => {
		if (!clientId || !displayClient) return;
		if ((displayClient[field] ?? "") === value) return;
		const saved = await saveOffline(
			"clients.update",
			{
				id: clientId as Id<"clients">,
				[field]: value,
				expectedValues: { [field]: expectedValue(displayClient[field]) },
			},
			{ display: { title: `Update: ${displayClient.companyName}` } }
		);
		// saveOffline already explained the refusal; throwing keeps the editor open.
		if (!saved) throw new Error("Change not saved");
	};

	const handleSelectStatus = async (next: string) => {
		if (!clientId || !displayClient || next === displayClient.status) return;
		await saveOffline(
			"clients.update",
			{
				id: clientId as Id<"clients">,
				status: next as ClientStatus,
				expectedValues: { status: displayClient.status },
			},
			{ display: { title: `Status: ${displayClient.companyName}` } }
		);
	};

	const canCreateProject = permsLoading || can("projects", "modify");
	const canCreateQuote = permsLoading || can("quotes", "modify");

	const openNewQuote = useCallback(() => {
		// Cast: /quote/new isn't in the generated route map yet.
		router.push({
			pathname: "/quote/new",
			params: { clientId },
		} as unknown as Href);
	}, [router, clientId]);
	const openSchedule = useCallback(() => {
		router.push({
			pathname: "/tasks/form",
			params: { clientId },
		} as unknown as Href);
	}, [router, clientId]);

	// Tray, phone only — pane mode passes null so no chrome is published.
	useScreenChrome(
		isPane
			? null
			: {
					tray: [
						...(canCreateQuote
							? [{ key: "new-quote", label: "New quote", icon: FileText, onPress: openNewQuote }]
							: []),
						...(permsLoading || can("tasks", "modify")
							? [{ key: "schedule", label: "Schedule", icon: CalendarClock, onPress: openSchedule }]
							: []),
					],
				}
	);

	if (!client || !displayClient) {
		return (
			<View style={[styles.flex, { backgroundColor: t.bg }]}>
				{isPane ? <PaneHeader onBack={onBack} /> : null}
				<CanvasScroll>
					<DetailSkeleton />
				</CanvasScroll>
			</View>
		);
	}

	const status = displayClient.status;

	const primaryProperty = properties.find((p) => p.isPrimary) ?? properties[0];
	const primaryContact = contacts.find((c) => c.isPrimary) ?? contacts[0];

	// Identity meta line: where this client is (or its lead source), plus when
	// it was created — the mock's "Healthcare · since Mar 2024" pattern.
	const identityLocation =
		[primaryProperty?.city, primaryProperty?.state].filter(Boolean).join(", ") ||
		undefined;
	const identityOrigin =
		identityLocation ??
		(client.leadSource
			? (LEAD_SOURCE_LABEL[client.leadSource] ?? client.leadSource)
			: undefined);
	const identitySub = [identityOrigin, sinceLabel(client._creationTime)]
		.filter(Boolean)
		.join("  ·  ");

	// Directions for one property — coordinates win, else the formatted
	// address, else no action at all.
	const directionsFor = (property: (typeof properties)[number]) => {
		const address = addressOf(property);
		if (property.latitude !== undefined && property.longitude !== undefined) {
			return appleMapsUrl(property.latitude, property.longitude);
		}
		return address ? appleMapsAddressUrl(address) : undefined;
	};

	const propertyMapUrl = primaryProperty ? directionsFor(primaryProperty) : undefined;

	// Web parity (client-detail-sidebar.tsx): unpaid invoice total.
	const outstanding = invoices
		.filter((inv) => inv.status !== "paid")
		.reduce((sum, inv) => sum + inv.total, 0);

	const chips: ChipAction[] = [];
	if (primaryContact?.phone) {
		chips.push({
			key: "call",
			label: "Call",
			Icon: Phone,
			onPress: () => openExternal(`tel:${primaryContact.phone}`, "Phone"),
		});
	}
	if (primaryContact?.email) {
		chips.push({
			key: "email",
			label: "Email",
			Icon: Mail,
			onPress: () => openExternal(`mailto:${primaryContact.email}`, "Mail"),
		});
	}
	if (propertyMapUrl) {
		chips.push({
			key: "map",
			label: "Map",
			Icon: Navigation,
			onPress: () => openExternal(propertyMapUrl, "Maps"),
		});
	}
	const overflow: ChipAction[] = [];
	if (primaryContact?.phone) {
		overflow.push({
			key: "message",
			label: "Message",
			Icon: MessageSquare,
			onPress: () => openExternal(`sms:${primaryContact.phone}`, "Messages"),
		});
	}
	overflow.push({
		key: "team-chat",
		label: "Team chat",
		Icon: MessageSquare,
		onPress: () => setMentionModalVisible(true),
	});

	const tabs: UnderlineTab<ClientTab>[] = [
		{ value: "overview", label: "Overview" },
		{ value: "projects", label: "Projects", count: projects.length },
		{ value: "quotes", label: "Quotes", count: quotes.length },
		{ value: "invoices", label: "Invoices", count: invoices.length },
	];

	const tags = client.tags?.filter(Boolean) ?? [];

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
				    one place a client status can change keeps working. */}
				<IdentityBlock
					kind="client"
					statusKey={status}
					name={displayClient.companyName}
					meta={identitySub || undefined}
					renderStatus={(badge) => (
						<FieldMenu
							title="Client status"
							value={status}
							options={STATUS_OPTIONS}
							onSelect={handleSelectStatus}
						>
							{badge}
						</FieldMenu>
					)}
				/>

				<ContactChipRow chips={chips} overflow={overflow} />

				<MetricStrip
					cells={[
						{
							icon: FileText,
							label: "Quotes",
							value: String(quotes.length),
							onPress: () => setActiveTab("quotes"),
						},
						{
							icon: Wallet,
							label: "Outstanding",
							value: formatCurrency(outstanding),
							tone: outstanding > 0 ? "danger" : "default",
							onPress: () => setActiveTab("invoices"),
						},
						{
							icon: Folder,
							label: "Projects",
							value: String(projects.length),
							onPress: () => setActiveTab("projects"),
						},
					]}
				/>

				<UnderlineTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

				{activeTab === "overview" ? (
					<>
						{contacts.length > 0 ? (
							<Panel
								header={
									<PanelHeader
										title={contacts.length > 1 ? "Contacts" : "Primary contact"}
									/>
								}
							>
								{contacts.map((contact, i) => {
									const cName =
										`${contact.firstName} ${contact.lastName}`.trim() ||
										"Unnamed contact";
									const cSub =
										[contact.jobTitle, contact.email, contact.phone]
											.filter(Boolean)
											.join("  ·  ") || undefined;
									const cActions: ChipAction[] = [];
									if (contact.phone) {
										cActions.push(
											{
												key: "call",
												label: `Call ${cName}`,
												Icon: Phone,
												onPress: () => openExternal(`tel:${contact.phone}`, "Phone"),
											},
											{
												key: "message",
												label: `Message ${cName}`,
												Icon: MessageSquare,
												onPress: () => openExternal(`sms:${contact.phone}`, "Messages"),
											}
										);
									}
									if (contact.email) {
										cActions.push({
											key: "email",
											label: `Email ${cName}`,
											Icon: Mail,
											onPress: () => openExternal(`mailto:${contact.email}`, "Mail"),
										});
									}
									return (
										<PersonRow
											key={contact._id}
											name={cName}
											sub={cSub}
											primary={contact._id === primaryContact?._id}
											actions={cActions}
											last={i === contacts.length - 1}
										/>
									);
								})}
							</Panel>
						) : (
							<EmptyPanel icon={Phone} title="No contacts yet" />
						)}

						{properties.length > 0 ? (
							<Panel
								header={
									<PanelHeader
										title={properties.length > 1 ? "Properties" : "Property"}
									/>
								}
							>
								{properties.map((property, i) => {
									const title =
										property.propertyName || property.streetAddress || "Property";
									const address = addressOf(property);
									const url = directionsFor(property);
									return (
										<LineRow
											key={property._id}
											title={title}
											sub={address || undefined}
											primary={property._id === primaryProperty?._id}
											action={
												url
													? {
															key: "directions",
															label: `Directions to ${title}`,
															Icon: Navigation,
															onPress: () => openExternal(url, "Maps"),
														}
													: undefined
											}
											last={i === properties.length - 1}
										/>
									);
								})}
							</Panel>
						) : (
							<EmptyPanel icon={MapPin} title="No properties yet" />
						)}

						<Panel
							header={
								<PanelHeader
									title="Active projects"
									action={canCreateProject ? "New" : undefined}
									onAction={() =>
										router.push({
											pathname: "/project/new",
											params: { clientId },
										} as unknown as Href)
									}
								/>
							}
						>
							{projects.slice(0, 3).map((project) => (
								<RecordRow
									key={project._id}
									kind="project"
									title={project.title}
									status={project.status}
									onPress={() =>
										shellNav
											? shellNav.open({ kind: "project", id: project._id })
											: router.push(`/projects/${project._id}`)
									}
								/>
							))}
							{projects.length === 0 ? (
								<AttributeRow label="Projects" value="No projects yet" />
							) : null}
						</Panel>

						<Panel header={<PanelHeader title="Details" />}>
							<View style={styles.editableRow}>
								<EditableField
									label="Company name"
									value={displayClient.companyName}
									onSave={(value) => handleSaveField("companyName", value)}
									placeholder="Company name"
								/>
							</View>
							{client.companyDescription ? (
								<View style={styles.editableRow}>
									<EditableField
										label="Description"
										value={client.companyDescription}
										onSave={async () => {}}
										editable={false}
									/>
								</View>
							) : null}
							{tags.length > 0 ? (
								<View style={styles.editableRow}>
									<EditableField
										label="Tags"
										value={tags.join("  ·  ")}
										onSave={async () => {}}
										editable={false}
									/>
								</View>
							) : null}
							<View style={styles.editableRow}>
								<EditableField
									label="Notes"
									value={displayClient.notes}
									onSave={(value) => handleSaveField("notes", value)}
									placeholder="Add notes about this client..."
									multiline
									numberOfLines={4}
								/>
							</View>
						</Panel>

						{/* Hidden without the view grant (the list query throws on
						    denial); visible while the grant is still loading. */}
						{permsLoading || can("documents", "view") ? (
							<Panel header={<PanelHeader title="Documents" />}>
								<RecordDocuments
									target={{ kind: "client", id: clientId as Id<"clients"> }}
									style={styles.flushCard}
								/>
							</Panel>
						) : null}
					</>
				) : null}

				{activeTab === "projects" ? (
					<Panel
						header={
							<PanelHeader
								title={`Projects${countSuffix(projects.length)}`}
								action={canCreateProject ? "New" : undefined}
								onAction={() =>
									router.push({
										pathname: "/project/new",
										params: { clientId },
									} as unknown as Href)
								}
							/>
						}
					>
						{projects.map((project) => (
							<RecordRow
								key={project._id}
								kind="project"
								title={project.title}
								status={project.status}
								onPress={() =>
									shellNav
										? shellNav.open({ kind: "project", id: project._id })
										: router.push(`/projects/${project._id}`)
								}
							/>
						))}
						{projects.length === 0 ? (
							<AttributeRow label="Projects" value="No projects yet" />
						) : null}
					</Panel>
				) : null}

				{activeTab === "quotes" ? (
					<Panel
						header={
							<PanelHeader
								title={`Quotes${countSuffix(quotes.length)}`}
								// The tray's primary action already creates a quote on the
								// phone — this link would duplicate it. Pane mode has no tray.
								action={isPane && canCreateQuote ? "New" : undefined}
								onAction={openNewQuote}
							/>
						}
					>
						{quotes.map((quote) => (
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
						{quotes.length === 0 ? (
							<AttributeRow label="Quotes" value="No quotes yet" />
						) : null}
					</Panel>
				) : null}

				{activeTab === "invoices" ? (
					<Panel header={<PanelHeader title={`Invoices${countSuffix(invoices.length)}`} />}>
						{invoices.map((invoice) => (
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
						{invoices.length === 0 ? (
							<AttributeRow label="Invoices" value="No invoices yet" />
						) : null}
					</Panel>
				) : null}
			</CanvasScroll>

			<MentionModal
				visible={mentionModalVisible}
				onClose={() => setMentionModalVisible(false)}
				entityType="client"
				entityId={clientId as Id<"clients">}
				entityName={displayClient.companyName}
			/>
		</View>
	);
}

// Thin route wrapper — reads the id from the route, renders the body in "root"
// mode (iPhone-identical). The iPad pane imports ClientDetailBody directly.
export default function ClientDetailScreen() {
	const { clientId } = useLocalSearchParams<{ clientId: string }>();
	return <ClientDetailBody id={clientId} />;
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	editableRow: { paddingHorizontal: 14, paddingVertical: 10 },
	flushCard: { borderWidth: 0, borderRadius: 0, padding: 12 },
});
