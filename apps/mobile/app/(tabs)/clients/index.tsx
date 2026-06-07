import {
	View,
	Text,
	Pressable,
	RefreshControl,
	TextInput,
	StyleSheet,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, ChevronRight, Building2, X } from "lucide-react-native";
import { colors, fontFamily, radius, spacing } from "@/lib/theme";
import { FABMenu } from "@/components/FABMenu";
import { AppHeader } from "@/components/app-header";

// Status config using primary color for active states
const statusConfig = {
	lead: { label: "Lead", color: colors.primary },
	active: { label: "Active", color: colors.success },
	inactive: { label: "Inactive", color: colors.mutedForeground },
	archived: { label: "Archived", color: colors.mutedForeground },
} as const;

export default function ClientsScreen() {
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const clients = useQuery(api.clients.list, {}) ?? [];

	const filteredClients = useMemo(() => {
		if (!searchQuery.trim()) return clients;
		const query = searchQuery.toLowerCase();
		return clients.filter((client) =>
			client.companyName.toLowerCase().includes(query)
		);
	}, [clients, searchQuery]);

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 1000);
	}, []);

	// Get initials for avatar
	const getInitials = (name: string) => {
		const words = name.split(" ");
		if (words.length >= 2) {
			return (words[0][0] + words[1][0]).toUpperCase();
		}
		return name.substring(0, 2).toUpperCase();
	};

	const renderClient = ({ item }: { item: (typeof clients)[0] }) => {
		const status = statusConfig[item.status as keyof typeof statusConfig] || {
			label: item.status,
			color: colors.mutedForeground,
		};

		return (
			<Pressable
				style={({ pressed }) => [
					styles.clientRow,
					pressed && styles.clientRowPressed,
				]}
				onPress={() => router.push(`/clients/${item._id}`)}
			>
				{/* Avatar */}
				<View style={styles.avatar}>
					<Text style={styles.avatarText}>{getInitials(item.companyName)}</Text>
				</View>

				{/* Client Info */}
				<View style={styles.clientInfo}>
					<Text style={styles.companyName} numberOfLines={1}>
						{item.companyName}
					</Text>
					<View style={styles.clientMeta}>
						<View
							style={[styles.statusDot, { backgroundColor: status.color }]}
						/>
						<Text style={[styles.statusText, { color: status.color }]}>
							{status.label}
						</Text>
					</View>
				</View>

				<ChevronRight size={18} color={colors.border} />
			</Pressable>
		);
	};

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colors.background }}
			edges={["bottom"]}
		>
			<AppHeader mode="root" title="Clients" />
			{/* Search Bar */}
			<View style={styles.searchContainer}>
				<View style={styles.searchBar}>
					<Search size={18} color={colors.mutedForeground} />
					<TextInput
						style={styles.searchInput}
						placeholder="Search clients..."
						placeholderTextColor={colors.mutedForeground}
						value={searchQuery}
						onChangeText={setSearchQuery}
					/>
					{searchQuery.length > 0 && (
						<Pressable
							onPress={() => setSearchQuery("")}
							style={styles.clearButton}
						>
							<X size={16} color={colors.mutedForeground} />
						</Pressable>
					)}
				</View>

				{searchQuery && (
					<Text style={styles.resultsCount}>
						{filteredClients.length} result
						{filteredClients.length !== 1 ? "s" : ""}
					</Text>
				)}
			</View>

			{/* Summary Bar */}
			<View style={styles.summaryBar}>
				<Text style={styles.summaryText}>
					{clients.length} total client{clients.length !== 1 ? "s" : ""}
				</Text>
				<View style={styles.summaryStats}>
					<View style={styles.summaryStatItem}>
						<View
							style={[styles.summaryDot, { backgroundColor: colors.success }]}
						/>
						<Text style={styles.summaryStatText}>
							{clients.filter((c) => c.status === "active").length} active
						</Text>
					</View>
				</View>
			</View>

			<FlashList
				data={filteredClients}
				keyExtractor={(item) => item._id}
				renderItem={renderClient}
				contentContainerStyle={styles.listContent}
				ItemSeparatorComponent={() => <View style={styles.separator} />}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				ListEmptyComponent={
					<View style={styles.emptyState}>
						<View style={styles.emptyIcon}>
							<Building2 size={28} color={colors.mutedForeground} />
						</View>
						<Text style={styles.emptyTitle}>
							{searchQuery ? "No clients found" : "No clients yet"}
						</Text>
						<Text style={styles.emptyText}>
							{searchQuery
								? "Try adjusting your search"
								: "Add your first client to get started"}
						</Text>
					</View>
				}
			/>

			{/* FAB Menu */}
			<FABMenu />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	searchContainer: {
		paddingHorizontal: spacing.md,
		paddingTop: spacing.sm,
		paddingBottom: spacing.xs,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.muted,
		borderRadius: radius.lg,
		paddingHorizontal: spacing.sm,
		height: 44,
	},
	searchInput: {
		flex: 1,
		paddingHorizontal: spacing.sm,
		fontSize: 15,
		fontFamily: fontFamily.regular,
		color: colors.foreground,
	},
	clearButton: {
		padding: spacing.xs,
	},
	resultsCount: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
		marginTop: spacing.xs,
		marginLeft: spacing.xs,
	},
	summaryBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	summaryText: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
	},
	summaryStats: {
		flexDirection: "row",
		gap: spacing.md,
	},
	summaryStatItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	summaryDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	summaryStatText: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
	},
	listContent: {
		paddingBottom: 100,
	},
	clientRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
		backgroundColor: colors.background,
	},
	clientRowPressed: {
		backgroundColor: colors.muted,
	},
	separator: {
		height: 1,
		backgroundColor: colors.border,
		marginLeft: 56 + spacing.md,
	},
	avatar: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(0, 166, 244, 0.08)",
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	avatarText: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.primary,
	},
	clientInfo: {
		flex: 1,
		marginRight: spacing.sm,
	},
	companyName: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: 2,
	},
	clientMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	metaItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		flex: 1,
	},
	metaText: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		flex: 1,
	},
	statusDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	statusText: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: spacing.xl * 2,
		paddingHorizontal: spacing.lg,
	},
	emptyIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.muted,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	emptyTitle: {
		fontSize: 16,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	emptyText: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		textAlign: "center",
	},
});
