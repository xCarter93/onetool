import { useEffect, useMemo, useState } from "react";
import {
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
	CalendarX2,
	Check,
	Link2,
	Plus,
	Share as ShareIcon,
} from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	badgeTone,
	fontFamily,
	radii,
	recordTint,
	type,
	useTokens,
} from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { InkTabHeader } from "@/components/ink-tab-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { Card, DotGrid, Eyebrow, TotalsBlock } from "@/components/ui";
import { DocumentHeaderCard } from "@/components/money/document-header-card";
import { QuickActionRow } from "@/components/money/quick-action-row";
import { SendPreviewSheet } from "@/components/money/send-preview-sheet";
import {
	RecordPaymentSheet,
	type ManualMethod,
} from "@/components/money/record-payment-sheet";
import {
	LineItemSheet,
	type LineItemDraft,
	type LineItemInitial,
} from "@/components/money/line-item-sheet";
import {
	resolveInvoiceActions,
	type InvoiceStatus,
	type RecordActionKey,
} from "@/lib/record-actions";
import { useInvoiceCapabilities } from "@/lib/use-record-capabilities";
import { usePermissions } from "@/lib/use-permissions";
import { deriveInvoiceDisplayPricing } from "@onetool/backend/pdf/invoicePricing";
import { formatCurrency, formatDocumentDate } from "@/lib/format";
import { recordRecentView } from "@/lib/recents";
import { useOrganization } from "@clerk/expo";

const METHOD_LABEL: Record<string, string> = {
	cash: "Cash",
	check: "Check",
	other: "Other",
};

