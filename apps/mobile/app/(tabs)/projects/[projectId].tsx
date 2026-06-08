import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	Pressable,
	StyleSheet,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, shadow, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { Badge, Card, Eyebrow, ListRow, Ring, SectionHeader } from "@/components/ui";
import { ProjectDocuments } from "@/components/ProjectDocuments";
import { Building2 } from "lucide-react-native";

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
			style={({ pressed }) => [pressed && styles.pressed]}
			accessibilityRole="button"
			accessibilityLabel={`Edit ${label}`}
		>
			{body}
		</Pressable>
	);
}

export default function ProjectDetailScreen() {
	const { projectId } = useLocalSearchParams<{ projectId: string }>();
	const router = useRouter();
	const t = useTokens();
	const [refreshing, setRefreshing] = useState(false);

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

	if (!project) {
		return (
			<SafeAreaView
				style={{ flex: 1, backgroundColor: t.bg }}
				edges={["bottom"]}
			>
				<AppHeader mode="detail" />
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
		<SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["bottom"]}>
			<AppHeader mode="detail" />
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
							<Text style={[styles.title, { color: t.ink }]}>
								{project.title}
							</Text>
							<Pressable
								onPress={() =>
									router.push(`/clients/${project.clientId}`)
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
						<Badge status={project.status} big />
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
								/>
								<KV
									label="Due"
									value={formatDate(project.endDate) ?? "Not set"}
								/>
							</View>
						</View>
					) : (
						<View style={styles.kvColStandalone}>
							<KV
								label="Start"
								value={formatDate(project.startDate) ?? "Not set"}
							/>
							<KV
								label="Due"
								value={formatDate(project.endDate) ?? "Not set"}
							/>
						</View>
					)}
				</Card>

				{/* Description */}
				<Card style={styles.section}>
					<Eyebrow>Description</Eyebrow>
					<Text
						style={[
							styles.description,
							{ color: project.description ? t.sub : t.faint },
						]}
					>
						{project.description || "No description"}
					</Text>
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
									onPress={() => router.push("/money")}
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
									onPress={() => router.push("/money")}
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
		</SafeAreaView>
	);
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
		fontSize: 24,
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
		fontSize: 14,
	},
	progressRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginTop: 16,
	},
	ringText: {
		fontFamily: fontFamily.bold,
		fontSize: 18,
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
		fontSize: 13,
	},
	kvValue: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
	},
	section: {
		marginTop: 14,
	},
	description: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
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
		fontSize: 13,
	},
	more: {
		fontFamily: fontFamily.medium,
		fontSize: 12,
		paddingVertical: 8,
		paddingHorizontal: 4,
	},
	pressed: {
		opacity: 0.6,
	},
});
