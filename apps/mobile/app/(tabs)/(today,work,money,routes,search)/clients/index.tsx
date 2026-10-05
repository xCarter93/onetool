import { Pressable, View, TextInput, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useReopenTabBarAtTop } from "@/lib/shell-chrome";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Search, X } from "lucide-react-native";
import { GUTTER, EmptyPanel, PageHeader, RecordRow, CANVAS_HEADER as canvasHeader } from "@/components/canvas";
import { Button, SegmentedToggle } from "@/components/ui";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";

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

type FilterValue = "all" | "Active" | "Prospect" | "Paused";

// Map the DTO display string to the STATUS pill map key for Badge coloring.
const STATUS_KEY: Record<ClientRow["status"], string> = {
	Active: "active",
	Prospect: "lead",
	Paused: "inactive",
	Archived: "archived",
};

const SEGMENTS: { value: FilterValue; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "Active", label: "Active" },
	{ value: "Prospect", label: "Leads" },
	{ value: "Paused", label: "Inactive" },
];

// headerMode/onSelect/selectedId default off → the iPhone path (router.push,
// no selected highlight) is byte-identical. The iPad shell would render this as
// a list pane the same way: headerMode="pane" suppresses the page header (the
// pane's own header takes over), onSelect drives the shell selection instead of
// a route push, selectedId marks the row.
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
	const reopenAtTop = useReopenTabBarAtTop();
	const isPane = headerMode === "pane";
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<FilterValue>("all");

	const clients = useCachedQuery(api.clients.listWithProjectCounts, {}) as
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
		[allClients],
	);

	const visibleClients = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return allClients.filter(
			(c) =>
				(filter === "all" || c.status === filter) &&
				(q === "" || c.name.toLowerCase().includes(q)),
		);
	}, [allClients, filter, searchQuery]);

	const goToNew = () => router.push("/client/new");

	const openClient = (id: string) => (onSelect ? onSelect(id) : router.push(`/clients/${id}`));

	const renderClient = ({ item, index }: { item: ClientRow; index: number }) => {
		const contactName = item.primaryContact?.name ?? "No contact";
		const isSelected = isPane && item.id === selectedId;
		const first = index === 0;
		const last = index === visibleClients.length - 1;
		return (
			<View
				style={[
					styles.panelRow,
					{ backgroundColor: t.card, borderColor: t.line },
					first && styles.panelFirst,
					last && styles.panelLast,
					!first && { borderTopWidth: 1, borderTopColor: t.lineSoft },
				]}
			>
				<RecordRow
					kind="client"
					title={item.name}
					subtitle={`${contactName} · ${item.activeProjects} ${item.activeProjects === 1 ? "project" : "projects"}`}
					status={STATUS_KEY[item.status]}
					selected={isSelected}
					onPress={() => openClient(item.id)}
				/>
			</View>
		);
	};

	const ListHeader = (
		<View style={styles.listHeader}>
			{isPane ? null : (
				<View style={canvasHeader}>
					<PageHeader title="Clients" hairline={false} />
				</View>
			)}
			<View style={[styles.searchBar, { borderColor: t.input, backgroundColor: t.card }]}>
				<Search size={18} color={t.sub} strokeWidth={2} />
				<TextInput
					value={searchQuery}
					onChangeText={setSearchQuery}
					placeholder="Search clients"
					placeholderTextColor={t.sub}
					style={[styles.searchInput, { color: t.ink }]}
				/>
				{searchQuery.length > 0 && (
					<Pressable
						onPress={() => setSearchQuery("")}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Clear search"
					>
						<X size={16} color={t.sub} strokeWidth={2} />
					</Pressable>
				)}
			</View>
			<SegmentedToggle
				segments={SEGMENTS.map((s) => ({ ...s, count: counts[s.value] }))}
				value={filter}
				onChange={setFilter}
			/>
		</View>
	);

	return (
		<View style={styles.screen}>
			{loading ? (
				<View
					style={[
						styles.listContent,
						{ paddingTop: 12 },
					]}
				>
					{ListHeader}
					<View style={[styles.panel, { backgroundColor: t.card, borderColor: t.line }]}>
						{[0, 1, 2].map((i) => (
							<View
								key={i}
								style={[
									styles.skeletonRow,
									i > 0 && { borderTopWidth: 1, borderTopColor: t.lineSoft },
								]}
							>
								<View style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]} />
								<View style={styles.skeletonBody}>
									<View style={[styles.skeleton, { backgroundColor: t.lineSoft, width: "60%", height: 14 }]} />
									<View
										style={[
											styles.skeleton,
											{ backgroundColor: t.lineSoft, width: "40%", height: 12, marginTop: 6 },
										]}
									/>
								</View>
							</View>
						))}
					</View>
				</View>
			) : (
				<FlashList
					contentInsetAdjustmentBehavior="automatic"
					onScroll={reopenAtTop}
					scrollEventThrottle={16}
					data={visibleClients}
					keyExtractor={(item) => item.id}
					renderItem={renderClient}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: 12,
					}}
					ListEmptyComponent={
						allClients.length === 0 ? (
							<EmptyPanel
								title="No clients yet"
								body="Add your first client to start tracking work."
								action={<Button title="New client" onPress={goToNew} />}
							/>
						) : (
							<EmptyPanel title="No clients found" body="Try a different search or filter." />
						)
					}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: GUTTER,
		paddingBottom: 32,
	},
	listHeader: {
		gap: 16,
		paddingBottom: 16,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		minHeight: 44,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 16,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
		paddingVertical: 10,
	},
	panel: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	panelRow: {
		borderLeftWidth: 1,
		borderRightWidth: 1,
	},
	panelFirst: {
		borderTopWidth: 1,
		borderTopLeftRadius: radii.card,
		borderTopRightRadius: radii.card,
	},
	panelLast: {
		borderBottomWidth: 1,
		borderBottomLeftRadius: radii.card,
		borderBottomRightRadius: radii.card,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 11,
		paddingHorizontal: 12,
		minHeight: 56,
	},
	skeletonTile: {
		width: 32,
		height: 32,
		borderRadius: 8,
	},
	skeletonBody: {
		flex: 1,
	},
	skeleton: {
		borderRadius: radii.sm,
	},
});
