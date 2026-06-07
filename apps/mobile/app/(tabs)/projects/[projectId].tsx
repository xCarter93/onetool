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
import { ProjectDocuments } from "@/components/ProjectDocuments";
import { MentionModal } from "@/components/MentionModal";
import {
	Building2,
	FileText,
	ChevronRight,
	MessageSquare,
} from "lucide-react-native";

type ProjectStatus = "planned" | "in-progress" | "completed" | "cancelled";

export default function ProjectDetailScreen() {
	const { projectId } = useLocalSearchParams<{ projectId: string }>();
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const [mentionModalVisible, setMentionModalVisible] = useState(false);

	const project = useQuery(
		api.projects.get,
		projectId ? { id: projectId as Id<"projects"> } : "skip"
	);

	const quotes = useQuery(
		api.quotes.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);

	const invoices = useQuery(
		api.invoices.list,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip"
	);

	const updateProject = useMutation(api.projects.update);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	const handleUpdateField = async (field: string, value: string) => {
		if (!projectId) return;
		await updateProject({
			id: projectId as Id<"projects">,
			[field]: value,
		});
	};

	const formatDate = (timestamp: number | undefined) => {
		if (!timestamp) return null;
		return new Date(timestamp).toLocaleDateString("en-US", {
			weekday: "short",
			month: "long",
			day: "numeric",
			year: "numeric",
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

	// Calculate quote value
	const totalQuoteValue =
		quotes?.reduce((sum, q) => sum + (q.total || 0), 0) ?? 0;
	const approvedQuoteValue =
		quotes
			?.filter((q) => q.status === "approved")
			.reduce((sum, q) => sum + (q.total || 0), 0) ?? 0;

	if (!project) {
		return (
			<SafeAreaView
				style={{ flex: 1, backgroundColor: colors.background }}
				edges={["bottom"]}
			>
				<AppHeader mode="detail" />
				<View style={styles.loadingContainer}>
					<Text style={styles.loadingText}>Loading project...</Text>
				</View>
			</SafeAreaView>
		);
	}

	const getStatusColor = (status: string) => {
		switch (status) {
			case "completed":
				return "#10b981";
			case "in-progress":
				return "#f59e0b";
			case "planned":
				return "#3b82f6";
			case "cancelled":
				return "#ef4444";
			default:
				return colors.mutedForeground;
		}
	};

	const statusColor = getStatusColor(project.status);

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
				<View style={[styles.headerCard, { borderLeftColor: statusColor }]}>
					<View style={styles.headerTop}>
						<Text style={styles.projectTitle}>{project.title}</Text>
						<View style={styles.statusBadgeContainer}>
							<StatusBadge status={project.status} />
						</View>
					</View>

					{project.projectNumber && (
						<View style={styles.projectNumberRow}>
							<Text style={styles.projectNumberLabel}>Project #</Text>
							<Text style={styles.projectNumber}>{project.projectNumber}</Text>
						</View>
					)}

					{/* Client Info */}
					{project.clientId && (
						<Pressable
							style={styles.clientRow}
							onPress={() => router.push(`/clients/${project.clientId}`)}
						>
							<Building2 size={16} color={colors.mutedForeground} />
							<Text style={styles.clientName}>View Client</Text>
							<ChevronRight size={16} color={colors.mutedForeground} />
						</Pressable>
					)}
				</View>

				{/* Quick Stats */}
				<View style={styles.statsRow}>
					<View style={styles.statBox}>
						<Text style={styles.statValue}>{quotes?.length ?? 0}</Text>
						<Text style={styles.statLabel}>Quotes</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={styles.statValue}>{invoices?.length ?? 0}</Text>
						<Text style={styles.statLabel}>Invoices</Text>
					</View>
				</View>

				{/* Progress Bar */}
				{/* Removed - was based on task completion */}

				{/* Dates */}
				<Card title="Schedule" style={{ marginTop: spacing.md }}>
					<View style={styles.datesContainer}>
						<View style={styles.dateItem}>
							<View>
								<Text style={styles.dateLabel}>Start Date</Text>
								<Text style={styles.dateValue}>
									{project.startDate
										? formatDate(project.startDate)
										: "Not set"}
								</Text>
							</View>
						</View>
						<View style={styles.dateDivider} />
						<View style={styles.dateItem}>
							<View>
								<Text style={styles.dateLabel}>End Date</Text>
								<Text style={styles.dateValue}>
									{project.endDate ? formatDate(project.endDate) : "Not set"}
								</Text>
							</View>
						</View>
					</View>
				</Card>

				{/* Description */}
				<Card title="Description" style={{ marginTop: spacing.md }}>
					<View style={{ marginTop: spacing.sm }}>
						<EditableField
							label=""
							value={project.description}
							onSave={(value) => handleUpdateField("description", value)}
							placeholder="Add a description..."
							multiline
							numberOfLines={3}
						/>
					</View>
				</Card>

				{/* Quotes Section */}
				<View style={{ marginTop: spacing.lg }}>
					<SectionHeader
						title="Quotes"
						count={quotes?.length}
						icon={<FileText size={18} color="#10b981" />}
					/>

					{quotes && quotes.length > 0 ? (
						<View style={styles.quotesList}>
							{quotes.slice(0, 3).map((quote) => (
								<View key={quote._id} style={styles.quoteItem}>
									<View style={styles.quoteItemContent}>
										<View style={{ flex: 1 }}>
											<Text style={styles.quoteTitle} numberOfLines={1}>
												{quote.title || `Quote #${quote.quoteNumber}`}
											</Text>
											<Text style={styles.quoteValue}>
												{formatCurrency(quote.total)}
											</Text>
										</View>
										<StatusBadge status={quote.status} />
									</View>
								</View>
							))}
						</View>
					) : (
						<View style={styles.emptySection}>
							<Text style={styles.emptySectionText}>No quotes yet</Text>
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

					{invoices && invoices.length > 0 ? (
						<View style={styles.quotesList}>
							{invoices.slice(0, 3).map((invoice) => (
								<View key={invoice._id} style={styles.quoteItem}>
									<View style={styles.quoteItemContent}>
										<View style={{ flex: 1 }}>
											<Text style={styles.quoteTitle} numberOfLines={1}>
												Invoice #{invoice.invoiceNumber}
											</Text>
											<Text style={styles.quoteValue}>
												{formatCurrency(invoice.total)}
											</Text>
										</View>
										<StatusBadge status={invoice.status} />
									</View>
								</View>
							))}
						</View>
					) : (
						<View style={styles.emptySection}>
							<Text style={styles.emptySectionText}>No invoices yet</Text>
						</View>
					)}
				</View>

				{/* Project Documents Section */}
				{projectId && (
					<ProjectDocuments projectId={projectId as Id<"projects">} />
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
			{project && (
				<MentionModal
					visible={mentionModalVisible}
					onClose={() => setMentionModalVisible(false)}
					entityType="project"
					entityId={projectId as Id<"projects">}
					entityName={project.title}
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
		borderLeftWidth: 4,
	},
	headerTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		marginBottom: spacing.sm,
	},
	projectTitle: {
		fontSize: 24,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
		flex: 1,
	},
	statusBadgeContainer: {
		transform: [{ scale: 1.3 }],
	},
	projectNumberRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginBottom: spacing.sm,
	},
	projectNumberLabel: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	projectNumber: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	clientRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.xs,
		marginTop: spacing.xs,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	clientName: {
		flex: 1,
		fontSize: 14,
		fontFamily: fontFamily.medium,
		color: colors.primary,
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
	progressCard: {
		backgroundColor: colors.card,
		borderRadius: radius.md,
		padding: spacing.md,
		marginTop: spacing.md,
		borderWidth: 1,
		borderColor: colors.border,
	},
	progressHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: spacing.sm,
	},
	progressLabel: {
		fontSize: 14,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
	},
	progressPercentage: {
		fontSize: 14,
		fontFamily: fontFamily.bold,
		color: colors.primary,
	},
	progressBar: {
		height: 8,
		backgroundColor: colors.muted,
		borderRadius: 4,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		borderRadius: 4,
	},
	datesContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: spacing.sm,
	},
	dateItem: {
		flex: 1,
	},
	dateLabel: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	dateValue: {
		fontSize: 14,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
	},
	dateDivider: {
		width: 1,
		height: 40,
		backgroundColor: colors.border,
		marginHorizontal: spacing.md,
	},
	tasksList: {
		gap: spacing.sm,
	},
	quotesList: {
		gap: spacing.xs,
	},
	quoteItem: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.card,
		borderRadius: radius.md,
		padding: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
	},
	quoteItemContent: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginRight: spacing.sm,
	},
	quoteTitle: {
		fontSize: 14,
		fontFamily: fontFamily.medium,
		color: colors.foreground,
		marginBottom: 2,
	},
	quoteValue: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		color: colors.primary,
		marginTop: 2,
	},
	emptySection: {
		backgroundColor: colors.muted,
		borderRadius: radius.md,
		padding: spacing.md,
		alignItems: "center",
	},
	emptySectionText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
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
