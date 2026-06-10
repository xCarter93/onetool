import { useMemo, useState } from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { Badge, Eyebrow, ListRow, Toggle2 } from "@/components/ui";
import { formatCurrency, formatDocumentDate } from "@/lib/format";

// Dark hero gradient — RN ignores CSS gradient strings on backgroundColor; apply
// via New-Arch experimental_backgroundImage (revenue-gauge.tsx precedent).
const HERO_GRADIENT: ViewStyle = {
	experimental_backgroundImage: "linear-gradient(135deg,#0b1220,#1c2734)",
} as unknown as ViewStyle;

type Tab = "invoices" | "quotes";

type InvoiceRow = {
	_id: Id<"invoices">;
	invoiceNumber: string;
	clientId: Id<"clients">;
	status: string;
	total: number;
	dueDate: number;
};

type QuoteRow = {
	_id: Id<"quotes">;
	quoteNumber?: string;
	title?: string;
	clientId: Id<"clients">;
	status: string;
	total: number;
	_creationTime: number;
};

export default function MoneyScreen() {
	const t = useTokens();
	const router = useRouter();
	const [tab, setTab] = useState<Tab>("invoices");
	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	const stats = useQuery(api.invoices.getStats, {});
	const invoices = useQuery(api.invoices.list, {}) as InvoiceRow[] | undefined;
	const quotes = useQuery(api.quotes.list, {}) as QuoteRow[] | undefined;
	const clients = useQuery(api.clients.list, { includeArchived: true });

	// Resolve client display names client-side (incl. archived) — Map<id, companyName>.
	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	const Hero = (
		<View style={[styles.hero, HERO_GRADIENT]}>
			<Eyebrow color="rgba(255,255,255,0.7)">Outstanding</Eyebrow>
			{stats === undefined ? (
				<>
					<View style={styles.heroAmountSkeleton} />
					<View style={styles.heroSublineSkeleton} />
				</>
			) : (
				<>
					<Text style={styles.heroAmount}>
						{formatCurrency(stats.totalOutstanding)}
					</Text>
					<Text style={styles.heroSubline}>
						{stats.byStatus.overdue} overdue · {stats.byStatus.sent} sent
					</Text>
				</>
			)}
		</View>
	);

	const ListHeader = (
		<View style={styles.listHeader}>
			{Hero}
			<Toggle2<Tab>
				value={tab}
				onChange={setTab}
				options={[
					{ value: "invoices", label: "Invoices" },
					{ value: "quotes", label: "Quotes" },
				]}
			/>
		</View>
	);

	const renderInvoice = ({ item }: { item: InvoiceRow }) => {
		// Effective status: a past-due sent invoice displays as overdue (web parity —
		// invoices.list returns STORED status; getStats counts overdue synthetically).
		const displayStatus =
			item.status === "sent" && item.dueDate < now
				? "overdue"
				: item.status;
		const iconColor =
			displayStatus === "paid"
				? t.success
				: displayStatus === "overdue"
					? t.danger
					: t.accent;
		const client = clientName.get(item.clientId) ?? "Client";
		return (
			<ListRow
				icon="Receipt"
				iconColor={iconColor}
				title={item.invoiceNumber}
				sub={`${client} · due ${formatDocumentDate(item.dueDate)}`}
				status={displayStatus}
				right={
					<Text style={[styles.amount, { color: t.ink }]}>
						{formatCurrency(item.total)}
					</Text>
				}
				onPress={() =>
					router.push({
						pathname: "/invoice/[id]",
						params: { id: item._id },
					} as unknown as Href)
				}
			/>
		);
	};

	const renderQuote = ({ item }: { item: QuoteRow }) => {
		const client = clientName.get(item.clientId) ?? "Client";
		const primary = item.title || `Quote ${item.quoteNumber ?? ""}`.trim();
		return (
			<Pressable
				style={({ pressed }) => [
					styles.quoteCard,
					{ backgroundColor: t.card, borderColor: t.line },
					pressed && styles.pressed,
				]}
				onPress={() =>
					router.push({
						pathname: "/quote/[id]",
						params: { id: item._id },
					} as unknown as Href)
				}
			>
				<View style={styles.quoteTop}>
					<View style={styles.quoteHead}>
						{item.quoteNumber ? (
							<Eyebrow>{item.quoteNumber}</Eyebrow>
						) : null}
						<Text
							style={[styles.quoteTitle, { color: t.ink }]}
							numberOfLines={1}
						>
							{primary}
						</Text>
						<Text style={[styles.quoteClient, { color: t.sub }]} numberOfLines={1}>
							{client}
						</Text>
					</View>
					<Badge status={item.status} />
				</View>
				<View style={[styles.quoteBottom, { borderTopColor: t.line }]}>
					<Text style={[styles.quoteDate, { color: t.faint }]}>
						{formatDocumentDate(item._creationTime)}
					</Text>
					<Text style={[styles.quoteAmount, { color: t.accent }]}>
						{formatCurrency(item.total)}
					</Text>
				</View>
			</Pressable>
		);
	};

	const activeLoading =
		tab === "invoices" ? invoices === undefined : quotes === undefined;

	const Skeleton = (
		<View style={styles.skeletonBlock}>
			{[0, 1, 2, 3].map((i) => (
				<View key={i} style={styles.skeletonRow}>
					<View style={styles.skeletonTile} />
					<View style={styles.skeletonBody}>
						<View style={[styles.skeleton, { width: "55%", height: 14 }]} />
						<View
							style={[
								styles.skeleton,
								{ width: "35%", height: 12, marginTop: 6 },
							]}
						/>
					</View>
				</View>
			))}
		</View>
	);

	const Empty = (
		<View style={styles.emptyState}>
			<Text style={[styles.emptyTitle, { color: t.ink }]}>
				{tab === "invoices" ? "No invoices yet" : "No quotes yet"}
			</Text>
			<Text style={[styles.emptyText, { color: t.sub }]}>
				{tab === "invoices"
					? "Invoices you create on the web will show up here."
					: "Quotes you create on the web will show up here."}
			</Text>
		</View>
	);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			<AppHeader mode="root" title="Money" />
			{activeLoading ? (
				<View style={styles.listContent}>
					{ListHeader}
					{Skeleton}
				</View>
			) : tab === "invoices" ? (
				<FlashList
					data={invoices ?? []}
					keyExtractor={(item) => item._id}
					renderItem={renderInvoice}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={styles.listContent}
					ListEmptyComponent={Empty}
				/>
			) : (
				<FlashList
					data={quotes ?? []}
					keyExtractor={(item) => item._id}
					renderItem={renderQuote}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={styles.listContent}
					ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
					ListEmptyComponent={Empty}
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
		gap: 16,
		paddingBottom: 16,
	},
	hero: {
		padding: 24,
		borderRadius: radii.r,
		backgroundColor: "#0b1220",
		gap: 8,
	},
	heroAmount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: "#ffffff",
	},
	heroSubline: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: "rgba(255,255,255,0.7)",
	},
	heroAmountSkeleton: {
		width: 160,
		height: 32,
		borderRadius: 8,
		backgroundColor: "rgba(255,255,255,0.14)",
	},
	heroSublineSkeleton: {
		width: 120,
		height: 14,
		borderRadius: 6,
		backgroundColor: "rgba(255,255,255,0.1)",
	},
	amount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
	},
	quoteCard: {
		borderRadius: radii.rLg,
		borderWidth: 1,
		boxShadow: shadow.card,
		padding: 16,
		gap: 12,
	},
	pressed: {
		opacity: 0.85,
	},
	quoteTop: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	quoteHead: {
		flex: 1,
		minWidth: 0,
		gap: 3,
	},
	quoteTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h3,
	},
	quoteClient: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	quoteBottom: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderTopWidth: 1,
		paddingTop: 12,
	},
	quoteDate: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	quoteAmount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
	},
	skeletonBlock: {
		gap: 4,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 4,
	},
	skeletonTile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		backgroundColor: "#e9edf2",
	},
	skeletonBody: {
		flex: 1,
	},
	skeleton: {
		backgroundColor: "#e9edf2",
		borderRadius: 6,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginBottom: 8,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		textAlign: "center",
	},
});
