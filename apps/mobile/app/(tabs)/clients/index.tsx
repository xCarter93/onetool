import {
	View,
	Text,
	Pressable,
	ScrollView,
	TextInput,
	StyleSheet,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, Plus, X } from "lucide-react-native";
import { fontFamily, radii, shadow, useTokens } from "@/lib/theme";
import { Avatar, Badge } from "@/components/ui";
import { AppHeader } from "@/components/app-header";

// listWithProjectCounts returns a reshaped DTO (id/name/status display string),
// NOT Doc<"clients">. Field names used verbatim below.
type ClientRow = {
	id: string;
	name: string;
	location: string;
	activeProjects: number;
	lastActivity: string;
	status: "Active" | "Prospect" | "Paused" | "Archived";
	primaryContact: { name: string; email: string; jobTitle: string } | null;
};

// Chip filter keys map to the DTO display-string status (NOT the raw enum).
type FilterValue = "all" | "Active" | "Prospect" | "Paused";

// Map the DTO display string to the STATUS pill map key for Badge coloring.
const STATUS_KEY: Record<ClientRow["status"], string> = {
	Active: "active",
	Prospect: "lead",
	Paused: "inactive",
	Archived: "archived",
};

function initialsFrom(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}

export default function ClientsScreen() {
	const router = useRouter();
	const t = useTokens();
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<FilterValue>("all");

	const clients = useQuery(api.clients.listWithProjectCounts, {}) as
		| ClientRow[]
		| undefined;

	const loading = clients === undefined;
	const allClients = useMemo(() => clients ?? [], [clients]);

	const counts = useMemo(
		() => ({
			all: allClients.length,
			Active: allClients.filter((c) => c.status === "Active").length,
			Prospect: allClients.filter((c) => c.status === "Prospect").length,
			Paused: allClients.filter((c) => c.status === "Paused").length,
		}),
		[allClients]
	);

	const chips: { value: FilterValue; label: string }[] = [
		{ value: "all", label: "All" },
		{ value: "Active", label: "Active" },
		{ value: "Prospect", label: "Leads" },
		{ value: "Paused", label: "Inactive" },
	];

	const visibleClients = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return allClients.filter(
			(c) =>
				(filter === "all" || c.status === filter) &&
				(q === "" || c.name.toLowerCase().includes(q))
		);
	}, [allClients, filter, searchQuery]);

	const goToNew = () => router.push("/clients/new");

	const renderClient = ({ item }: { item: ClientRow }) => {
		const contactName = item.primaryContact?.name ?? "—";
		return (
			<Pressable
				style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
				onPress={() => router.push(`/clients/${item.id}`)}
			>
				<Avatar text={initialsFrom(item.name)} size={48} />
				<View style={styles.cardBody}>
					<Text style={styles.name} numberOfLines={1}>
						{item.name}
					</Text>
					<Text style={styles.subline} numberOfLines={1}>
						{contactName} · {item.activeProjects} projects
					</Text>
				</View>
				<View style={styles.cardRight}>
					<Badge status={STATUS_KEY[item.status]} />
					{/* No per-client invoice/quote aggregation source exists — show — (never fake a $ figure). */}
					<Text style={styles.value}>—</Text>
				</View>
			</Pressable>
		);
	};

	const ListHeader = (
		<View style={styles.listHeader}>
			<Pressable
				onPress={goToNew}
				style={({ pressed }) => [
					styles.newBtn,
					{ backgroundColor: t.accent },
					pressed && { opacity: 0.9 },
				]}
				accessibilityRole="button"
				accessibilityLabel="New client"
			>
				<Plus size={18} color="#fff" />
				<Text style={styles.newBtnLabel}>New client</Text>
			</Pressable>

			<View style={styles.searchBar}>
				<Search size={19} color={t.faint} />
				<TextInput
					value={searchQuery}
					onChangeText={setSearchQuery}
					placeholder="Search clients…"
					placeholderTextColor={t.faint}
					style={[styles.searchInput, { color: t.ink }]}
				/>
				{searchQuery.length > 0 && (
					<Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
						<X size={16} color={t.faint} />
					</Pressable>
				)}
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.chipRow}
			>
				{chips.map((chip) => {
					const active = chip.value === filter;
					return (
						<Pressable
							key={chip.value}
							onPress={() => setFilter(chip.value)}
							style={[
								styles.chip,
								active
									? { backgroundColor: t.accent, borderColor: t.accent }
									: { backgroundColor: t.card, borderColor: t.line },
							]}
						>
							<Text
								style={[styles.chipLabel, { color: active ? "#fff" : t.sub }]}
							>
								{chip.label}
							</Text>
							<Text
								style={[styles.chipCount, { color: active ? "#fff" : t.faint }]}
							>
								{counts[chip.value]}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: t.surface }}
			edges={[]}
		>
			<AppHeader mode="root" title="Clients" />

			{loading ? (
				<View style={styles.listContent}>
					{ListHeader}
					{[0, 1, 2, 3].map((i) => (
						<View key={i} style={[styles.card, styles.skeletonCard]}>
							<View style={[styles.skeleton, styles.skeletonAvatar]} />
							<View style={styles.cardBody}>
								<View style={[styles.skeleton, { width: "60%", height: 16 }]} />
								<View
									style={[
										styles.skeleton,
										{ width: "40%", height: 13, marginTop: 6 },
									]}
								/>
							</View>
						</View>
					))}
				</View>
			) : (
				<FlashList
					data={visibleClients}
					keyExtractor={(item) => item.id}
					renderItem={renderClient}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={styles.listContent}
					ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							{allClients.length === 0 ? (
								<>
									<Text style={styles.emptyTitle}>No clients yet</Text>
									<Text style={styles.emptyText}>
										Add your first client to start tracking work.
									</Text>
									<Pressable
										onPress={goToNew}
										style={({ pressed }) => [
											styles.newBtn,
											styles.emptyBtn,
											{ backgroundColor: t.accent },
											pressed && { opacity: 0.9 },
										]}
										accessibilityRole="button"
										accessibilityLabel="New client"
									>
										<Plus size={18} color="#fff" />
										<Text style={styles.newBtnLabel}>New client</Text>
									</Pressable>
								</>
							) : (
								<>
									<Text style={styles.emptyTitle}>No clients found</Text>
									<Text style={styles.emptyText}>
										Try a different search or filter.
									</Text>
								</>
							)}
						</View>
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	listContent: {
		paddingHorizontal: 16,
		paddingBottom: 24,
		paddingTop: 8,
	},
	listHeader: {
		gap: 12,
		paddingBottom: 12,
	},
	newBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 46,
		borderRadius: 15,
		boxShadow: shadow.md,
	},
	newBtnLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
		color: "#fff",
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e9edf2",
		borderRadius: 15,
		paddingHorizontal: 14,
		height: 46,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 13,
		paddingVertical: 0,
	},
	chipRow: {
		gap: 8,
		paddingRight: 16,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		minHeight: 36,
		paddingHorizontal: 15,
		borderRadius: 999,
		borderWidth: 1,
	},
	chipLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 12.5,
	},
	chipCount: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
	},
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 13,
		backgroundColor: "#fff",
		borderRadius: radii.rLg,
		borderWidth: 1,
		borderColor: "#e9edf2",
		boxShadow: shadow.card,
		padding: 13,
		minHeight: 44,
	},
	cardPressed: {
		opacity: 0.85,
	},
	cardBody: {
		flex: 1,
		minWidth: 0,
	},
	name: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: "#09090b",
	},
	subline: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		color: "#5b6675",
		marginTop: 2,
	},
	cardRight: {
		alignItems: "flex-end",
		gap: 5,
	},
	value: {
		fontFamily: fontFamily.semibold,
		fontSize: 11.5,
		color: "#5b6675",
	},
	skeletonCard: {
		marginBottom: 10,
	},
	skeleton: {
		backgroundColor: "#e9edf2",
		borderRadius: 6,
	},
	skeletonAvatar: {
		width: 48,
		height: 48,
		borderRadius: 16,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 18,
		color: "#09090b",
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		color: "#5b6675",
		textAlign: "center",
	},
	emptyBtn: {
		marginTop: 20,
		paddingHorizontal: 22,
		alignSelf: "center",
	},
});
