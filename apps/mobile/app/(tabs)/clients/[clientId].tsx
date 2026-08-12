import { View, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { useOrganization } from "@clerk/expo";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { DOCK_CLEARANCE, STATUS, useTokens } from "@/lib/theme";
import { formatCurrency } from "@/lib/format";
import { appleMapsAddressUrl, appleMapsUrl } from "@/lib/route-run";
import { InkTabHeader } from "@/components/ink-tab-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { MentionModal } from "@/components/MentionModal";
import { IdentityBlock, IdentityMeta } from "@/components/identity-block";
import {
	countSuffix,
	detailStyles,
	DetailSkeleton,
	EmptyRow,
	FactCard,
	FactRow,
	SectionLabel,
	SectionLink,
	TeamChatButton,
	type FactAction,
} from "@/components/record-detail";
import { openExternal } from "@/lib/open-external";
import { recordRecentView } from "@/lib/recents";
import { usePermissions } from "@/lib/use-permissions";
import { DotGrid, ListRow } from "@/components/ui";
import { RecordDocuments } from "@/components/RecordDocuments";
import {
	Phone,
	Mail,
	MapPin,
	MessageSquare,
	Navigation,
	Plus,
	User,
} from "lucide-react-native";

type ClientStatus = "lead" | "active" | "inactive" | "archived";

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
	// In an iPad pane the header is a PaneHeader (the shell's selection drives
	// nav, so onBack clears it; router.back would pop out of the shell). onBack
	// is undefined in landscape (list always visible → no back button shown).
	const isPane = headerMode === "pane";
	const insets = useSafeAreaInsets();
	// The floating dock takes no layout height — scroll content clears it
	// itself. iPad panes have no dock (the shell replaces Tabs).
	const scrollBottom = isPane ? 16 : DOCK_CLEARANCE + insets.bottom;
	const [refreshing, setRefreshing] = useState(false);
	const [mentionModalVisible, setMentionModalVisible] = useState(false);
	const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
	const { can, isLoading: permsLoading } = usePermissions();

	const client = useQuery(
		api.clients.get,
		clientId ? { id: clientId as Id<"clients"> } : "skip"
	);
	const contacts =
		useQuery(
			api.clientContacts.listByClient,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const properties =
		useQuery(
			api.clientProperties.listByClient,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const projects =
		useQuery(
			api.projects.list,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const quotes =
		useQuery(
			api.quotes.list,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];
	const invoices =
		useQuery(
			api.invoices.list,
			clientId ? { clientId: clientId as Id<"clients"> } : "skip"
		) ?? [];

	// On-device "Recently viewed" trail for the Work tab (Slice 6). Fire-and-
	// forget, and only once the doc has loaded so the snapshot is a real title.
	const { organization } = useOrganization();
	const orgId = organization?.id;
	const recentId = client?._id;
	const recentTitle = client?.companyName;
	const recentSub = client?.companyDescription?.trim() || properties[0]?.city;
	// One-shot per visit (same guard as the projects screen): recentSub arrives
	// late with the properties query and would otherwise re-record the visit.
	const recordedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!recentId || !recentTitle || !orgId) return;
		if (recordedRef.current === recentId) return;
		recordedRef.current = recentId;
		recordRecentView(orgId, {
			kind: "client",
			id: recentId,
			title: recentTitle,
			sub: recentSub,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [orgId, recentId, recentTitle]);

	const updateClient = useMutation(api.clients.update);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 800);
	}, []);

	// Send ONLY the edited field; skip unchanged values (clients.update throws
	// "No updates" on an empty patch — Pitfall 3).
	const handleSaveField = async (
		field: "companyName" | "notes",
		value: string
	) => {
		if (!clientId || !client) return;
		if ((client[field] ?? "") === value) return;
		await updateClient({ id: clientId as Id<"clients">, [field]: value });
	};

	const handleSelectStatus = async (next: string) => {
		if (!clientId || !client || next === client.status) return;
		setOptimisticStatus(next);
		try {
			await updateClient({
				id: clientId as Id<"clients">,
				status: next as ClientStatus,
			});
		} catch {
			setOptimisticStatus(null);
		}
	};

	if (!client) {
		return (
			<SafeAreaView
				style={[styles.flex, { backgroundColor: t.bg }]}
				edges={[]}
			>
				<DotGrid style={StyleSheet.absoluteFill} />
				{isPane ? (
					<PaneHeader onBack={onBack} />
				) : (
					<InkTabHeader title="Client" onBack={() => router.back()} />
				)}
				{/* Skeleton mirrors the real layout: hero, team-chat pill, then
				    list rows. */}
				<ScrollView
					contentContainerStyle={[
						styles.scroll,
						{ paddingBottom: scrollBottom },
					]}
				>
					<DetailSkeleton variant="client" />
				</ScrollView>
			</SafeAreaView>
		);
	}

	const status = optimisticStatus ?? client.status;

	const primaryProperty = properties.find((p) => p.isPrimary) ?? properties[0];
	const primaryContact = contacts.find((c) => c.isPrimary) ?? contacts[0];

	// Identity meta line: where this client is. Lead source only stands in when
	// there is no location to show.
	const identityLocation =
		[primaryProperty?.city, primaryProperty?.state].filter(Boolean).join(", ") ||
		undefined;
	const identitySub =
		identityLocation ??
		(client.leadSource
			? (LEAD_SOURCE_LABEL[client.leadSource] ?? client.leadSource)
			: undefined);

	// Directions for one property — the project's own resolution, per row:
	// coordinates win, else the formatted address, else no action at all.
	const directionsFor = (property: (typeof properties)[number]) => {
		const address =
			property.formattedAddress ||
			[
				property.streetAddress,
				property.city,
				property.state,
				property.zipCode,
			]
				.filter(Boolean)
				.join(", ");
		if (property.latitude !== undefined && property.longitude !== undefined) {
			return appleMapsUrl(property.latitude, property.longitude);
		}
		return address ? appleMapsAddressUrl(address) : undefined;
	};

	// Creation links are permission-gated, and the convention is to HIDE (not
	// dim) what the user may not do — but stay visible while the grant is still
	// loading, so the header doesn't reflow under a tap.
	const canCreateProject = permsLoading || can("projects", "modify");
	const canCreateQuote = permsLoading || can("quotes", "modify");

	const recentProjects = projects.slice(0, 3);
	const recentQuotes = quotes.slice(0, 3);
	const recentInvoices = invoices.slice(0, 3);

	const tags = client.tags?.filter(Boolean) ?? [];

	return (
		<SafeAreaView
			style={[styles.flex, { backgroundColor: t.bg }]}
			edges={[]}
		>
			<DotGrid style={StyleSheet.absoluteFill} />
			{isPane ? (
				<PaneHeader title={client.companyName} onBack={onBack} />
			) : (
				<InkTabHeader
					title={client.companyName}
					onBack={() => router.back()}
				/>
			)}
			<ScrollView
				contentContainerStyle={[
					styles.scroll,
					{ paddingBottom: scrollBottom },
				]}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Identity — status is TEXT; the FieldMenu hangs off it so the one
				    place a client status can change keeps working. */}
				<IdentityBlock
					statusKey={status}
					name={client.companyName}
					meta={identitySub ? <IdentityMeta>{identitySub}</IdentityMeta> : null}
					renderStatus={(statusText) => (
						<FieldMenu
							title="Client status"
							value={status}
							options={STATUS_OPTIONS}
							onSelect={handleSelectStatus}
						>
							{/* A single bare child is the whole trigger — a row sibling
							    gets squeezed by the native menu host and clips the label. */}
							<View
								accessibilityRole="button"
								// Status-as-text removed the badge, so the label must still
								// speak the CURRENT value — the trigger's label overrides the
								// child Text for VoiceOver.
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

				{/* One quiet verb near the hero. Call/message/email/directions now
				    live on the rows that own the data. */}
				<TeamChatButton
					onPress={() => setMentionModalVisible(true)}
					style={styles.teamChat}
				/>

				{/* Company — editable fields read as wells; read-only twins stay flat */}
				<View style={detailStyles.section}>
					<SectionLabel title="Company" />
					<View style={detailStyles.stack}>
						<EditableField
							label="Company name"
							value={client.companyName}
							onSave={(value) => handleSaveField("companyName", value)}
							placeholder="Company name"
						/>
						{/* Read-only twins: no well, no pencil — the affordance only
						    means something where it is absent from static text. */}
						{client.companyDescription ? (
							<EditableField
								label="Description"
								value={client.companyDescription}
								onSave={async () => {}}
								editable={false}
							/>
						) : null}
						{tags.length > 0 ? (
							<EditableField
								label="Tags"
								value={tags.join("  ·  ")}
								onSave={async () => {}}
								editable={false}
							/>
						) : null}
						<EditableField
							label="Notes"
							value={client.notes}
							onSave={(value) => handleSaveField("notes", value)}
							placeholder="Add notes about this client..."
							multiline
							numberOfLines={4}
						/>
					</View>
				</View>

				{/* Contacts — every row carries only the actions its data supports:
				    no phone, no call/message button. */}
				<View style={detailStyles.section}>
					<SectionLabel title={`Contacts${countSuffix(contacts.length)}`} />
					{contacts.length > 0 ? (
						<FactCard>
							{contacts.map((contact, i) => {
								const name =
									`${contact.firstName} ${contact.lastName}`.trim() ||
									"Unnamed contact";
								const isPrimary = contact._id === primaryContact?._id;
								const sub =
									[contact.jobTitle, contact.email, contact.phone]
										.filter(Boolean)
										.join("  ·  ") || undefined;
								const actions: FactAction[] = [];
								if (contact.phone) {
									actions.push(
										{
											key: "call",
											label: `Call ${name}`,
											Icon: Phone,
											onPress: () =>
												openExternal(`tel:${contact.phone}`, "Phone"),
										},
										{
											key: "message",
											label: `Message ${name}`,
											Icon: MessageSquare,
											onPress: () =>
												openExternal(`sms:${contact.phone}`, "Messages"),
										}
									);
								}
								if (contact.email) {
									actions.push({
										key: "email",
										label: `Email ${name}`,
										Icon: Mail,
										onPress: () =>
											openExternal(`mailto:${contact.email}`, "Mail"),
									});
								}
								return (
									<FactRow
										key={contact._id}
										Icon={User}
										title={isPrimary ? `${name}  ·  Primary` : name}
										sub={sub}
										actions={actions}
										last={i === contacts.length - 1}
									/>
								);
							})}
						</FactCard>
					) : (
						// Web aliases client-contacts-none onto the clients art — same here.
						<EmptyRow text="No contacts yet" illo="clients-none" />
					)}
				</View>

				{/* Properties — directions resolve per row (coords, else address);
				    a property with neither carries no button. */}
				<View style={detailStyles.section}>
					<SectionLabel title={`Properties${countSuffix(properties.length)}`} />
					{properties.length > 0 ? (
						<FactCard>
							{properties.map((property, i) => {
								const title =
									property.propertyName || property.streetAddress || "Property";
								const address =
									property.formattedAddress ||
									[
										property.streetAddress,
										property.city,
										property.state,
										property.zipCode,
									]
										.filter(Boolean)
										.join(", ");
								const isPrimary = property._id === primaryProperty?._id;
								const url = directionsFor(property);
								return (
									<FactRow
										key={property._id}
										Icon={MapPin}
										title={isPrimary ? `${title}  ·  Primary` : title}
										sub={address || undefined}
										actions={
											url
												? [
														{
															key: "directions",
															label: `Directions to ${title}`,
															Icon: Navigation,
															onPress: () => openExternal(url, "Maps"),
														},
													]
												: []
										}
										last={i === properties.length - 1}
									/>
								);
							})}
						</FactCard>
					) : (
						<EmptyRow text="No properties yet" illo="client-properties-none" />
					)}
				</View>

				{/* Projects */}
				<View style={detailStyles.section}>
					<SectionLabel
						title={`Projects${countSuffix(projects.length)}`}
						right={
							<View style={styles.headerLinks}>
								{projects.length > 0 ? (
									<SectionLink
										label="View all"
										accessibilityLabel="View all projects"
										onPress={() =>
											// iPad: scope Work's chip to Projects. iPhone keeps the route.
											shellNav
												? shellNav.browse("project")
												: router.push("/projects")
										}
									/>
								) : null}
								{canCreateProject ? (
									<SectionLink
										label="New"
										Icon={Plus}
										accessibilityLabel="New project for this client"
										onPress={() =>
											// Cast: /project/new isn't in the generated route map yet.
											router.push({
												pathname: "/project/new",
												params: { clientId },
											} as unknown as Href)
										}
									/>
								) : null}
							</View>
						}
					/>
					{recentProjects.length > 0 ? (
						<FactCard style={detailStyles.sectionCard}>
							{recentProjects.map((project, i) => (
								<ListRow
									key={project._id}
									title={project.title}
									status={project.status}
									showChevron={false}
									onPress={() =>
										shellNav
											? shellNav.open({ kind: "project", id: project._id })
											: router.push(`/projects/${project._id}`)
									}
									last={i === recentProjects.length - 1}
								/>
							))}
						</FactCard>
					) : (
						<EmptyRow text="No projects yet" illo="projects-none" />
					)}
				</View>

				{/* Quotes */}
				<View style={detailStyles.section}>
					<SectionLabel
						title={`Quotes${countSuffix(quotes.length)}`}
						right={
							canCreateQuote ? (
								<SectionLink
									label="New"
									Icon={Plus}
									accessibilityLabel="New quote for this client"
									onPress={() =>
										// Cast: /quote/new isn't in the generated route map yet.
										router.push({
											pathname: "/quote/new",
											params: { clientId },
										} as unknown as Href)
									}
								/>
							) : undefined
						}
					/>
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
										// Cast: dynamic detail route isn't in the generated route map.
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
					<SectionLabel title={`Invoices${countSuffix(invoices.length)}`} />
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
										// Cast: dynamic detail route isn't in the generated route map.
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

				{/* Documents */}
				<View style={detailStyles.section}>
					<SectionLabel title="Documents" />
					<RecordDocuments
						target={{ kind: "client", id: clientId as Id<"clients"> }}
					/>
				</View>

				<View style={{ height: 32 }} />
			</ScrollView>

			<MentionModal
				visible={mentionModalVisible}
				onClose={() => setMentionModalVisible(false)}
				entityType="client"
				entityId={clientId as Id<"clients">}
				entityName={client.companyName}
			/>
		</SafeAreaView>
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
	scroll: { padding: 16, gap: 0 },

	// A single quiet pill sits alone under the hero — it no longer follows a
	// tile row, so it carries the whole gap itself.
	teamChat: { marginTop: 16, alignSelf: "flex-start", paddingHorizontal: 14 },

	headerLinks: { flexDirection: "row", alignItems: "center", gap: 16 },
});
