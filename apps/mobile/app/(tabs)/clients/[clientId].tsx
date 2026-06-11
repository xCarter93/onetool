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
import { SafeAreaView } from "react-native-safe-area-context";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, useTokens, STATUS } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { EditableField } from "@/components/EditableField";
import { FieldMenu } from "@/components/FieldMenu";
import { MentionModal } from "@/components/MentionModal";
import { Card, Avatar, Badge, SectionHeader, ListRow } from "@/components/ui";
import {
	Phone,
	Mail,
	MessageSquare,
	MapPin,
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

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);

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
	// In an iPad pane the header is a PaneHeader (the shell's selection drives
	// nav, so onBack clears it; router.back would pop out of the shell). onBack
	// is undefined in landscape (list always visible → no back button shown).
	const isPane = headerMode === "pane";
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
				{isPane ? (
					<PaneHeader onBack={onBack} />
				) : (
					<AppHeader mode={appHeaderMode} />
				)}
				<ScrollView contentContainerStyle={styles.scroll}>
					<View
						style={[
							styles.skeletonCard,
							{ backgroundColor: t.card, borderColor: t.line },
						]}
					/>
					<View
						style={[
							styles.skeletonRow,
							{ backgroundColor: t.muted, marginTop: 14 },
						]}
					/>
					<View
						style={[
							styles.skeletonRow,
							{ backgroundColor: t.muted, marginTop: 10 },
						]}
					/>
				</ScrollView>
			</SafeAreaView>
		);
	}

	const initials = client.companyName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	const status = optimisticStatus ?? client.status;
	const statusLabel = STATUS[status as keyof typeof STATUS]?.label ?? status;

	const primaryProperty = properties.find((p) => p.isPrimary) ?? properties[0];

	const recentProjects = projects.slice(0, 3);
	const recentQuotes = quotes.slice(0, 3);
	const recentInvoices = invoices.slice(0, 3);

	return (
		<SafeAreaView
			style={[styles.flex, { backgroundColor: t.bg }]}
			edges={[]}
		>
			{isPane ? (
				<PaneHeader title={client.companyName} onBack={onBack} />
			) : (
				<AppHeader mode={appHeaderMode} title={client.companyName} />
			)}
			<ScrollView
				contentContainerStyle={styles.scroll}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Identity */}
				<Card>
					<View style={styles.identityRow}>
						<Avatar text={initials} size={56} />
						<View style={styles.identityBody}>
							<Text
								style={[styles.companyName, { color: t.ink }]}
								numberOfLines={2}
							>
								{client.companyName}
							</Text>
							{/* alignSelf:flex-start sizes the menu host to its content.
							    The parent identityBody is flex:1/minWidth:0 (so the long
							    company name wraps), which otherwise stretches the native
							    MenuView trigger and clips the Badge label to "..". The
							    project pill avoids this only because its parent uses
							    alignItems:flex-end. */}
							<View style={styles.statusWrap}>
								<FieldMenu
									title="Client status"
									value={status}
									options={STATUS_OPTIONS}
									onSelect={handleSelectStatus}
								>
									{/* Bare Badge is the sole trigger child — a row sibling
									    (e.g. a chevron) gets squeezed by the native menu host
									    and clips the label. Underline affordance matches the
									    project status pill. */}
									<View
										accessibilityRole="button"
										accessibilityLabel={`Status: ${statusLabel}. Tap to change`}
										style={[
											styles.statusTrigger,
											{ borderBottomColor: t.faint },
										]}
									>
										<Badge status={status} big />
									</View>
								</FieldMenu>
							</View>
						</View>
					</View>
				</Card>

				{/* Team chat — relocated from the old floating FAB */}
				<Pressable
					onPress={() => setMentionModalVisible(true)}
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

				{/* Company (inline edit) */}
				<View style={styles.section}>
					<SectionHeader title="Company" />
					<Card style={styles.fieldCard}>
						<EditableField
							label="Company name"
							value={client.companyName}
							onSave={(value) => handleSaveField("companyName", value)}
							placeholder="Company name"
						/>
						<EditableField
							label="Notes"
							value={client.notes}
							onSave={(value) => handleSaveField("notes", value)}
							placeholder="Add notes about this client..."
							multiline
							numberOfLines={4}
						/>
					</Card>
				</View>

				{/* Contacts (read-only; Call on phone) */}
				<View style={styles.section}>
					<SectionHeader title={`Contacts${countSuffix(contacts.length)}`} />
					{contacts.length > 0 ? (
						<Card style={styles.listCard}>
							{contacts.map((contact, i) => {
								const name =
									`${contact.firstName} ${contact.lastName}`.trim() ||
									"Unnamed contact";
								const isLast = i === contacts.length - 1;
								return (
									<View
										key={contact._id}
										style={[
											styles.contactRow,
											{
												borderBottomColor: t.line,
												borderBottomWidth: isLast ? 0 : 1,
											},
										]}
									>
										<View style={styles.contactHead}>
											<View
												style={[
													styles.contactIcon,
													{ backgroundColor: t.accentSoft },
												]}
											>
												<User size={16} color={t.accent} />
											</View>
											<View style={styles.contactInfo}>
												<Text
													style={[styles.contactName, { color: t.ink }]}
													numberOfLines={1}
												>
													{name}
													{contact.isPrimary ? "  ·  Primary" : ""}
												</Text>
												{contact.jobTitle ? (
													<Text
														style={[styles.contactSub, { color: t.sub }]}
														numberOfLines={1}
													>
														{contact.jobTitle}
													</Text>
												) : null}
											</View>
										</View>
										<View style={styles.contactActions}>
											{contact.email ? (
												<View style={styles.contactLine}>
													<Mail size={14} color={t.faint} />
													<Text
														style={[styles.contactLineText, { color: t.sub }]}
														numberOfLines={1}
													>
														{contact.email}
													</Text>
												</View>
											) : null}
											{contact.phone ? (
												<Pressable
													onPress={() => Linking.openURL(`tel:${contact.phone}`)}
													accessibilityRole="button"
													accessibilityLabel={`Call ${name}`}
													style={({ pressed }) => [
														styles.callRow,
														pressed && styles.pressed,
													]}
												>
													<Phone size={14} color={t.accent} />
													<Text
														style={[styles.callText, { color: t.accent }]}
														numberOfLines={1}
													>
														{contact.phone}
													</Text>
												</Pressable>
											) : null}
										</View>
									</View>
								);
							})}
						</Card>
					) : (
						<EmptyRow text="No contacts yet" />
					)}
				</View>

				{/* Properties (the section missing today) */}
				<View style={styles.section}>
					<SectionHeader
						title={`Properties${countSuffix(properties.length)}`}
					/>
					{properties.length > 0 ? (
						<Card style={styles.listCard}>
							{properties.map((property, i) => {
								const title =
									property.propertyName ||
									property.streetAddress ||
									"Property";
								const sub =
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
									<View
										key={property._id}
										style={[
											styles.contactRow,
											{
												borderBottomColor: t.line,
												borderBottomWidth: i === properties.length - 1 ? 0 : 1,
											},
										]}
									>
										<View style={styles.contactHead}>
											<View
												style={[
													styles.contactIcon,
													{ backgroundColor: t.accentSoft },
												]}
											>
												<MapPin size={16} color={t.accent} />
											</View>
											<View style={styles.contactInfo}>
												<Text
													style={[styles.contactName, { color: t.ink }]}
													numberOfLines={1}
												>
													{title}
													{isPrimary ? "  ·  Primary" : ""}
												</Text>
												{sub ? (
													<Text
														style={[styles.contactSub, { color: t.sub }]}
														numberOfLines={2}
													>
														{sub}
													</Text>
												) : null}
											</View>
										</View>
									</View>
								);
							})}
						</Card>
					) : (
						<EmptyRow text="No properties yet" />
					)}
				</View>

				{/* Projects */}
				<View style={styles.section}>
					<SectionHeader
						title={`Projects${countSuffix(projects.length)}`}
						action={projects.length > 0 ? "View all" : undefined}
						onAction={() => router.push("/projects")}
					/>
					{recentProjects.length > 0 ? (
						<Card style={styles.listCard}>
							{recentProjects.map((project, i) => (
								<ListRow
									key={project._id}
									title={project.title}
									status={project.status}
									showChevron={false}
									onPress={() => router.push(`/projects/${project._id}`)}
									last={i === recentProjects.length - 1}
								/>
							))}
						</Card>
					) : (
						<EmptyRow text="No projects yet" />
					)}
				</View>

				{/* Quotes */}
				<View style={styles.section}>
					<SectionHeader title={`Quotes${countSuffix(quotes.length)}`} />
					{recentQuotes.length > 0 ? (
						<Card style={styles.listCard}>
							{recentQuotes.map((quote, i) => (
								<ListRow
									key={quote._id}
									title={quote.title || `Quote #${quote.quoteNumber}`}
									sub={formatCurrency(quote.total)}
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
						</Card>
					) : (
						<EmptyRow text="No quotes yet" />
					)}
				</View>

				{/* Invoices */}
				<View style={styles.section}>
					<SectionHeader title={`Invoices${countSuffix(invoices.length)}`} />
					{recentInvoices.length > 0 ? (
						<Card style={styles.listCard}>
							{recentInvoices.map((invoice, i) => (
								<ListRow
									key={invoice._id}
									title={`Invoice #${invoice.invoiceNumber}`}
									sub={formatCurrency(invoice.total)}
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
						</Card>
					) : (
						<EmptyRow text="No invoices yet" />
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

function EmptyRow({ text }: { text: string }) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.empty,
				{ backgroundColor: t.muted, borderColor: t.line },
			]}
		>
			<Text style={[styles.emptyText, { color: t.sub }]}>{text}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	scroll: { padding: 16, gap: 0 },
	pressed: { opacity: 0.7 },

	skeletonCard: {
		height: 96,
		borderRadius: radii.rLg,
		borderWidth: 1,
	},
	skeletonRow: {
		height: 60,
		borderRadius: radii.r,
	},

	identityRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
	},
	identityBody: { flex: 1, minWidth: 0 },
	companyName: {
		fontFamily: fontFamily.bold,
		fontSize: 18,
		letterSpacing: -0.2,
	},
	statusWrap: {
		marginTop: 8,
		alignSelf: "flex-start",
	},
	statusTrigger: {
		alignSelf: "flex-start",
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

	section: { marginTop: 22, gap: 10 },
	fieldCard: { paddingBottom: 2 },
	listCard: { paddingVertical: 6 },

	contactRow: { paddingVertical: 12, paddingHorizontal: 4, gap: 8 },
	contactHead: { flexDirection: "row", alignItems: "center", gap: 10 },
	contactIcon: {
		width: 32,
		height: 32,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	contactInfo: { flex: 1, minWidth: 0 },
	contactName: { fontFamily: fontFamily.semibold, fontSize: 13 },
	contactSub: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 },
	contactActions: { gap: 6, paddingLeft: 42 },
	contactLine: { flexDirection: "row", alignItems: "center", gap: 8 },
	contactLineText: { fontFamily: fontFamily.regular, fontSize: 12, flex: 1 },
	callRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		alignSelf: "flex-start",
	},
	callText: { fontFamily: fontFamily.semibold, fontSize: 12 },

	empty: {
		borderRadius: radii.r,
		borderWidth: 1,
		paddingVertical: 18,
		alignItems: "center",
	},
	emptyText: { fontFamily: fontFamily.regular, fontSize: 12 },
});
