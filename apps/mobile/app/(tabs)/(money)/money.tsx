import { useCallback, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
	FileText,
	HandCoins,
	MoreHorizontal,
	type LucideIcon,
} from "lucide-react-native";
import { MenuView } from "@expo/ui/community/menu";
import { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { CanvasScroll, Panel } from "@/components/canvas";
import { Eyebrow, SegmentedToggle } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { MoneyAmount } from "@/components/money/money-amount";
import { CollectedChart } from "@/components/money/collected-chart";
import { PipelineStrip } from "@/components/money/pipeline-strip";
import { NeedsAttention } from "@/components/money/needs-attention";
import { RecentPayments } from "@/components/money/recent-payments";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { useOrgToday } from "@/lib/use-org-today";
import { usePermissions } from "@/lib/use-permissions";

// The shell selection shape for Money. Mirrors selection-context's
// state.money: { kind: "quote" | "invoice"; id: string } | null.
type MoneySelection = { kind: "quote" | "invoice"; id: string };
type AttentionTab = "attention" | "payments";

// Money is a DASHBOARD, not a browser. Browsing the full quote and invoice
// lists lives on Work behind its type chips, so this screen's only read is
// api.businessHealth.get — one payload carrying the outstanding figure
// (remaining balance, not invoice totals), the pipeline, the attention queue,
// the collected series and the latest payments.
//
// headerMode/onSelect/selected default off → the iPhone path (router.push to
// the ROOT /quote/[id] + /invoice/[id] routes, no selected highlight). The
// iPad shell renders this as a list pane: headerMode="pane" mounts its own
// PaneHeader above this body, and onSelect drives the detail pane via the
// shell selection ({kind,id}) instead of a route push.
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
	const isPane = headerMode === "pane";
	const today = useOrgToday();
	const { can, isLoading: permsLoading } = usePermissions();
	const canCreateQuote = permsLoading || can("quotes", "modify");

	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());
	const [tab, setTab] = useState<AttentionTab>("attention");
	const [refreshing, setRefreshing] = useState(false);

	// Convex queries are already reactive — this spinner is purely the pull
	// gesture's feedback, same pattern as the other record screens.
	const onRefresh = useCallback(() => {
		setRefreshing(true);
		setTimeout(() => setRefreshing(false), 800);
	}, []);

	const health = useCachedQuery(api.businessHealth.get, {});
	const loading = health === undefined;

	const outstanding = health?.outstanding;
	const overdueAmount = outstanding?.overdue ?? 0;
	const openCount = outstanding?.invoiceCount ?? 0;

	// iPad keeps every cell and action static this slice: the panes do not
	// cross-navigate to the Work tab.
	const browseWork = (kind: "quote" | "invoice") =>
		router.push(`/work?kind=${kind}` as Href);
	const onPressAwaiting = isPane ? undefined : () => browseWork("quote");
	const onPressUnpaid = isPane ? undefined : () => browseWork("invoice");

	const openRecord = (kind: "quote" | "invoice", id: string) =>
		onSelect
			? onSelect({ kind, id })
			: router.push({
					pathname: kind === "invoice" ? "/invoice/[id]" : "/quote/[id]",
					params: { id },
				} as unknown as Href);

	// A chart of six zeroes says nothing — hide it until there is money in it.
	const showChart = !!health && health.months.some((m) => m.value > 0);

	const Skeleton = (
		<Panel>
			{[0, 1, 2].map((i) => (
				<View key={i} style={styles.skeletonRow}>
					<View style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]} />
					<View style={styles.skeletonBody}>
						<View
							style={[styles.skeletonLine, { width: "55%", backgroundColor: t.lineSoft }]}
						/>
						<View
							style={[
								styles.skeletonLine,
								{ width: "35%", marginTop: 6, backgroundColor: t.lineSoft },
							]}
						/>
					</View>
				</View>
			))}
		</Panel>
	);

	return (
		<CanvasScroll
			contentContainerStyle={isPane ? styles.paneScroll : undefined}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
		>
			<View style={styles.hero}>
				<Eyebrow>Outstanding</Eyebrow>
				{loading ? (
					<>
						<View style={[styles.heroAmountSkeleton, { backgroundColor: t.lineSoft }]} />
						<View style={[styles.heroSublineSkeleton, { backgroundColor: t.lineSoft }]} />
					</>
				) : (
					<>
						<MoneyAmount amount={health.outstanding.total} size={40} />
						<View style={styles.heroSubRow}>
							{overdueAmount > 0 ? (
								<>
									<View style={[styles.overdueDot, { backgroundColor: t.danger }]} />
									<Text style={[styles.heroOverdue, { color: t.danger }]}>
										{formatCurrency(overdueAmount)} overdue
									</Text>
									<Text style={[styles.heroSubline, { color: t.sub }]}>·</Text>
								</>
							) : null}
							<Text style={[styles.heroSubline, { color: t.sub }]}>
								{openCount} open {openCount === 1 ? "invoice" : "invoices"}
							</Text>
						</View>
					</>
				)}
			</View>

			{health ? (
				<PipelineStrip
					awaitingCount={health.awaiting.count}
					awaitingTotal={health.awaiting.total}
					unpaidCount={health.outstanding.invoiceCount}
					unpaidTotal={health.outstanding.total}
					onPressAwaiting={onPressAwaiting}
					onPressUnpaid={onPressUnpaid}
				/>
			) : null}

			{showChart ? <CollectedChart months={health.months} /> : null}

			<View style={styles.actionRow}>
				{!isPane ? (
					<ActionButton
						icon={HandCoins}
						label="Record"
						onPress={() => browseWork("invoice")}
					/>
				) : null}
				{canCreateQuote ? (
					<ActionButton
						icon={FileText}
						label="New quote"
						onPress={() => router.push("/quote/new" as Href)}
					/>
				) : null}
				{!isPane ? (
					<MoreButton
						items={[
							{ key: "quotes", label: "View quotes", run: () => browseWork("quote") },
							{ key: "invoices", label: "View invoices", run: () => browseWork("invoice") },
						]}
					/>
				) : null}
			</View>

			<SegmentedToggle
				segments={[
					{ value: "attention", label: "Needs attention", count: health?.needsAttention.length ?? 0 },
					{ value: "payments", label: "Payments" },
				]}
				value={tab}
				onChange={setTab}
			/>

			{tab === "attention" ? (
				loading ? (
					Skeleton
				) : (
					<NeedsAttention
						items={health.needsAttention}
						now={now}
						today={today}
						selected={isPane ? selected : null}
						onOpen={(item) => openRecord(item.kind, item.id)}
					/>
				)
			) : loading ? (
				Skeleton
			) : (
				<RecentPayments
					payments={health.recentPayments}
					now={now}
					selected={isPane ? selected : null}
					onOpen={(payment) => openRecord("invoice", payment.invoiceId)}
				/>
			)}
		</CanvasScroll>
	);
}

