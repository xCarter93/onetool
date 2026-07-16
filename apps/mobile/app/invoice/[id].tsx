import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { Badge, Card, Eyebrow, TotalsBlock } from "@/components/ui";
import { formatCurrency, formatDocumentDate } from "@/lib/format";

// Read-only itemized invoice detail (MONEY-02). Itemized like the quote detail
// (CONTEXT diverges from the prototype's summary view), reusing the shared
// TotalsBlock + formatDocumentDate so this layout matches quote/[id] exactly.
// Totals come straight from invoices.get (calculated server-side) — never recomputed.
// Body extracted (P26 Option B). headerMode DEFAULTS to "root" → the iPhone
// route wrapper below is byte-identical. The iPad Money pane passes "pane".
export function InvoiceDetailBody({
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
	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	const invoice = useQuery(
		api.invoices.get,
		id ? { id: id as Id<"invoices"> } : "skip"
	);
	const items = useQuery(
		api.invoiceLineItems.listByInvoice,
		id ? { invoiceId: id as Id<"invoices"> } : "skip"
	);
	// optionalUserQuery (same as invoices.get) — returns null, never throws.
	// undefined = Payment section loading; null = LOADED invoice-derived fallback.
	// NOT a screen-state driver — invoices.get owns the undefined/null branches.
	const withPayments = useQuery(
		api.invoices.getWithPayments,
		id ? { id: id as Id<"invoices"> } : "skip"
	);
	const clients = useQuery(api.clients.list, {});

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// PARENT STATE — loading: skeleton document, keep the detail header.
	if (invoice === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				{renderHeader()}
				<ScrollView contentContainerStyle={styles.scroll}>
					<View
						style={[
							styles.skeletonCard,
							{ backgroundColor: t.card, borderColor: t.line },
						]}
					/>
					<View
						style={[styles.skeletonRow, { backgroundColor: t.muted, marginTop: 14 }]}
					/>
					<View
						style={[styles.skeletonRow, { backgroundColor: t.muted, marginTop: 10 }]}
					/>
				</ScrollView>
			</SafeAreaView>
		);
	}

	// PARENT STATE — not found: clean state, no auto-bounce (no router.back()).
	if (invoice === null) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				{renderHeader()}
				<View style={styles.notFound}>
					<Text style={[styles.notFoundTitle, { color: t.ink }]}>Not found</Text>
					<Text style={[styles.notFoundBody, { color: t.sub }]}>
						This invoice may have been removed or belongs to another organization.
					</Text>
				</View>
			</SafeAreaView>
		);
	}

	// Effective status: a past-due sent invoice displays as Overdue to match the
	// list + hero (mirrors web invoices/page.tsx:307-309). Stored status alone
	// would show "Sent" on an already-overdue invoice.
	const displayStatus =
		invoice.status === "sent" && invoice.dueDate < now
			? "overdue"
			: invoice.status;

	const client = clientName.get(invoice.clientId) ?? "Client";

	// TOTALS — straight from invoice.* (calculated by get). Never sum line items.
	// Discount/Tax rows are conditional on the raw dollar figures (invoices store
	// no taxRate/enabled flags), so the Tax label has no percentage.
	const totalsRows: { label: string; value: string; negative?: boolean }[] = [
		{
			label: "Subtotal",
			value: formatCurrency(invoice.subtotal, { exact: true }),
		},
	];
	if (invoice.discountAmount) {
		totalsRows.push({
			label: "Discount",
			value: formatCurrency(invoice.discountAmount ?? 0, { exact: true }),
			negative: true,
		});
	}
	if (invoice.taxAmount) {
		totalsRows.push({
			label: "Tax",
			value: formatCurrency(invoice.taxAmount ?? 0, { exact: true }),
		});
	}

	// PAYMENT SECTION inputs — keyed off withPayments (NOT a screen-state driver).
	const payments = withPayments?.payments ?? [];
	const summary = withPayments?.paymentSummary;
	const hasRows = payments.length > 0;
	// PAID PREDICATE (pinned) — drives the no-rows summary copy + percent.
	const isPaid = invoice.status === "paid" || invoice.paidAt != null;
	// Align the summary "of $Y" to the loaded query total so it matches
	// paidAmount/remainingAmount; fall back to invoice.total before load.
	const summaryTotal = withPayments?.total ?? invoice.total;
	// Clamped progress percent (RevenueGauge idiom).
	const pct = hasRows
		? Math.min(Math.max(Math.round(summary?.percentPaid ?? 0), 0), 100)
		: isPaid
			? 100
			: 0;

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			{renderHeader(invoice.invoiceNumber)}
			<ScrollView contentContainerStyle={styles.scroll}>
				{/* Header block — number, effective status badge, client */}
				<Card>
					<View style={styles.headerRow}>
						<View style={styles.headerBody}>
							<Eyebrow>Invoice</Eyebrow>
							<Text style={[styles.invoiceNumber, { color: t.ink }]} numberOfLines={1}>
								{invoice.invoiceNumber}
							</Text>
							<Text style={[styles.client, { color: t.sub }]} numberOfLines={1}>
								{client}
							</Text>
						</View>
						<Badge status={displayStatus} />
					</View>
				</Card>

				{/* Line items — THREE STATES: undefined → skeleton, [] → empty, else map */}
				<View style={styles.section}>
					<Eyebrow>Line items</Eyebrow>
					<Card style={styles.itemsCard}>
						{items === undefined ? (
							<>
								{[0, 1, 2].map((i) => (
									<View
										key={i}
										style={[
											styles.itemRow,
											{
												borderBottomColor: t.line,
												borderBottomWidth: i === 2 ? 0 : 1,
											},
										]}
									>
										<View style={styles.itemBody}>
											<View
												style={[styles.skeleton, { width: "60%", height: 14 }]}
											/>
											<View
												style={[
													styles.skeleton,
													{ width: "35%", height: 12, marginTop: 6 },
												]}
											/>
										</View>
										<View style={[styles.skeleton, { width: 56, height: 14 }]} />
									</View>
								))}
							</>
						) : items.length === 0 ? (
							<Text style={[styles.emptyLine, { color: t.sub }]}>
								No itemized lines
							</Text>
						) : (
							items.map((item, i) => (
								<View
									key={item._id}
									style={[
										styles.itemRow,
										{
											borderBottomColor: t.line,
											borderBottomWidth: i === items.length - 1 ? 0 : 1,
										},
									]}
								>
									<View style={styles.itemBody}>
										<Text
											style={[styles.itemName, { color: t.ink }]}
											numberOfLines={2}
										>
											{item.description}
										</Text>
										<Text style={[styles.itemSub, { color: t.sub }]}>
											{item.quantity} ×{" "}
											{formatCurrency(item.unitPrice, { exact: true })}
										</Text>
									</View>
									<Text style={[styles.itemAmount, { color: t.ink }]}>
										{formatCurrency(item.total, { exact: true })}
									</Text>
								</View>
							))
						)}
					</Card>
				</View>

				{/* Totals — shared TotalsBlock, values from invoice.* (server-calculated) */}
				<View style={styles.section}>
					<Card>
						<TotalsBlock
							rows={totalsRows}
							total={{
								label: "Total",
								value: formatCurrency(invoice.total, { exact: true }),
							}}
						/>
					</Card>
				</View>

				{/* Payment — progress bar + paid-vs-outstanding summary + installments.
				    ALWAYS renders (read-only). Section loading keys off withPayments
				    === undefined; null falls back to the invoice-derived summary. */}
				<View style={styles.section}>
					<Eyebrow>Payment</Eyebrow>
					<Card>
						{/* Hand-built linear progress bar (two Views) with full a11y */}
						<View
							accessibilityRole="progressbar"
							accessibilityValue={{ now: pct, min: 0, max: 100 }}
							accessibilityLabel={`Payment progress, ${pct} percent paid`}
							style={[styles.barTrack, { backgroundColor: t.line }]}
						>
							<View
								style={[
									styles.barFill,
									{ backgroundColor: t.accent, width: `${pct}%` },
								]}
							/>
						</View>

						{/* Summary line — every amount through formatCurrency (dollars). */}
						{withPayments === undefined ? (
							<View style={[styles.barSkeleton, { backgroundColor: t.muted }]} />
						) : hasRows && summary ? (
							<Text style={[styles.summaryLine, { color: t.ink }]}>
								Paid {formatCurrency(summary.paidAmount, { exact: true })} of{" "}
								{formatCurrency(summaryTotal, { exact: true })}
								{summary.remainingAmount > 0
									? ` · ${formatCurrency(summary.remainingAmount, { exact: true })} outstanding`
									: ""}
							</Text>
						) : isPaid ? (
							<Text style={[styles.summaryLine, { color: t.ink }]}>
								Paid in full {formatCurrency(summaryTotal, { exact: true })}
								{invoice.paidAt
									? ` · ${formatDocumentDate(invoice.paidAt)}`
									: ""}
							</Text>
						) : (
							<Text style={[styles.summaryLine, { color: t.ink }]}>
								{formatCurrency(summaryTotal, { exact: true })} outstanding
							</Text>
						)}

						{/* Installment list — only for payment-plan invoices (hasRows). */}
						{withPayments !== undefined && hasRows
							? payments.map((payment, i) => (
									<View
										key={payment._id}
										style={[
											styles.payRow,
											{
												borderBottomColor: t.line,
												borderBottomWidth:
													i === payments.length - 1 ? 0 : 1,
											},
										]}
									>
										<View style={styles.payBody}>
											<Text
												style={[styles.payLabel, { color: t.ink }]}
												numberOfLines={1}
											>
												{payment.description ?? `Payment ${i + 1}`}
											</Text>
											<Text style={[styles.paySub, { color: t.faint }]}>
												Due {formatDocumentDate(payment.dueDate)}
											</Text>
										</View>
										<View style={styles.payRight}>
											<Text style={[styles.payAmount, { color: t.ink }]}>
												{formatCurrency(payment.paymentAmount, {
													exact: true,
												})}
											</Text>
											<Badge status={payment.status} />
										</View>
									</View>
								))
							: null}
					</Card>
				</View>

				{/* Metadata KV — Invoice # / Issued / Due / Paid (Paid only when present) */}
				<View style={styles.section}>
					<Eyebrow>Details</Eyebrow>
					<Card style={styles.metaCard}>
						<MetaRow label="Invoice #" value={invoice.invoiceNumber} />
						<MetaRow label="Issued" value={formatDocumentDate(invoice.issuedDate)} />
						<MetaRow label="Due" value={formatDocumentDate(invoice.dueDate)} />
						{invoice.paidAt ? (
							<MetaRow
								label="Paid"
								value={formatDocumentDate(invoice.paidAt)}
								last
							/>
						) : null}
					</Card>
				</View>

				<View style={{ height: 32 }} />
			</ScrollView>
		</SafeAreaView>
	);
}