// Invoice detail, restyled to frame 1i (Mobile 3.0 slice 2): document header
// card with the money numeral, the resolver-driven CTA pair IN the card, the
// pay-link row, and the payment section as a timeline. The screen went from
// read-only viewer to the field collection surface.
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
	const router = useRouter();
	// iPhone gets the 3.0 ink band (back circle + constant cluster). The iPad
	// pane paths are untouched: PaneHeader when the shell owns back, the light
	// pane header otherwise.
	const renderHeader = (title = "Invoice") =>
		headerMode === "pane" ? (
			onBack ? (
				<PaneHeader title={title} onBack={onBack} />
			) : (
				<AppHeader mode="pane" title={title} />
			)
		) : (
			<InkTabHeader title={title} onBack={() => router.back()} />
		);
	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());
	const [sendOpen, setSendOpen] = useState(false);
	const [recordOpen, setRecordOpen] = useState(false);
	// null = closed; item null = adding, item set = editing that row.
	const [itemSheet, setItemSheet] = useState<{
		item: LineItemInitial | null;
	} | null>(null);

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
	// Backend-served portal URL (one source of truth with the invite email).
	// Null when the client has no portal access; the resolver disables Share.
	const portalLink = useQuery(
		api.invoices.getPortalLink,
		invoice ? { id: invoice._id } : "skip"
	);
	const capsData = useInvoiceCapabilities(invoice);
	const { can } = usePermissions();
	// Web-parity staleness hint: the saved PDF is older than the content.
	// Gated useQuery throws on missing permission, so gate with can().
	const latestDoc = useQuery(
		api.documents.getLatest,
		invoice && can("documents", "view")
			? { documentType: "invoice" as const, documentId: id }
			: "skip"
	);

	const sendToClient = useMutation(api.invoices.sendToClient);
	const recordManualPayment = useMutation(api.payments.recordManualPayment);
	const createLineItem = useMutation(api.invoiceLineItems.create);
	const updateLineItem = useMutation(api.invoiceLineItems.update);
	const removeLineItem = useMutation(api.invoiceLineItems.remove);

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// On-device "Recently viewed" trail for the Work tab (Slice 6). Fire-and-
	// forget, and only once the doc has loaded so the snapshot is a real title.
	const { organization } = useOrganization();
	const orgId = organization?.id;
	const recentId = invoice?._id;
	const recentTitle = invoice?.invoiceNumber;
	const recentSub = invoice ? clientName.get(invoice.clientId) : undefined;
	useEffect(() => {
		if (!recentId || !recentTitle) return;
		recordRecentView(orgId, {
			kind: "invoice",
			id: recentId,
			title: recentTitle,
			sub: recentSub,
		});
	}, [orgId, recentId, recentTitle, recentSub]);

	// PARENT STATE — loading: skeleton document, keep the detail header.
	if (invoice === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<DotGrid style={StyleSheet.absoluteFill} />
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
				<DotGrid style={StyleSheet.absoluteFill} />
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
	// list + hero (mirrors web invoices/page.tsx). Stored status alone would
	// show "Sent" on an already-overdue invoice.
	const displayStatus = (
		invoice.status === "sent" && invoice.dueDate < now
			? "overdue"
			: invoice.status
	) as InvoiceStatus;

	const client = clientName.get(invoice.clientId) ?? "Client";
	const daysLate = Math.floor((now - invoice.dueDate) / 86_400_000);

	// TOTALS — straight from invoice.* (calculated by get). Never sum line items.
	// The legacy/quote pricing split and its cent rounding live in the shared
	// deriveInvoiceDisplayPricing, so this screen prints the same discount and
	// tax rows as the web record page, the portal paper and the PDF.
	const pricing = deriveInvoiceDisplayPricing(invoice);
	const totalsRows: { label: string; value: string; negative?: boolean }[] = [
		{
			label: "Subtotal",
			value: formatCurrency(invoice.subtotal, { exact: true }),
		},
	];
	if (pricing.showDiscount) {
		totalsRows.push({
			label: pricing.discountLabel,
			value: formatCurrency(pricing.discountDollars, { exact: true }),
			negative: true,
		});
	}
	if (pricing.showTax) {
		totalsRows.push({
			label: pricing.taxLabel,
			value: formatCurrency(pricing.taxDollars, { exact: true }),
		});
	}

	// PAYMENT SECTION inputs — keyed off withPayments (NOT a screen-state driver).
	const payments = withPayments?.payments ?? [];
	const summary = withPayments?.paymentSummary;
	const hasRows = payments.length > 0;
	const isPaid = invoice.status === "paid" || invoice.paidAt != null;
	const summaryTotal = withPayments?.total ?? invoice.total;
	const remaining = hasRows
		? (summary?.remainingAmount ?? 0)
		: isPaid
			? 0
			: summaryTotal;
	const pct = hasRows
		? Math.min(Math.max(Math.round(summary?.percentPaid ?? 0), 0), 100)
		: isPaid
			? 100
			: 0;

	// Status→CTA resolver output (undefined caps = still composing facts; the
	// action row simply doesn't render yet — never a flash of wrong buttons).
	const actions = capsData
		? resolveInvoiceActions(displayStatus, capsData.caps)
		: [];

	// Slice 4: invoice line items stay editable until money settles — mirrors
	// assertInvoiceContentEditable (paid/cancelled, or any settled/disputed
	// payment row, freezes the content surface). Deliberately looser than the
	// quote's draft-only rule: an invoice is a bill, not an offer under review.
	const hasSettledPayment = payments.some(
		(p) => p.status === "paid" || p.status === "refunded" || p.disputed === true
	);
	const contentEditable =
		(capsData?.caps.canModify ?? false) &&
		withPayments !== undefined &&
		invoice.status !== "paid" &&
		invoice.status !== "cancelled" &&
		!hasSettledPayment;
	// The one genuinely surprising lock: still sent/overdue, but a recorded
	// payment froze the rows — say so instead of leaving dead taps.
	const showSettledLockNote =
		hasSettledPayment &&
		(capsData?.caps.canModify ?? false) &&
		(invoice.status === "sent" || invoice.status === "overdue");
	const canDeleteItems = can("invoices", "delete");

	const toInitial = (item: {
		_id: string;
		description: string;
		quantity: number;
		unit?: string;
		unitPrice: number;
	}): LineItemInitial => ({
		id: item._id,
		description: item.description,
		quantity: item.quantity,
		unit: item.unit ?? "",
		rate: item.unitPrice,
	});

	const saveItem = async (draft: LineItemDraft) => {
		// Invoice rows name the fields differently (unitPrice/total, optional
		// unit) — map at this seam, same as the web controller's adapter.
		const unit = draft.unit.trim() ? draft.unit.trim() : undefined;
		if (itemSheet?.item) {
			await updateLineItem({
				id: itemSheet.item.id as Id<"invoiceLineItems">,
				description: draft.description,
				quantity: draft.quantity,
				unit,
				unitPrice: draft.rate,
			});
		} else {
			const nextSort =
				items && items.length > 0
					? Math.max(...items.map((i) => i.sortOrder)) + 1
					: 0;
			await createLineItem({
				invoiceId: invoice._id,
				description: draft.description,
				quantity: draft.quantity,
				unit,
				unitPrice: draft.rate,
				sortOrder: nextSort,
			});
		}
	};

	const deleteItem = async () => {
		if (!itemSheet?.item) return;
		await removeLineItem({ id: itemSheet.item.id as Id<"invoiceLineItems"> });
	};

	const sharePayLink = async () => {
		if (!portalLink) return;
		await Share.share({
			message: `Pay ${invoice.invoiceNumber} — ${formatCurrency(invoice.total, { exact: true })}: ${portalLink}`,
			url: portalLink,
		});
	};

	const onAction = (key: RecordActionKey) => {
		switch (key) {
			case "send_invoice":
			case "resend_invoice":
				setSendOpen(true);
				break;
			case "record_payment":
				// The sheet prefills the remaining balance, which is only knowable
				// once the payment rows arrive — opening early would seed the full
				// total and validate against it.
				if (withPayments === undefined) break;
				setRecordOpen(true);
				break;
			case "share_pay_link":
				void sharePayLink();
				break;
		}
	};

	const submitPayment = async (
		amount: number,
		method: ManualMethod,
		note?: string
	) => {
		return await recordManualPayment({
			invoiceId: invoice._id,
			amount,
			method,
			note,
		});
	};

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{renderHeader(invoice.invoiceNumber)}
			<ScrollView contentContainerStyle={styles.scroll}>
				{/* Document header — identity, money numeral, CTA pair, pay link. */}
				<DocumentHeaderCard
					eyebrow={invoice.invoiceNumber}
					eyebrowColor={recordTint.invoice.fg}
					clientName={client}
					status={displayStatus}
					amount={invoice.total}
					subline={
						displayStatus === "overdue" ? (
							<View style={styles.dueRow}>
								<CalendarX2 size={13} color={badgeTone.late.fg} />
								<Text style={[styles.dueLate, { color: badgeTone.late.fg }]}>
									Due {formatDocumentDate(invoice.dueDate)}
									{daysLate > 0
										? ` · ${daysLate} day${daysLate === 1 ? "" : "s"} late`
										: ""}
								</Text>
							</View>
						) : (
							<Text style={[styles.dueLine, { color: t.sub }]}>
								{isPaid && invoice.paidAt
									? `Paid ${formatDocumentDate(invoice.paidAt)}`
									: `Due ${formatDocumentDate(invoice.dueDate)}`}
							</Text>
						)
					}
				>
					{actions.length > 0 ? (
						<View style={styles.actionsWrap}>
							<QuickActionRow actions={actions} onAction={onAction} />
						</View>
					) : null}
					{portalLink &&
					(displayStatus === "sent" || displayStatus === "overdue") ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Share the portal payment link"
							onPress={() => void sharePayLink()}
							style={({ pressed }) => [
								styles.linkRow,
								{
									borderColor: t.line,
									backgroundColor: pressed ? t.secondary : "transparent",
								},
							]}
						>
							<Link2 size={14} color={t.faint} />
							<Text
								style={[styles.linkText, { color: t.sub }]}
								numberOfLines={1}
							>
								{portalLink.replace(/^https?:\/\//, "")}
							</Text>
							<ShareIcon size={14} color={t.frostedInk} />
						</Pressable>
					) : null}
				</DocumentHeaderCard>

				{/* Payment — progress + timeline of installment rows. */}
				<View style={styles.section}>
					<Eyebrow>Payment</Eyebrow>
					<Card>
						<View
							accessibilityRole="progressbar"
							accessibilityValue={{ now: pct, min: 0, max: 100 }}
							accessibilityLabel={`Payment progress, ${pct} percent paid`}
							style={[styles.barTrack, { backgroundColor: t.line }]}
						>
							<View
								style={[
									styles.barFill,
									{ backgroundColor: t.primarySolid, width: `${pct}%` },
								]}
							/>
						</View>

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

						{/* Installment timeline (frame 1i): green check = settled (with
						    method when recorded in the field), dashed hollow = still owed. */}
						{withPayments !== undefined && hasRows
							? payments.map((payment, i) => {
									const paid = payment.status === "paid";
									const last = i === payments.length - 1;
									return (
										<View key={payment._id} style={styles.timelineRow}>
											<View style={styles.timelineRail}>
												<View
													style={[
														styles.timelineNode,
														paid
															? { backgroundColor: t.success }
															: {
																	backgroundColor: t.card,
																	borderWidth: 2,
																	borderColor: t.line,
																	borderStyle: "dashed",
																},
													]}
												>
													{paid ? (
														<Check size={11} color="#fff" strokeWidth={3.2} />
													) : null}
												</View>
												{!last ? (
													<View
														style={[styles.timelineLine, { backgroundColor: t.line }]}
													/>
												) : null}
											</View>
											<View style={[styles.timelineBody, !last && styles.timelineGap]}>
												<View style={styles.timelineTop}>
													<Text
														style={[
															styles.payLabel,
															{ color: paid ? t.ink : t.sub },
														]}
														numberOfLines={1}
													>
														{payment.description ?? `Payment ${i + 1}`}
													</Text>
													<Text
														style={[
															styles.payAmount,
															{ color: paid ? t.ink : t.sub },
														]}
													>
														{formatCurrency(payment.paymentAmount, { exact: true })}
													</Text>
												</View>
												<Text style={[styles.paySub, { color: t.faint }]}>
													{paid
														? `Paid${payment.paidAt ? ` ${formatDocumentDate(payment.paidAt)}` : ""}${
																payment.manualMethod
																	? ` · ${METHOD_LABEL[payment.manualMethod]}`
																	: payment.recordedOutsidePortal
																		? " · Recorded manually"
																		: ""
															}`
														: `Due ${formatDocumentDate(payment.dueDate)}`}
												</Text>
											</View>
										</View>
									);
								})
							: null}
					</Card>
				</View>

				{/* Line items — THREE STATES: undefined → skeleton, [] → empty, else map */}
				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<Eyebrow>
							{items && items.length > 0
								? `Line items · ${items.length}`
								: "Line items"}
						</Eyebrow>
						{latestDoc &&
						invoice.contentUpdatedAt &&
						invoice.contentUpdatedAt > latestDoc.generatedAt ? (
							<Text style={[styles.staleHint, { color: t.faint }]}>
								PDF outdated
							</Text>
						) : null}
					</View>
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
												style={[
													styles.skeleton,
													{ width: "60%", height: 14, backgroundColor: t.muted },
												]}
											/>
											<View
												style={[
													styles.skeleton,
													{
														width: "35%",
														height: 12,
														marginTop: 6,
														backgroundColor: t.muted,
													},
												]}
											/>
										</View>
										<View
											style={[
												styles.skeleton,
												{ width: 56, height: 14, backgroundColor: t.muted },
											]}
										/>
									</View>
								))}
							</>
						) : items.length === 0 ? (
							<Text style={[styles.emptyLine, { color: t.sub }]}>
								No itemized lines
							</Text>
						) : (
							items.map((item, i) => (
								<Pressable
									key={item._id}
									accessibilityRole={contentEditable ? "button" : undefined}
									onPress={
										contentEditable
											? () => setItemSheet({ item: toInitial(item) })
											: undefined
									}
									style={({ pressed }) => [
										styles.itemRow,
										{
											borderBottomColor: t.line,
											borderBottomWidth: i === items.length - 1 ? 0 : 1,
										},
										pressed && contentEditable && styles.itemPressed,
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
								</Pressable>
							))
						)}
						{items !== undefined && contentEditable ? (
							<Pressable
								accessibilityRole="button"
								onPress={() => setItemSheet({ item: null })}
								style={({ pressed }) => [
									styles.addRow,
									{ borderTopColor: t.line },
									pressed && styles.itemPressed,
								]}
							>
								<Plus size={16} color={t.primarySolid} strokeWidth={2.5} />
								<Text style={[styles.addLabel, { color: t.primarySolid }]}>
									Add line item
								</Text>
							</Pressable>
						) : null}
					</Card>
					{showSettledLockNote ? (
						<Text style={[styles.lockNote, { color: t.faint }]}>
							Line items locked — a payment has been recorded.
						</Text>
					) : null}
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

			<SendPreviewSheet
				visible={sendOpen}
				onClose={() => setSendOpen(false)}
				kind="invoice"
				number={invoice.invoiceNumber}
				clientName={client}
				amount={invoice.total}
				recipientEmail={capsData?.recipientEmail ?? null}
				items={(items ?? []).map((item) => ({
					key: item._id,
					description: item.description,
					sub: `${item.quantity} × ${formatCurrency(item.unitPrice, { exact: true })}`,
					amount: formatCurrency(item.total, { exact: true }),
				}))}
				totalsRows={totalsRows}
				totalValue={formatCurrency(invoice.total, { exact: true })}
				resend={displayStatus !== "draft"}
				onSend={async () => {
					await sendToClient({ id: invoice._id });
				}}
			/>
			<RecordPaymentSheet
				visible={recordOpen}
				onClose={() => setRecordOpen(false)}
				invoiceNumber={invoice.invoiceNumber}
				remaining={remaining}
				onSubmit={submitPayment}
			/>
			<LineItemSheet
				visible={itemSheet !== null}
				onClose={() => setItemSheet(null)}
				initial={itemSheet?.item ?? null}
				unitRequired={false}
				canDelete={canDeleteItems}
				onSubmit={saveItem}
				onDelete={deleteItem}
			/>
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

	itemPressed: { opacity: 0.7 },
	sectionHeader: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
	},
	staleHint: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	addRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 13,
		borderTopWidth: 1,
	},
	addLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	lockNote: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		marginTop: 8,
		paddingHorizontal: 4,
	},

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
		borderRadius: radii.sm,
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

	dueRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 5,
	},
	dueLate: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	dueLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		marginTop: 5,
	},
	actionsWrap: {
		marginTop: 14,
	},
	linkRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.md,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginTop: 10,
	},
	linkText: {
		flex: 1,
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
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
		fontVariant: ["tabular-nums"],
	},
	emptyLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		paddingVertical: 14,
		paddingHorizontal: 4,
	},

	barTrack: {
		height: 6,
		borderRadius: radii.pill,
		marginVertical: 8,
		width: "100%",
		overflow: "hidden",
	},
	barFill: {
		height: 6,
		borderRadius: radii.pill,
	},
	barSkeleton: {
		height: 14,
		borderRadius: radii.sm,
		width: "70%",
		marginTop: 2,
	},
	summaryLine: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
		marginTop: 2,
		marginBottom: 6,
	},

	timelineRow: {
		flexDirection: "row",
		gap: 10,
		marginTop: 8,
	},
	timelineRail: {
		alignItems: "center",
		width: 20,
	},
	timelineNode: {
		width: 20,
		height: 20,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	timelineLine: {
		width: 1.5,
		flex: 1,
		marginTop: 2,
	},
	timelineBody: { flex: 1, minWidth: 0, gap: 2 },
	timelineGap: { paddingBottom: 12 },
	timelineTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	payLabel: {
		flexShrink: 1,
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
	paySub: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	payAmount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
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
