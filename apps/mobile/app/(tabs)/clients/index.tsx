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
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Search, Plus, X } from "lucide-react-native";
import {
	colors,
	DOCK_CLEARANCE,
	fontFamily,
	radii,
	shadow,
	useTokens,
} from "@/lib/theme";
import { Avatar, Badge, DotGrid, SCROLL_TOP_INSET } from "@/components/ui";
import { InkTabHeader } from "@/components/ink-tab-header";
import { useShellNav } from "@/lib/shell-nav";

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

// headerMode/onSelect/selectedId default off → the iPhone path (router.push,
// the InkTabHeader band, no selected highlight) is byte-identical. The iPad
// shell renders this as a list pane: headerMode="pane" suppresses the self-
// mounted AppHeader (shell mounts PaneHeader), onSelect drives the detail pane
// via the shell selection instead of a route push, selectedId marks the row.
export default function ClientsScreen({
	headerMode = "root",
	onSelect,
	selectedId = null,
}: {
	headerMode?: "root" | "pane";
	onSelect?: (id: string) => void;
	selectedId?: string | null;
} = {}) {
	const router = useRouter();
	const t = useTokens();
	const shellNav = useShellNav();
	const insets = useSafeAreaInsets();
	const isPane = headerMode === "pane";
	// The floating dock takes no layout height — the list clears it itself.
	// iPad panes have no dock (the shell replaces Tabs).
	const listBottom = isPane ? 24 : DOCK_CLEARANCE + insets.bottom;
	// iPhone: the ink band is a solid hard edge, so the list starts just under it
	// (Money's value). iPad pane: no band, so the translucent-header inset stays.
	const listTop = isPane ? SCROLL_TOP_INSET : 12;
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

	// In the iPad shell: open the in-pane create surface (no router.push to a
	// (tabs) sibling, which slides the whole shell). iPhone has no provider →
	// fall back to the full-screen create route (byte-identical).
	const goToNew = () =>
		shellNav ? shellNav.startCreate() : router.push("/clients/new");

	// On iPad pane: row tap drives the shell selection (no route push — the
	// (tabs) group has no in-group navigator, so a push slides the whole shell).
	// On iPhone: push the detail route exactly as before.
	const openClient = (id: string) =>
		onSelect ? onSelect(id) : router.push(`/clients/${id}`);

	const renderClient = ({ item }: { item: ClientRow }) => {
		const contactName = item.primaryContact?.name ?? "—";
		const isSelected = isPane && item.id === selectedId;
		return (
			<Pressable
				style={({ pressed }) => [
					styles.card,
					{ backgroundColor: t.card, borderColor: t.line },
					isSelected && { borderColor: t.primarySolid, backgroundColor: t.frostedBg },
					pressed && styles.cardPressed,
				]}
				onPress={() => openClient(item.id)}
			>
				<Avatar text={initialsFrom(item.name)} size={48} />
				<View style={styles.cardBody}>
					<Text style={[styles.name, { color: t.ink }]} numberOfLines={1}>
						{item.name}
					</Text>
					<Text style={[styles.subline, { color: t.sub }]} numberOfLines={1}>
						{contactName} · {item.activeProjects} projects
					</Text>
				</View>
				<View style={styles.cardRight}>
					<Badge status={STATUS_KEY[item.status]} />
					{/* No per-client invoice/quote aggregation source exists — show — (never fake a $ figure). */}
					<Text style={[styles.value, { color: t.sub }]}>—</Text>
				</View>
			</Pressable>
		);
	};

	const ListHeader = (
		<View style={styles.listHeader}>
			{/* No "New client" button here — the speed-dial FAB owns capture on
			    iPhone (3.0 slice 5). The empty state keeps its CTA: a first-run
			    primary action isn't a duplicate. */}
			<View
				style={[styles.searchBar, { backgroundColor: t.card, borderColor: t.line }]}
			>
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
									? { backgroundColor: t.frostedBg, borderColor: t.primarySolid }
									: { backgroundColor: t.card, borderColor: t.line },
							]}
						>
							<Text
								style={[
									styles.chipLabel,
									{ color: active ? t.frostedInk : t.sub },
								]}
							>
								{chip.label}
							</Text>
							<Text
								style={[
									styles.chipCount,
									{ color: active ? t.frostedInk : t.faint },
								]}
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
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Pane mode: the shell mounts PaneHeader above this body (one header
			    per pane — locked convention). iPhone: the shared ink band. */}
			{isPane ? null : <InkTabHeader title="Clients" />}

			{loading ? (
				<View style={[styles.listContent, { paddingTop: listTop }]}>
					{ListHeader}
					{[0, 1, 2, 3].map((i) => (
						<View
							key={i}
							style={[
								styles.card,
								{ backgroundColor: t.card, borderColor: t.line },
								styles.skeletonCard,
							]}
						>
							<View
								style={[
									styles.skeleton,
									{ backgroundColor: t.lineSoft },
									styles.skeletonAvatar,
								]}
							/>
							<View style={styles.cardBody}>
								<View
									style={[
										styles.skeleton,
										{ backgroundColor: t.lineSoft, width: "60%", height: 16 },
									]}
								/>
								<View
									style={[
										styles.skeleton,
										{
											backgroundColor: t.lineSoft,
											width: "40%",
											height: 13,
											marginTop: 6,
										},
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
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: listTop,
						paddingBottom: listBottom,
					}}
					ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							{allClients.length === 0 ? (
								<>
									<Text style={[styles.emptyTitle, { color: t.ink }]}>
										No clients yet
									</Text>
									<Text style={[styles.emptyText, { color: t.sub }]}>
										Add your first client to start tracking work.
									</Text>
									<Pressable
										onPress={goToNew}
										style={({ pressed }) => [
											styles.newBtn,
											styles.emptyBtn,
											{ backgroundColor: t.primarySolid },
											pressed && { opacity: 0.9 },
										]}
										accessibilityRole="button"
										accessibilityLabel="New client"
									>
										<Plus size={18} color={colors.primaryForeground} />
										<Text style={[styles.newBtnLabel, { color: colors.primaryForeground }]}>
											New client
										</Text>
									</Pressable>
								</>
							) : (
								<>
									<Text style={[styles.emptyTitle, { color: t.ink }]}>
										No clients found
									</Text>
									<Text style={[styles.emptyText, { color: t.sub }]}>
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
		borderRadius: radii["4xl"],
		boxShadow: shadow.md,
	},
	newBtnLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		borderWidth: 1,
		borderRadius: radii["4xl"],
		paddingHorizontal: 14,
		height: 46,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 13,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
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
		borderRadius: radii.pill,
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
		borderRadius: radii.rLg,
		borderWidth: 1,
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
	},
	subline: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 2,
	},
	cardRight: {
		alignItems: "flex-end",
		gap: 5,
	},
	value: {
		fontFamily: fontFamily.semibold,
		fontSize: 11.5,
	},
	skeletonCard: {
		marginBottom: 10,
	},
	skeleton: {
		borderRadius: radii.sm,
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
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		textAlign: "center",
	},
	emptyBtn: {
		marginTop: 20,
		paddingHorizontal: 22,
		alignSelf: "center",
	},
});
