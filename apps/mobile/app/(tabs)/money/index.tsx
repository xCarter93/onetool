import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Search } from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	badgeTone,
	DOCK_CLEARANCE,
	fontFamily,
	hero,
	radii,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { InkTabHeader } from "@/components/ink-tab-header";
import { requestSearchFocus } from "@/lib/search-focus";
import {
	DotGrid,
	Eyebrow,
	ListRow,
	Toggle2,
	SCROLL_TOP_INSET,
} from "@/components/ui";
import { formatCurrency, formatDocumentDate } from "@/lib/format";
import { Illustration } from "@/components/illustrations";
import { MoneyAmount } from "@/components/money/money-amount";
import {
	CollectedChart,
	type MonthBucket,
} from "@/components/money/collected-chart";

const WORK_TAB: Href = "/(tabs)/work" as Href;

type Tab = "invoices" | "quotes";

type InvoiceRow = {
	_id: Id<"invoices">;
	invoiceNumber: string;
	clientId: Id<"clients">;
	status: string;
	total: number;
	dueDate: number;
	paidAt?: number;
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

// The shell selection shape for Money. Mirrors selection-context's
// state.money: { kind: "quote" | "invoice"; id: string } | null.
type MoneySelection = { kind: "quote" | "invoice"; id: string };

// headerMode/onSelect/selected default off → the iPhone path (router.push to the
// ROOT /quote/[id] + /invoice/[id] routes, the InkTabHeader band, no selected
// highlight). The iPad shell renders this as a list pane: headerMode="pane"
// suppresses the self-mounted band and keeps the light Hero card in the list
// header (shell mounts the one PaneHeader above), onSelect drives the detail
// pane via the shell selection ({kind,id})
// instead of a route push, selected marks the row matching kind AND id.
export default function MoneyScreen({
	headerMode = "root",
	onSelect,
	selected = null,
}: {
	headerMode?: "root" | "pane";
	onSelect?: (sel: MoneySelection) => void;
	selected?: MoneySelection | null;
} = {}) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const isPane = headerMode === "pane";
	// The floating dock takes no layout height — lists clear it themselves.
	// iPad panes have no dock (the shell replaces Tabs).
	const listBottom = isPane ? 24 : DOCK_CLEARANCE + insets.bottom;
	// Pane keeps the fade inset below the shell's light chrome; on iPhone the ink
	// band is a hard edge, so the list starts just under it.
	const listTop = isPane ? SCROLL_TOP_INSET : 12;
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

	// Derived hero + chart facts — all client-side from the already-loaded
	// invoice list (existing-data-only rule for the 1d restyle): overdue
	// dollars, draft count, and paid totals bucketed into the last 6 months.
	const derived = useMemo(() => {
		if (!invoices) return undefined;
		let overdueAmount = 0;
		let draftCount = 0;
		for (const inv of invoices) {
			if (inv.status === "draft") draftCount += 1;
			const effOverdue =
				inv.status === "overdue" ||
				(inv.status === "sent" && inv.dueDate < now);
			if (effOverdue) overdueAmount += inv.total;
		}
		const base = new Date(now);
		const months: MonthBucket[] = [];
		for (let i = 5; i >= 0; i--) {
			const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
			const label = d
				.toLocaleDateString("en-US", { month: "short" })
				.toUpperCase();
			const start = d.getTime();
			const end = new Date(
				d.getFullYear(),
				d.getMonth() + 1,
				1
			).getTime();
			const value = invoices.reduce(
				(sum, inv) =>
					inv.paidAt && inv.paidAt >= start && inv.paidAt < end
						? sum + inv.total
						: sum,
				0
			);
			months.push({ label, value });
		}
		return { overdueAmount, draftCount, months };
	}, [invoices, now]);

	// One subline, two surfaces: the light Hero card (iPad pane) and the ink band
	// stat line (iPhone) must never drift apart.
	const overdueAmount = derived?.overdueAmount ?? 0;
	const sublineText = stats
		? `${overdueAmount > 0 ? "· " : ""}${stats.byStatus.sent} sent${
				derived && derived.draftCount > 0
					? ` · ${derived.draftCount} draft${derived.draftCount === 1 ? "" : "s"}`
					: ""
			}`
		: "";

	const Hero = (
		<View style={[styles.hero, { backgroundColor: t.card, borderColor: t.line }]}>
			<Eyebrow>Outstanding</Eyebrow>
			{stats === undefined ? (
				<>
					<View
						style={[styles.heroAmountSkeleton, { backgroundColor: t.lineSoft }]}
					/>
					<View
						style={[styles.heroSublineSkeleton, { backgroundColor: t.lineSoft }]}
					/>
				</>
			) : (
				<>
					<MoneyAmount amount={stats.totalOutstanding} size={40} />
					<View style={styles.heroSubRow}>
						{overdueAmount > 0 ? (
							<>
								<View style={[styles.overdueDot, { backgroundColor: t.danger }]} />
								<Text style={[styles.heroOverdue, { color: badgeTone.late.fg }]}>
									{formatCurrency(overdueAmount)} overdue
								</Text>
							</>
						) : null}
						<Text style={[styles.heroSubline, { color: t.sub }]}>
							{sublineText}
						</Text>
					</View>
				</>
			)}
		</View>
	);

	// The same figure on ink — a deliberately light shell for now (slice 7 fills
	// this band with the hero-KPI work).
	const BandStat = (
		<View style={styles.bandStat}>
			<Text style={styles.bandEyebrow}>OUTSTANDING</Text>
			{stats === undefined ? (
				<>
					<View
						style={[styles.heroAmountSkeleton, { backgroundColor: hero.cellBg }]}
					/>
					<View
						style={[styles.heroSublineSkeleton, { backgroundColor: hero.cellBg }]}
					/>
				</>
			) : (
				<>
					<MoneyAmount
						amount={stats.totalOutstanding}
						size={38}
						color={hero.text}
						centsColor={hero.textSub}
					/>
					<View style={styles.heroSubRow}>
						{overdueAmount > 0 ? (
							<>
								<View
									style={[styles.overdueDot, { backgroundColor: hero.alertDot }]}
								/>
								<Text style={[styles.heroOverdue, { color: hero.alertDot }]}>
									{formatCurrency(overdueAmount)} overdue
								</Text>
							</>
						) : null}
						<Text style={[styles.heroSubline, { color: hero.textMid }]}>
							{sublineText}
						</Text>
					</View>
				</>
			)}
		</View>
	);

	const ListHeader = (
		<View style={styles.listHeader}>
			{/* iPhone: the figure moved into the ink band. The iPad pane has no band,
			    so it keeps the light Hero card. */}
			{isPane ? Hero : null}
			{derived && derived.months.some((m) => m.value > 0) ? (
				<CollectedChart months={derived.months} />
			) : null}
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
					: t.sub;
		const client = clientName.get(item.clientId) ?? "Client";
		const isSelected =
			isPane && selected?.kind === "invoice" && selected.id === item._id;
		return (
			<ListRow
				icon="Receipt"
				iconColor={iconColor}
				title={item.invoiceNumber}
				sub={`${client} · due ${formatDocumentDate(item.dueDate)}`}
				status={displayStatus}
				selected={isSelected}
				right={
					<Text style={[styles.amount, { color: t.ink }]}>
						{formatCurrency(item.total, { exact: true })}
					</Text>
				}
				onPress={() =>
					// iPad pane: drive the shell selection ({kind,id}) — never a route
					// push to a (tabs)/ROOT sibling (that slides the whole shell). iPhone:
					// push the ROOT /invoice/[id] route exactly as before.
					onSelect
						? onSelect({ kind: "invoice", id: item._id })
						: router.push({
								pathname: "/invoice/[id]",
								params: { id: item._id },
							} as unknown as Href)
				}
			/>
		);
	};

	const renderQuote = ({ item }: { item: QuoteRow }) => {
		// Same table row as invoices (visual-pass feedback: the two tabs
		// diverged — quotes rendered as cards). ListRow carries the status
		// badge, hairline rows, and the iPad selected state for free.
		const iconColor =
			item.status === "approved"
				? t.success
				: item.status === "declined"
					? t.danger
					: t.sub;
		const client = clientName.get(item.clientId) ?? "Client";
		const sub = item.title
			? `${client} · ${item.title}`
			: `${client} · ${formatDocumentDate(item._creationTime)}`;
		const isSelected =
			isPane && selected?.kind === "quote" && selected.id === item._id;
		return (
			<ListRow
				icon="FileText"
				iconColor={iconColor}
				title={item.quoteNumber ?? item.title ?? "Quote"}
				sub={sub}
				status={item.status}
				selected={isSelected}
				right={
					<Text style={[styles.amount, { color: t.ink }]}>
						{formatCurrency(item.total, { exact: true })}
					</Text>
				}
				onPress={() =>
					// iPad pane: drive the shell selection ({kind,id}). iPhone: push the
					// ROOT /quote/[id] route exactly as before.
					onSelect
						? onSelect({ kind: "quote", id: item._id })
						: router.push({
								pathname: "/quote/[id]",
								params: { id: item._id },
							} as unknown as Href)
				}
			/>
		);
	};

	const activeLoading =
		tab === "invoices" ? invoices === undefined : quotes === undefined;

	const Skeleton = (
		<View style={styles.skeletonBlock}>
			{[0, 1, 2, 3].map((i) => (
				<View key={i} style={styles.skeletonRow}>
					<View
						style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]}
					/>
					<View style={styles.skeletonBody}>
						<View
							style={[
								styles.skeleton,
								{ width: "55%", height: 14, backgroundColor: t.lineSoft },
							]}
						/>
						<View
							style={[
								styles.skeleton,
								{
									width: "35%",
									height: 12,
									marginTop: 6,
									backgroundColor: t.lineSoft,
								},
							]}
						/>
					</View>
				</View>
			))}
		</View>
	);

	const Empty = (
		<View style={styles.emptyState}>
			<Illustration
				name={tab === "invoices" ? "invoices-none" : "quotes-none"}
				knockout={t.bg}
				style={styles.emptyArt}
			/>
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
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Pane mode: the shell mounts PaneHeader above this body (one header
			    per pane — locked convention). iPhone: the ink band, carrying the
			    outstanding figure and the search jump the old header held. */}
			{isPane ? null : (
				<InkTabHeader
					title="Money"
					actions={[
						{
							key: "search",
							label: "Search everything",
							icon: Search,
							onPress: () => {
								// Latch, then navigate: Work consumes it once on focus. A
								// ?focus= param would stick to the tab and re-fire forever.
								requestSearchFocus();
								router.push(WORK_TAB);
							},
						},
					]}
				>
					{BandStat}
				</InkTabHeader>
			)}
			{activeLoading ? (
				<View style={[styles.listContent, { paddingTop: listTop }]}>
					{ListHeader}
					{Skeleton}
				</View>
			) : tab === "invoices" ? (
				<FlashList
					data={invoices ?? []}
					keyExtractor={(item) => item._id}
					renderItem={renderInvoice}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: listTop,
						paddingBottom: listBottom,
					}}
					ListEmptyComponent={Empty}
				/>
			) : (
				<FlashList
					data={quotes ?? []}
					keyExtractor={(item) => item._id}
					renderItem={renderQuote}
					ListHeaderComponent={ListHeader}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: listTop,
						paddingBottom: listBottom,
					}}
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
	},
	listHeader: {
		gap: 16,
		paddingBottom: 16,
	},
	hero: {
		padding: 24,
		borderRadius: radii.r,
		borderWidth: 1,
		gap: 8,
	},
	bandStat: {
		gap: 4,
	},
	bandEyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
		color: hero.textDim,
	},
	heroSubRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexWrap: "wrap",
	},
	overdueDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	heroOverdue: {
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
		fontVariant: ["tabular-nums"],
	},
	heroSubline: {
		fontFamily: fontFamily.regular,
		fontSize: type.rowTitle,
	},
	heroAmountSkeleton: {
		width: 160,
		height: 32,
		borderRadius: radii.md,
	},
	heroSublineSkeleton: {
		width: 120,
		height: 14,
		borderRadius: radii.sm,
	},
	amount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
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
		borderRadius: radii["2xl"],
	},
	skeletonBody: {
		flex: 1,
	},
	skeleton: {
		borderRadius: radii.sm,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 64,
		paddingHorizontal: 24,
	},
	emptyArt: {
		marginBottom: 16,
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
