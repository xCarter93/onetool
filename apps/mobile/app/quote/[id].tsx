import { useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { CheckCircle2, XCircle } from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { Badge, Card, Eyebrow, TotalsBlock } from "@/components/ui";
import { formatCurrency, formatDocumentDate } from "@/lib/format";

// Body extracted (P26 Option B). headerMode DEFAULTS to "root" → the iPhone
// route wrapper below is byte-identical. The iPad Money pane passes "pane".
export function QuoteDetailBody({
	id,
	headerMode = "root",
	onBack,
}: {
	id: string;
	headerMode?: "root" | "pane";
	// iPad pane: when the shell provides onBack the header is a PaneHeader whose
	// back CLEARS the shell selection (router.back would pop out of the shell —
	// money selection drives nav, no route was pushed). Keeps ONE header per pane.
	onBack?: () => void;
}) {
	const t = useTokens();
	const appHeaderMode = headerMode === "pane" ? "pane" : "detail";
	// In an iPad pane WITH an onBack the body owns a PaneHeader (back → clear
	// selection); otherwise AppHeader (root/detail = router back, pane = no back).
	const renderHeader = (title?: string) =>
		headerMode === "pane" && onBack ? (
			<PaneHeader title={title} onBack={onBack} />
		) : (
			<AppHeader mode={appHeaderMode} title={title} />
		);
	// Signed signature URLs can expire mid-session — fall back to a caption on load error.
	const [sigError, setSigError] = useState(false);

	const quote = useQuery(
		api.quotes.get,
		id ? { id: id as Id<"quotes"> } : "skip"
	);
	const items = useQuery(
		api.quoteLineItems.listByQuote,
		id ? { quoteId: id as Id<"quotes"> } : "skip"
	);
	const clients = useQuery(api.clients.list, {});
	// getApprovalAudit is a userQuery that THROWS on missing/forbidden — the "skip"
	// guard is the only gate; the app-level error boundary handles the throw path.
	// audit drives ONLY the Approval block; quotes.get stays the sole screen driver.
	const audit = useQuery(
		api.quotes.getApprovalAudit,
		id ? { quoteId: id as Id<"quotes"> } : "skip"
	);

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// quote === undefined → loading skeleton.
	if (quote === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				{renderHeader()}
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
				{renderHeader("Quote")}
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
		{
			label: "Subtotal",
			value: formatCurrency(quote.subtotal, { exact: true }),
		},
	];
	if (quote.discountEnabled && quote.discountAmount) {
		totalsRows.push({
			label: "Discount",
			value: formatCurrency(discountDollars, { exact: true }),
			negative: true,
		});
	}
	if (quote.taxEnabled) {
		totalsRows.push({
			label: `Tax (${quote.taxRate ?? 0}%)`,
			value: formatCurrency(quote.taxAmount ?? 0, { exact: true }),
		});
	}

	// Approval state machine — prefer the richer audit row, fall back to quote.status.
	const latest = Array.isArray(audit) ? audit[0] : undefined;
	const auditEmpty = Array.isArray(audit) && audit.length === 0;
	const resolvedStatus =
		quote.status === "approved" || quote.status === "declined";

	// Show/hide gate — a draft (unsent, no audit row, non-resolved) renders NOTHING,
	// and never flashes a skeleton while audit is still loading.
	const showApproval = !(
		!quote.sentAt &&
		(audit === undefined || (auditEmpty && !resolvedStatus))
	);

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			{renderHeader(headerTitle)}
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
											{item.quantity} × {formatCurrency(item.rate, { exact: true })}
										</Text>
									</View>
									<Text style={[styles.lineAmount, { color: t.ink }]}>
										{formatCurrency(item.amount, { exact: true })}
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
							total={{
								label: "Total",
								value: formatCurrency(quote.total, { exact: true }),
							}}
						/>
					</View>

					{/* Approval — read-only lifecycle state below the totals. */}
					{showApproval ? (
						<>
							<View style={[styles.divider, { backgroundColor: t.line }]} />
							<View style={styles.approvalBlock}>
								<Eyebrow>Approval</Eyebrow>

								{audit === undefined ? (
									// Loading (only reachable for a sent quote — drafts are hidden).
									<View
										style={[
											styles.approvalSkeleton,
											{ backgroundColor: t.muted },
										]}
									/>
								) : latest?.action === "approved" ? (
									// Approved (audit row): contact email + date + signature.
									<>
										<View style={styles.approvalRow}>
											<CheckCircle2 size={18} color={"#1f9d57"} />
											<Text style={[styles.approvalLabel, { color: t.ink }]}>
												Approved
											</Text>
										</View>
										<Text style={[styles.approvalCaption, { color: t.sub }]}>
											{latest.contactEmail} ·{" "}
											{formatDocumentDate(latest.createdAt)}
										</Text>
										{latest.signatureUrl && !sigError ? (
											<Image
												source={{ uri: latest.signatureUrl }}
												accessibilityLabel="Client signature"
												accessibilityRole="image"
												resizeMode="contain"
												onError={() => setSigError(true)}
												style={[styles.signature, { borderColor: t.line }]}
											/>
										) : latest.signatureUrl && sigError ? (
											<Text
												style={[styles.approvalCaption, { color: t.faint }]}
											>
												Signature unavailable
											</Text>
										) : null}
									</>
								) : latest?.action === "declined" ? (
									// Declined (audit row): decline reason.
									<>
										<View style={styles.approvalRow}>
											<XCircle size={18} color={"#e23b3b"} />
											<Text
												style={[styles.approvalLabel, { color: "#e23b3b" }]}
											>
												Declined
											</Text>
										</View>
										<Text style={[styles.approvalCaption, { color: t.sub }]}>
											{formatDocumentDate(latest.createdAt)}
										</Text>
										{latest.declineReason ? (
											<Text
												style={[styles.approvalCaption, { color: t.sub }]}
											>
												“{latest.declineReason}”
											</Text>
										) : null}
									</>
								) : auditEmpty && quote.status === "approved" ? (
									// Approved (resolved-without-audit): status + approvedAt, no email/signature.
									<>
										<View style={styles.approvalRow}>
											<CheckCircle2 size={18} color={"#1f9d57"} />
											<Text style={[styles.approvalLabel, { color: t.ink }]}>
												Approved
											</Text>
										</View>
										{quote.approvedAt ? (
											<Text
												style={[styles.approvalCaption, { color: t.sub }]}
											>
												{formatDocumentDate(quote.approvedAt)}
											</Text>
										) : null}
									</>
								) : auditEmpty && quote.status === "declined" ? (
									// Declined (resolved-without-audit): status + declinedAt, no reason.
									<>
										<View style={styles.approvalRow}>
											<XCircle size={18} color={"#e23b3b"} />
											<Text
												style={[styles.approvalLabel, { color: "#e23b3b" }]}
											>
												Declined
											</Text>
										</View>
										{quote.declinedAt ? (
											<Text
												style={[styles.approvalCaption, { color: t.sub }]}
											>
												{formatDocumentDate(quote.declinedAt)}
											</Text>
										) : null}
									</>
								) : auditEmpty && quote.sentAt && !resolvedStatus ? (
									// Awaiting — sent, not yet resolved.
									<Text style={[styles.approvalLabel, { color: t.ink }]}>
										Awaiting client signature{" "}
										<Text style={[styles.approvalCaption, { color: t.faint }]}>
											· sent {formatDocumentDate(quote.sentAt)}
										</Text>
									</Text>
								) : null}
							</View>
						</>
					) : null}
				</Card>

				<View style={{ height: 32 }} />
			</ScrollView>
		</SafeAreaView>
	);
}

// Thin route wrapper — iPhone-identical (renders the body in "root" mode).
export default function QuoteDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	if (!id) return null;
	return <QuoteDetailBody id={id} />;
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

	approvalBlock: {
		paddingHorizontal: 18,
		paddingBottom: 18,
		paddingTop: 14,
		gap: 8,
	},
	approvalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	approvalLabel: { fontFamily: fontFamily.bold, fontSize: type.h4 },
	approvalCaption: { fontFamily: fontFamily.regular, fontSize: type.sm },
	approvalSkeleton: { height: 14, borderRadius: radii.sm, width: "100%" },
	signature: {
		width: 160,
		height: 64,
		borderRadius: radii.md,
		borderWidth: 1,
		backgroundColor: "#fff",
	},

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