// Thin route wrapper — iPhone-identical (renders the body in "root" mode).
export default function InvoiceDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	if (!id) return null;
	return <InvoiceDetailBody id={id} />;
}

function MetaRow({
	label,
	value,
	last,
}: {
	label: string;
	value: string;
	last?: boolean;
}) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.metaRow,
				{ borderBottomColor: t.line, borderBottomWidth: last ? 0 : 1 },
			]}
		>
			<Text style={[styles.metaLabel, { color: t.sub }]}>{label}</Text>
			<Text style={[styles.metaValue, { color: t.ink }]}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	scroll: { padding: 16, gap: 0 },

	skeletonCard: {
		height: 96,
		borderRadius: radii.rLg,
		borderWidth: 1,
	},
	skeletonRow: {
		height: 60,
		borderRadius: radii.r,
	},
	skeleton: {
		backgroundColor: "#e9edf2",
		borderRadius: 6,
	},

	notFound: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 8,
	},
	notFoundTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
	},
	notFoundBody: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		textAlign: "center",
	},

	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	headerBody: { flex: 1, minWidth: 0, gap: 3 },
	invoiceNumber: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
		letterSpacing: -0.3,
	},
	client: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},

	section: { marginTop: 22, gap: 10 },

	itemsCard: { paddingVertical: 6 },
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 4,
	},
	itemBody: { flex: 1, minWidth: 0, gap: 3 },
	itemName: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	itemSub: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	itemAmount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
	},
	emptyLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		paddingVertical: 14,
		paddingHorizontal: 4,
	},

	barTrack: {
		height: 6,
		borderRadius: 999,
		marginVertical: 8,
		width: "100%",
		overflow: "hidden",
	},
	barFill: {
		height: 6,
		borderRadius: 999,
	},
	barSkeleton: {
		height: 14,
		borderRadius: 6,
		width: "70%",
		marginTop: 2,
	},
	summaryLine: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
		marginTop: 2,
	},
	payRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 4,
		marginTop: 4,
	},
	payBody: { flex: 1, minWidth: 0, gap: 3 },
	payLabel: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	paySub: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	payRight: { alignItems: "flex-end", gap: 6 },
	payAmount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
	},

	metaCard: { paddingVertical: 6 },
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 4,
	},
	metaLabel: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	metaValue: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
	},
});
