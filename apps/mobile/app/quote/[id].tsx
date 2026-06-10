import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { Badge, Card, Eyebrow, TotalsBlock } from "@/components/ui";
import { formatCurrency, formatDocumentDate } from "@/lib/format";

export default function QuoteDetailScreen() {
	const t = useTokens();
	const { id } = useLocalSearchParams<{ id: string }>();

	const quote = useQuery(
		api.quotes.get,
		id ? { id: id as Id<"quotes"> } : "skip"
	);
	const items = useQuery(
		api.quoteLineItems.listByQuote,
		id ? { quoteId: id as Id<"quotes"> } : "skip"
	);
	const clients = useQuery(api.clients.list, {});

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// quote === undefined → loading skeleton.
	if (quote === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<AppHeader mode="detail" />
				<ScrollView contentContainerStyle={styles.scroll}>
					<View
						style={[
							styles.skeletonHeader,
							{ backgroundColor: t.card, borderColor: t.line },
						]}
					/>
					<View style={styles.skeletonLines}>
						{[0, 1, 2].map((i) => (
							<View
								key={i}
								style={[styles.skeletonLine, { backgroundColor: t.muted }]}
							/>
						))}
					</View>
				</ScrollView>
			</SafeAreaView>
		);
	}

	// quote === null → clean Not found (no auto-bounce).
	if (quote === null) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<AppHeader mode="detail" title="Quote" />
				<View style={styles.notFound}>
					<Text style={[styles.notFoundTitle, { color: t.ink }]}>
						Not found
					</Text>
					<Text style={[styles.notFoundBody, { color: t.sub }]}>
						This quote may have been removed or belongs to another
						organization.
					</Text>
				</View>
			</SafeAreaView>
		);
	}

	const headerTitle = quote.quoteNumber ?? "Quote";
	const documentTitle =
		quote.title || `Quote #${quote.quoteNumber ?? ""}`.trim();
	const client = clientName.get(quote.clientId) ?? "Client";

	// Discount dollars — get does NOT return a calculated discount amount, so derive
	// it (percentage → subtotal * pct/100; otherwise the stored fixed amount).
	const discountDollars =
		quote.discountType === "percentage"
			? quote.subtotal * ((quote.discountAmount ?? 0) / 100)
			: (quote.discountAmount ?? 0);

	// Build the TotalsBlock rows: Subtotal always · Discount/Tax conditional.
	const totalsRows: { label: string; value: string; negative?: boolean }[] = [
		{ label: "Subtotal", value: formatCurrency(quote.subtotal) },
	];
	if (quote.discountEnabled && quote.discountAmount) {
		totalsRows.push({
			label: "Discount",
			value: formatCurrency(discountDollars),
			negative: true,
		});
	}
	if (quote.taxEnabled) {
		totalsRows.push({
			label: `Tax (${quote.taxRate ?? 0}%)`,
			value: formatCurrency(quote.taxAmount ?? 0),
		});
	}

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			<AppHeader mode="detail" title={headerTitle} />
			<ScrollView contentContainerStyle={styles.scroll}>
				<Card style={styles.docCard}>
					{/* Header block */}
					<View style={styles.headerBlock}>
						{quote.quoteNumber ? (
							<Eyebrow>Quote {quote.quoteNumber}</Eyebrow>
						) : null}
						<View style={styles.titleRow}>
							<Text
								style={[styles.docTitle, { color: t.ink }]}
								numberOfLines={2}
							>
								{documentTitle}
							</Text>
							<Badge status={quote.status} big />
						</View>
						<Text style={[styles.client, { color: t.sub }]} numberOfLines={1}>
							{client}
						</Text>
						<View style={styles.metaRows}>
							<View style={styles.metaRow}>
								<Text style={[styles.metaLabel, { color: t.faint }]}>
									Created
								</Text>
								<Text style={[styles.metaValue, { color: t.sub }]}>
									{formatDocumentDate(quote._creationTime)}
								</Text>
							</View>
							{quote.validUntil ? (
								<View style={styles.metaRow}>
									<Text style={[styles.metaLabel, { color: t.faint }]}>
										Valid until
									</Text>
									<Text style={[styles.metaValue, { color: t.sub }]}>
										{formatDocumentDate(quote.validUntil)}
									</Text>
								</View>
							) : null}
						</View>
					</View>

					<View style={[styles.divider, { backgroundColor: t.line }]} />

					{/* Line items — three states. */}
					{items === undefined ? (
						<View style={styles.lineSkeletonBlock}>
							{[0, 1, 2].map((i) => (
								<View
									key={i}
									style={[styles.lineSkeleton, { backgroundColor: t.muted }]}
								/>
							))}
						</View>
					) : items.length === 0 ? (
						<Text style={[styles.noLines, { color: t.faint }]}>
							No itemized lines
						</Text>
					) : (
						<View>
							{items.map((item, i) => (
								<View
									key={item._id}
									style={[
										styles.lineRow,
										{
											borderBottomColor: t.line,
											borderBottomWidth: i === items.length - 1 ? 0 : 1,
										},
									]}
								>
									<View style={styles.lineBody}>
										<Text
											style={[styles.lineDesc, { color: t.ink }]}
											numberOfLines={2}
										>
											{item.description}
											{item.unit ? ` · ${item.unit}` : ""}
										</Text>
										<Text style={[styles.lineSub, { color: t.faint }]}>
											{item.quantity} × {formatCurrency(item.rate)}
										</Text>
									</View>
									<Text style={[styles.lineAmount, { color: t.ink }]}>
										{formatCurrency(item.amount)}
									</Text>
								</View>
							))}
						</View>
					)}

					<View style={[styles.divider, { backgroundColor: t.line }]} />

					{/* Totals — read straight from quotes.get (never recomputed). */}
					<View style={styles.totalsWrap}>
						<TotalsBlock
							rows={totalsRows}
							total={{ label: "Total", value: formatCurrency(quote.total) }}
						/>
					</View>
				</Card>

				<View style={{ height: 32 }} />
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	scroll: { padding: 16 },

	docCard: { padding: 0, overflow: "hidden" },

	headerBlock: { padding: 18, gap: 6 },
	titleRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	docTitle: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
		letterSpacing: -0.3,
	},
	client: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	metaRows: { marginTop: 6, gap: 6 },
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	metaLabel: { fontFamily: fontFamily.regular, fontSize: type.sm },
	metaValue: { fontFamily: fontFamily.semibold, fontSize: type.sm },

	divider: { height: 1, marginHorizontal: 18 },

	// Inset the totals to align with line-item content + give the card a bottom edge.
	totalsWrap: { paddingHorizontal: 18, paddingBottom: 18 },

	lineRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 18,
	},
	lineBody: { flex: 1, minWidth: 0, gap: 2 },
	lineDesc: { fontFamily: fontFamily.semibold, fontSize: type.h4 },
	lineSub: { fontFamily: fontFamily.regular, fontSize: type.sm },
	lineAmount: { fontFamily: fontFamily.bold, fontSize: type.h4 },

	noLines: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		paddingVertical: 18,
		paddingHorizontal: 18,
	},

	skeletonHeader: {
		height: 120,
		borderRadius: radii.rLg,
		borderWidth: 1,
	},
	skeletonLines: { marginTop: 14, gap: 10 },
	skeletonLine: { height: 48, borderRadius: radii.r },
	lineSkeletonBlock: { paddingHorizontal: 18, paddingVertical: 12, gap: 10 },
	lineSkeleton: { height: 40, borderRadius: radii.sm },

	notFound: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 8,
	},
	notFoundTitle: { fontFamily: fontFamily.bold, fontSize: type.h2 },
	notFoundBody: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		textAlign: "center",
	},
});