function ActionButton({
	icon: Icon,
	label,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	onPress: () => void;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={styles.actionCol}
		>
			{({ pressed }) => (
				<>
					<View
						style={[
							styles.actionTile,
							{ backgroundColor: pressed ? t.secondary : t.card, borderColor: t.line },
						]}
					>
						<Icon size={18} color={t.ink} strokeWidth={2} />
					</View>
					<Text style={[styles.actionLabel, { color: t.sub }]} numberOfLines={1}>
						{label}
					</Text>
				</>
			)}
		</Pressable>
	);
}

function MoreButton({
	items,
}: {
	items: { key: string; label: string; run: () => void }[];
}) {
	const t = useTokens();
	return (
		<View style={styles.actionCol}>
			<MenuView
				title="More"
				onPressAction={({ nativeEvent }) =>
					items.find((i) => i.key === nativeEvent.event)?.run()
				}
				actions={items.map((i) => ({ id: i.key, title: i.label }))}
			>
				<View
					style={[styles.actionTile, { backgroundColor: t.card, borderColor: t.line }]}
					accessible
					accessibilityRole="button"
					accessibilityLabel="More actions"
				>
					<MoreHorizontal size={18} color={t.ink} strokeWidth={2} />
				</View>
			</MenuView>
			<Text style={[styles.actionLabel, { color: t.sub }]} numberOfLines={1}>
				More
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	paneScroll: {
		paddingTop: 12,
	},
	hero: {
		alignItems: "center",
		gap: 6,
	},
	heroSubRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexWrap: "wrap",
		justifyContent: "center",
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
		height: 36,
		borderRadius: 8,
		marginTop: 4,
	},
	heroSublineSkeleton: {
		width: 140,
		height: 14,
		borderRadius: 4,
		marginTop: 4,
	},
	actionRow: {
		flexDirection: "row",
	},
	actionCol: {
		flex: 1,
		alignItems: "center",
		gap: 6,
	},
	actionTile: {
		width: 52,
		height: 52,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	actionLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.micro,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 11,
		paddingHorizontal: 12,
	},
	skeletonTile: {
		width: 32,
		height: 32,
		borderRadius: 8,
	},
	skeletonBody: {
		flex: 1,
	},
	skeletonLine: {
		height: 12,
		borderRadius: 4,
	},
});
