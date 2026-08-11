import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	Pressable,
	StyleSheet,
	Linking,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState, useCallback } from "react";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
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
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { useShellNav } from "@/lib/shell-nav";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { MentionModal } from "@/components/MentionModal";
import { IdentityBlock } from "@/components/identity-block";
import { QuickActions, type QuickAction } from "@/components/quick-actions";
import { DotGrid, SectionHeader, ListRow } from "@/components/ui";
import {
	Illustration,
	type IllustrationName,
} from "@/components/illustrations";
import {
	Phone,
	Mail,
	MessageSquare,
	Navigation,
	Plus,
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
	const appHeaderMode = headerMode === "pane" ? "pane" : "detail";
	const [refreshing, setRefreshing] = useState(false);
	const [mentionModalVisible, setMentionModalVisible] = useState(false);
	const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

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
					<AppHeader mode={appHeaderMode} />
				)}
				{/* Skeleton is shaped like the real layout: monogram + name, the
				    four action tiles, then list rows. */}
				<ScrollView
					contentContainerStyle={[
						styles.scroll,
						{ paddingBottom: scrollBottom },
					]}
				>
					<View style={styles.skeletonIdentity}>
						<View
							style={[
								styles.skeletonMonogram,
								{ backgroundColor: t.lineSoft },
							]}
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
								style={[
									styles.skeletonTile,
									{ backgroundColor: t.lineSoft },
								]}
							/>
						))}
					</View>
					{[0, 1, 2].map((i) => (
						<View key={i} style={styles.skeletonRow}>
							<View
								style={[
									styles.skeletonRowTile,
									{ backgroundColor: t.lineSoft },
								]}
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

	const status = optimisticStatus ?? client.status;

	const primaryProperty = properties.find((p) => p.isPrimary) ?? properties[0];
	const primaryContact = contacts.find((c) => c.isPrimary) ?? contacts[0];

	const propertyAddress = primaryProperty
		? primaryProperty.formattedAddress ||
			[
				primaryProperty.streetAddress,
				primaryProperty.city,
				primaryProperty.state,
				primaryProperty.zipCode,
			]
				.filter(Boolean)
				.join(", ")
		: undefined;

	// Identity sub line: lead source, else the primary property's city.
	const identitySub = client.leadSource
		? (LEAD_SOURCE_LABEL[client.leadSource] ?? client.leadSource)
		: primaryProperty?.city || undefined;

	const phone = primaryContact?.phone;
	const email = primaryContact?.email;
	const directionsUrl =
		primaryProperty &&
		primaryProperty.latitude !== undefined &&
		primaryProperty.longitude !== undefined
			? appleMapsUrl(primaryProperty.latitude, primaryProperty.longitude)
			: propertyAddress
				? appleMapsAddressUrl(propertyAddress)
				: undefined;

	// Every tile stays visible; missing data dims it rather than hiding it.
	const quickActions: QuickAction[] = [
		{
			key: "call",
			label: "Call",
			Icon: Phone,
			disabled: !phone,
			onPress: () => phone && Linking.openURL(`tel:${phone}`),
		},
		{
			key: "message",
			label: "Message",
			Icon: MessageSquare,
			disabled: !phone,
			onPress: () => phone && Linking.openURL(`sms:${phone}`),
		},
		{
			key: "email",
			label: "Email",
			Icon: Mail,
			disabled: !email,
			onPress: () => email && Linking.openURL(`mailto:${email}`),
		},
		{
			key: "directions",
			label: "Directions",
			Icon: Navigation,
			disabled: !directionsUrl,
			onPress: () => directionsUrl && Linking.openURL(directionsUrl),
		},
	];

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
				<AppHeader mode={appHeaderMode} title={client.companyName} />
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
					tint={recordTint.client}
					monogram={client.companyName}
					statusKey={status}
					sub={identitySub}
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
								style={[styles.statusTrigger, { borderBottomColor: t.faint }]}
							>
								{statusText}
							</View>
						</FieldMenu>
					)}
				/>

				<View style={styles.actionsWrap}>
					<QuickActions actions={quickActions} />
				</View>

				{/* Team chat — relocated from the old floating FAB */}
				<Pressable
					onPress={() => setMentionModalVisible(true)}
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

				{/* Company — quiet stacked text, no card */}
				<View style={styles.section}>
					<SectionHeader title="Company" />
					<View style={styles.stack}>
						<EditableField
							label="Company name"
							value={client.companyName}
							onSave={(value) => handleSaveField("companyName", value)}
							placeholder="Company name"
						/>
						{client.companyDescription ? (
							<View style={styles.readField}>
								<Text style={[styles.readLabel, { color: t.faint }]}>
									Description
								</Text>
								<Text style={[styles.readValue, { color: t.ink }]}>
									{client.companyDescription}
								</Text>
							</View>
						) : null}
						{tags.length > 0 ? (
							<View style={styles.readField}>
								<Text style={[styles.readLabel, { color: t.faint }]}>Tags</Text>
								<Text style={[styles.readValue, { color: t.ink }]}>
									{tags.join("  ·  ")}
								</Text>
							</View>
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

				{/* Contacts (read-only; Call on phone) */}
				<View style={styles.section}>
					<SectionHeader title={`Contacts${countSuffix(contacts.length)}`} />
					{contacts.length > 0 ? (
						<View>
							{contacts.map((contact, i) => {
								const name =
									`${contact.firstName} ${contact.lastName}`.trim() ||
									"Unnamed contact";
								const sub =
									[
										contact.isPrimary ? "Primary" : null,
										contact.jobTitle,
										contact.email,
									]
										.filter(Boolean)
										.join("  ·  ") || undefined;
								return (
									<ListRow
										key={contact._id}
										icon="User"
										title={name}
										sub={sub}
										showChevron={false}
										last={i === contacts.length - 1}
										right={
											contact.phone ? (
												<Pressable
													onPress={() =>
														Linking.openURL(`tel:${contact.phone}`)
													}
													accessibilityRole="button"
													accessibilityLabel={`Call ${name}`}
													hitSlop={8}
													style={({ pressed }) => [
														styles.callRow,
														pressed && styles.pressed,
													]}
												>
													<Phone size={14} color={t.frostedInk} />
													<Text
														style={[styles.callText, { color: t.frostedInk }]}
														numberOfLines={1}
													>
														{contact.phone}
													</Text>
												</Pressable>
											) : undefined
										}
									/>
								);
							})}
						</View>
					) : (
						// Web aliases client-contacts-none onto the clients art — same here.
						<EmptyRow text="No contacts yet" illo="clients-none" />
					)}
				</View>

				{/* Properties */}
				<View style={styles.section}>
					<SectionHeader
						title={`Properties${countSuffix(properties.length)}`}
					/>
					{properties.length > 0 ? (
						<View>
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
								return (
									<ListRow
										key={property._id}
										icon="MapPin"
										title={isPrimary ? `${title}  ·  Primary` : title}
										sub={address || undefined}
										showChevron={false}
										last={i === properties.length - 1}
									/>
								);
							})}
						</View>
					) : (
						<EmptyRow text="No properties yet" illo="client-properties-none" />
					)}
				</View>

				{/* Projects */}
				<View style={styles.section}>
					<View style={styles.headerRow}>
						<View style={styles.headerGrow}>
							<SectionHeader
								title={`Projects${countSuffix(projects.length)}`}
								action={projects.length > 0 ? "View all" : undefined}
								onAction={() =>
									// iPad: scope Work's chip to Projects. iPhone keeps the route.
									shellNav ? shellNav.browse("project") : router.push("/projects")
								}
							/>
						</View>
						<Pressable
							onPress={() =>
								// Cast: /project/new isn't in the generated route map yet.
								router.push({
									pathname: "/project/new",
									params: { clientId },
								} as unknown as Href)
							}
							hitSlop={12}
							accessibilityRole="button"
							accessibilityLabel="New project for this client"
							style={({ pressed }) => [
								styles.newAction,
								pressed && styles.pressed,
							]}
						>
							<Plus size={14} color={t.frostedInk} />
							<Text style={[styles.newActionText, { color: t.frostedInk }]}>
								New project
							</Text>
						</Pressable>
					</View>
					{recentProjects.length > 0 ? (
						<View>
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
						</View>
					) : (
						<EmptyRow text="No projects yet" illo="projects-none" />
					)}
				</View>

				{/* Quotes */}
				<View style={styles.section}>
					<View style={styles.headerRow}>
						<View style={styles.headerGrow}>
							<SectionHeader title={`Quotes${countSuffix(quotes.length)}`} />
						</View>
						<Pressable
							onPress={() =>
								// Cast: /quote/new isn't in the generated route map yet.
								router.push({
									pathname: "/quote/new",
									params: { clientId },
								} as unknown as Href)
							}
							hitSlop={12}
							accessibilityRole="button"
							accessibilityLabel="New quote for this client"
							style={({ pressed }) => [
								styles.newAction,
								pressed && styles.pressed,
							]}
						>
							<Plus size={14} color={t.frostedInk} />
							<Text style={[styles.newActionText, { color: t.frostedInk }]}>
								New quote
							</Text>
						</Pressable>
					</View>
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
					<SectionHeader title={`Invoices${countSuffix(invoices.length)}`} />
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
	scroll: { padding: 16, gap: 0 },
	pressed: { opacity: 0.7 },

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

	actionsWrap: { marginTop: 18 },

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
	readField: { paddingVertical: 8, paddingHorizontal: 2, gap: 3 },
	readLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.eyebrow,
	},
	readValue: { fontFamily: fontFamily.regular, fontSize: type.body },

	headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	headerGrow: { flex: 1, minWidth: 0 },
	newAction: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		flexShrink: 0,
	},
	newActionText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
	},

	callRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		maxWidth: 150,
		// Painted, not hitSlop-only — the row keeps a tappable target.
		minHeight: touch.min,
	},
	callText: { fontFamily: fontFamily.semibold, fontSize: type.meta },

	empty: {
		paddingVertical: 18,
		alignItems: "center",
		gap: 8,
	},
	emptyText: { fontFamily: fontFamily.regular, fontSize: type.meta },
});
