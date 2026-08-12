import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Search } from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
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
	SectionHeader,
	SCROLL_TOP_INSET,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { MoneyAmount } from "@/components/money/money-amount";
import { CollectedChart } from "@/components/money/collected-chart";
import { PipelineStrip } from "@/components/money/pipeline-strip";
import { NeedsAttention } from "@/components/money/needs-attention";
import { RecentPayments } from "@/components/money/recent-payments";

const WORK_TAB: Href = "/(tabs)/work" as Href;

// The shell selection shape for Money. Mirrors selection-context's
// state.money: { kind: "quote" | "invoice"; id: string } | null.
type MoneySelection = { kind: "quote" | "invoice"; id: string };

// Slice 7: Money is a DASHBOARD, not a browser. Browsing the full quote and
// invoice lists lives on Work behind its type chips, so this screen's only read
// is api.businessHealth.get — one payload carrying the outstanding figure
// (remaining balance, not invoice totals), the pipeline, the attention queue,
// the collected series and the latest payments.
//
// headerMode/onSelect/selected default off → the iPhone path (router.push to the
// ROOT /quote/[id] + /invoice/[id] routes, the InkTabHeader band, no selected
// highlight). The iPad shell renders this as a list pane: headerMode="pane"
// suppresses the self-mounted band and keeps the light Hero card at the top
// (the shell mounts the one PaneHeader above), and onSelect drives the detail
// pane via the shell selection ({kind,id}) instead of a route push.
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
	// The floating dock takes no layout height — scroll content clears it itself.
	// iPad panes have no dock (the shell replaces Tabs).
	const listBottom = isPane ? 24 : DOCK_CLEARANCE + insets.bottom;
	// Pane keeps the fade inset below the shell's light chrome; on iPhone the ink
	// band is a hard edge, so the content starts just under it.
	const listTop = isPane ? SCROLL_TOP_INSET : 12;
	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	const health = useQuery(api.businessHealth.get, {});
	const loading = health === undefined;

	const outstanding = health?.outstanding;
	const overdueAmount = outstanding?.overdue ?? 0;
	const openCount = outstanding?.invoiceCount ?? 0;
	// One subline, two surfaces: the light Hero card (iPad pane) and the ink band
	// stat line (iPhone) must never drift apart.
	const sublineText = health
		? `${overdueAmount > 0 ? "· " : ""}${openCount} open ${
				openCount === 1 ? "invoice" : "invoices"
			}`
		: "";
	// The strip's collected cell is labelled with the payload's own latest bucket
	// (already in the org's timezone) — no client-side month math.
	const collectedLabel = health?.months.at(-1)?.label;

	// iPad keeps every cell and view-all static this slice: the panes do not
	// cross-navigate to the Work tab.
	const browseWork = (kind: "quote" | "invoice") =>
		router.push(`/(tabs)/work?kind=${kind}` as Href);
	const onPressAwaiting = isPane ? undefined : () => browseWork("quote");
	const onPressUnpaid = isPane ? undefined : () => browseWork("invoice");

	const openRecord = (kind: "quote" | "invoice", id: string) =>
		onSelect
			? onSelect({ kind, id })
			: router.push({
					pathname: kind === "invoice" ? "/invoice/[id]" : "/quote/[id]",
					params: { id },
				} as unknown as Href);

	const Strip = health ? (
		<PipelineStrip
			awaitingCount={health.awaiting.count}
			awaitingTotal={health.awaiting.total}
			unpaidCount={health.outstanding.invoiceCount}
			unpaidTotal={health.outstanding.total}
			collected={health.collectedThisMonth}
			collectedLabel={collectedLabel}
			onInk={!isPane}
			onPressAwaiting={onPressAwaiting}
			onPressUnpaid={onPressUnpaid}
		/>
	) : null;

	const Hero = (
		<View style={[styles.hero, { backgroundColor: t.card, borderColor: t.line }]}>
			<Eyebrow>Outstanding</Eyebrow>
			{loading ? (
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
					<MoneyAmount amount={health.outstanding.total} size={40} />
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

	// The same figure on ink, with the pipeline strip pinned under it.
	const BandStat = (
		<>
			<View style={styles.bandStat}>
				<Text style={styles.bandEyebrow}>OUTSTANDING</Text>
				{loading ? (
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
							amount={health.outstanding.total}
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
			{loading ? (
				<View style={styles.stripSkeleton}>
					{[0, 1, 2].map((i) => (
						<View
							key={i}
							style={[styles.stripSkeletonCell, { backgroundColor: hero.cellBg }]}
						/>
					))}
				</View>
			) : (
				Strip
			)}
		</>
	);

	const Skeleton = (
		<View style={styles.skeletonBlock}>
			{[0, 1, 2, 3].map((i) => (
				<View key={i} style={styles.skeletonRow}>
					<View style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]} />
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

	// A chart of six zeroes says nothing — hide it until there is money in it.
	const showChart = !!health && health.months.some((m) => m.value > 0);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Pane mode: the shell mounts PaneHeader above this body (one header
			    per pane — locked convention). iPhone: the ink band, carrying the
			    outstanding figure, the pipeline strip, and the search jump. */}
			{isPane ? null : (
				<InkTabHeader
					orgChip
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
			<ScrollView
				contentContainerStyle={{
					...styles.listContent,
					paddingTop: listTop,
					paddingBottom: listBottom,
				}}
				showsVerticalScrollIndicator={false}
			>
				{/* iPhone: the figure and strip live in the ink band. The iPad pane
				    has no band, so it keeps the light Hero card + a light strip. */}
				{isPane ? (
					<View style={styles.paneHead}>
						{Hero}
						{loading ? (
							<View style={styles.stripSkeleton}>
								{[0, 1, 2].map((i) => (
									<View
										key={i}
										style={[
											styles.stripSkeletonCell,
											{ backgroundColor: t.lineSoft },
										]}
									/>
								))}
							</View>
						) : (
							Strip
						)}
					</View>
				) : null}

				{showChart ? <CollectedChart months={health.months} /> : null}

				<View style={styles.section}>
					<SectionHeader
						title="Needs attention"
						action={isPane ? undefined : "View all"}
						// The queue mixes invoices and quotes, so it lands on Work
						// unscoped — same rule Today's attention line follows.
						onAction={isPane ? undefined : () => router.push(WORK_TAB)}
					/>
					{loading ? (
						Skeleton
					) : (
						<NeedsAttention
							items={health.needsAttention}
							now={now}
							selected={isPane ? selected : null}
							onOpen={(item) => openRecord(item.kind, item.id)}
						/>
					)}
				</View>

				{loading || health.recentPayments.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader title="Recent payments" />
						{loading ? (
							Skeleton
						) : (
							<RecentPayments
								payments={health.recentPayments}
								now={now}
								selected={isPane ? selected : null}
								onOpen={(payment) => openRecord("invoice", payment.invoiceId)}
							/>
						)}
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	listContent: {
		paddingHorizontal: 16,
		gap: 16,
	},
	paneHead: {
		gap: 12,
	},
	section: {
		gap: 4,
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
		borderRadius: radii.pill,
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
	stripSkeleton: {
		flexDirection: "row",
		gap: 8,
	},
	stripSkeletonCell: {
		flex: 1,
		height: 68,
		borderRadius: radii.ctrl,
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
});
