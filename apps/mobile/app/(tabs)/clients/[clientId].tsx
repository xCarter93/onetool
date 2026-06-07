import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	Pressable,
	StyleSheet,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/Card";
import { EditableField } from "@/components/EditableField";
import { SectionHeader } from "@/components/SectionHeader";
import { MentionModal } from "@/components/MentionModal";
import {
	Mail,
	Phone,
	FolderKanban,
	FileText,
	ChevronRight,
	User,
	Tag,
	MessageSquare,
} from "lucide-react-native";

type ClientStatus = "lead" | "active" | "inactive" | "archived";

export default function ClientDetailScreen() {
	const { clientId } = useLocalSearchParams<{ clientId: string }>();
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const [mentionModalVisible, setMentionModalVisible] = useState(false);

	const client = useQuery(
		api.clients.get,
		clientId ? { id: clientId as Id<"clients"> } : "skip"
	);

	const contacts = useQuery(
		api.clientContacts.listByClient,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);

	const projects = useQuery(
		api.projects.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);

	const quotes = useQuery(
		api.quotes.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);

	const invoices = useQuery(
		api.invoices.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);

	const updateClient = useMutation(api.clients.update);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	const handleUpdateField = async (field: string, value: string) => {
		if (!clientId) return;
		await updateClient({
			id: clientId as Id<"clients">,
			[field]: value,
		});
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}).format(amount);
	};

	if (!client) {
		return (
			<SafeAreaView
				style={{ flex: 1, backgroundColor: colors.background }}
				edges={["bottom"]}
			>
				<AppHeader mode="detail" />
				<View style={styles.loadingContainer}>
					<Text style={styles.loadingText}>Loading client...</Text>
				</View>
			</SafeAreaView>
		);
	}

	const primaryContact = contacts?.find((c) => c.isPrimary) ?? contacts?.[0];
	const recentProjects = projects?.slice(0, 3) ?? [];
	const recentQuotes = quotes?.slice(0, 3) ?? [];
	const recentInvoices = invoices?.slice(0, 3) ?? [];

	// Calculate total quote value
	const totalQuoteValue =
		quotes?.reduce((sum, q) => sum + (q.total || 0), 0) ?? 0;
	const approvedQuotes =
		quotes?.filter((q) => q.status === "approved").length ?? 0;

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={["bottom"]}
		>
			<AppHeader mode="detail" />
			<ScrollView
				contentContainerStyle={{ padding: spacing.md }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{/* Header Card */}
				<View style={styles.headerCard}>
					<View style={styles.headerTop}>
						<Text style={styles.companyName}>{client.companyName}</Text>
						<View style={styles.statusBadgeContainer}>
							<StatusBadge status={client.status} />
						</View>
					</View>
					{client.communicationPreference && (
						<View style={styles.communicationRow}>
							{client.communicationPreference === "email" && (
								<>
									<Mail size={14} color={colors.mutedForeground} />
									<Text style={styles.communicationText}>Email preferred</Text>
								</>
							)}
							{client.communicationPreference === "phone" && (
								<>
									<Phone size={14} color={colors.mutedForeground} />
									<Text style={styles.communicationText}>Phone preferred</Text>
								</>
							)}
							{client.communicationPreference === "both" && (
								<>
									<Mail size={14} color={colors.mutedForeground} />
									<Phone size={14} color={colors.mutedForeground} />
									<Text style={styles.communicationText}>Email & Phone</Text>
								</>
							)}
						</View>
					)}
				</View>

				{/* Quick Stats */}
				<View style={styles.statsRow}>
					<View style={styles.statBox}>
						<Text style={styles.statValue}>{projects?.length ?? 0}</Text>
						<Text style={styles.statLabel}>Projects</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={styles.statValue}>{quotes?.length ?? 0}</Text>
						<Text style={styles.statLabel}>Quotes</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={styles.statValue}>{invoices?.length ?? 0}</Text>
						<Text style={styles.statLabel}>Invoices</Text>
					</View>
				</View>

				{/* Primary Contact */}
				{primaryContact && (
					<Card title="Primary Contact" style={{ marginTop: spacing.md }}>
						<View style={styles.contactCard}>
							<View style={styles.contactAvatar}>
								<User size={20} color={colors.primary} />
							</View>
							<View style={styles.contactInfo}>
								<Text style={styles.contactName}>
									{primaryContact.firstName} {primaryContact.lastName}
								</Text>
								{primaryContact.email && (
									<Pressable style={styles.contactRow}>
										<Mail size={14} color={colors.mutedForeground} />
										<Text style={styles.contactText}>
											{primaryContact.email}
										</Text>
									</Pressable>
								)}
								{primaryContact.phone && (
									<Pressable style={styles.contactRow}>
										<Phone size={14} color={colors.mutedForeground} />
										<Text style={styles.contactText}>
											{primaryContact.phone}
										</Text>
									</Pressable>
								)}
							</View>
						</View>
					</Card>
				)}

				{/* Notes */}
				<Card title="Notes" style={{ marginTop: spacing.md }}>
					<View style={{ marginTop: spacing.sm }}>
						<EditableField
							label=""
							value={client.notes}
							onSave={(value) => handleUpdateField("notes", value)}
							placeholder="Add notes about this client..."
							multiline
							numberOfLines={4}
						/>
					</View>
				</Card>

				{/* Projects Section */}
				<View style={{ marginTop: spacing.lg }}>
					<SectionHeader
						title="Projects"
						count={projects?.length}
						icon={<FolderKanban size={18} color="#8b5cf6" />}
						actionLabel={
							projects && projects.length > 0 ? "View All" : undefined
						}
						onAction={() => router.push("/projects")}
					/>

					{recentProjects.length > 0 ? (
						<View style={styles.relatedList}>
							{recentProjects.map((project) => (
								<Pressable
									key={project._id}
									style={styles.relatedItem}
									onPress={() => router.push(`/projects/${project._id}`)}
								>
									<View style={styles.relatedItemContent}>
										<Text style={styles.relatedItemTitle} numberOfLines={1}>
											{project.title}
										</Text>
										<StatusBadge status={project.status} />
									</View>
									<ChevronRight size={16} color={colors.mutedForeground} />
								</Pressable>
							))}
						</View>
					) : (
						<View style={styles.emptyRelated}>
							<Text style={styles.emptyRelatedText}>No projects yet</Text>
						</View>
					)}
				</View>

				{/* Quotes Section */}
				<View style={{ marginTop: spacing.lg }}>
					<SectionHeader
						title="Quotes"
						count={quotes?.length}
						subtitle={
							approvedQuotes > 0 ? `${approvedQuotes} approved` : undefined
						}
						icon={<FileText size={18} color="#10b981" />}
					/>

					{recentQuotes.length > 0 ? (
						<View style={styles.relatedList}>
							{recentQuotes.map((quote) => (
								<View key={quote._id} style={styles.relatedItem}>
									<View style={styles.relatedItemContent}>
										<View style={{ flex: 1 }}>
											<Text style={styles.relatedItemTitle} numberOfLines={1}>
												{quote.title || `Quote #${quote.quoteNumber}`}
											</Text>
											<Text style={styles.relatedItemValue}>
												{formatCurrency(quote.total)}
											</Text>
										</View>
										<StatusBadge status={quote.status} />
									</View>
								</View>
							))}
						</View>
					) : (
						<View style={styles.emptyRelated}>
							<Text style={styles.emptyRelatedText}>No quotes yet</Text>
						</View>
					)}
				</View>

				{/* Invoices Section */}
				<View style={{ marginTop: spacing.lg }}>
					<SectionHeader
						title="Invoices"
						count={invoices?.length}
						icon={<FileText size={18} color="#3b82f6" />}
					/>

					{recentInvoices.length > 0 ? (
						<View style={styles.relatedList}>
							{recentInvoices.map((invoice) => (
								<View key={invoice._id} style={styles.relatedItem}>
									<View style={styles.relatedItemContent}>
										<View style={{ flex: 1 }}>
											<Text style={styles.relatedItemTitle} numberOfLines={1}>
												Invoice #{invoice.invoiceNumber}
											</Text>
											<Text style={styles.relatedItemValue}>
												{formatCurrency(invoice.total)}
											</Text>
										</View>
										<StatusBadge status={invoice.status} />
									</View>
								</View>
							))}
						</View>
					) : (
						<View style={styles.emptyRelated}>
							<Text style={styles.emptyRelatedText}>No invoices yet</Text>
						</View>
					)}
				</View>

				{/* Tags */}
				{client.tags && client.tags.length > 0 && (
					<Card title="Tags" style={{ marginTop: spacing.lg }}>
						<View style={styles.tagsContainer}>
							{client.tags.map((tag, index) => (
								<View key={index} style={styles.tag}>
									<Tag size={12} color={colors.primary} />
									<Text style={styles.tagText}>{tag}</Text>
								</View>
							))}
						</View>
					</Card>
				)}

				{/* Bottom spacing */}
				<View style={{ height: spacing.xl }} />
			</ScrollView>

			{/* Floating Action Button for Mentions */}
			<Pressable
				style={styles.fab}
				onPress={() => setMentionModalVisible(true)}
			>
				<MessageSquare size={24} color="#ffffff" />
			</Pressable>

			{/* Mention Modal */}
			{client && (
				<MentionModal
					visible={mentionModalVisible}
					onClose={() => setMentionModalVisible(false)}
					entityType="client"
					entityId={clientId as Id<"clients">}
					entityName={client.companyName}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	loadingContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	loadingText: {
		fontSize: 16,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	headerCard: {
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
	},
	headerTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	companyName: {
		fontSize: 24,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
		flex: 1,
	},
	communicationRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginTop: spacing.md,
	},
	communicationText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	statusBadgeContainer: {
		transform: [{ scale: 1.4 }],
	},
	statsRow: {
		flexDirection: "row",
		marginTop: spacing.md,
		gap: spacing.sm,
	},
	statBox: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: radius.md,
		padding: spacing.sm,
		alignItems: "center",
		borderWidth: 1,
		borderColor: colors.border,
	},
	statValue: {
		fontSize: 18,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
	},
	statLabel: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 2,
	},
	contactCard: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginTop: spacing.sm,
	},
	contactAvatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(0, 166, 244, 0.08)",
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	contactInfo: {
		flex: 1,
	},
	contactName: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	contactRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginTop: 4,
	},
	contactText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	relatedList: {
		gap: spacing.xs,
	},
	relatedItem: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.card,
		borderRadius: radius.md,
		padding: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
	},
	relatedItemContent: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginRight: spacing.sm,
	},
	relatedItemTitle: {
		fontSize: 14,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
		flex: 1,
		marginRight: spacing.sm,
	},
	relatedItemValue: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		color: colors.primary,
		marginTop: 2,
	},
	emptyRelated: {
		backgroundColor: colors.muted,
		borderRadius: radius.md,
		padding: spacing.md,
		alignItems: "center",
	},
	emptyRelatedText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	tagsContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: spacing.sm,
		gap: spacing.xs,
	},
	tag: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(0, 166, 244, 0.1)",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radius.full,
		gap: 4,
	},
	tagText: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.primary,
	},
	fab: {
		position: "absolute",
		right: 24,
		bottom: 24,
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 8,
	},
});
