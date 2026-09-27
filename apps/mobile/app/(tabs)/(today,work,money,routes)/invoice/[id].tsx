import { useOfflinePartition } from "@/lib/offline/partition-context";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
	CalendarX2,
	Check,
	Link2,
	Plus,
	Send,
	Share as ShareIcon,
	Wallet,
} from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	daysLate,
	deriveInvoiceStatus,
} from "@onetool/backend/convex/lib/invoiceLateness";
import { useOrgToday } from "@/lib/use-org-today";
import { badgeTone, fontFamily, radii, type, useTokens } from "@/lib/theme";
import { PaneHeader } from "@/components/ipad/pane-header";
import { CanvasScroll, Panel, SectionLabel, Stepper, type StepperStep } from "@/components/canvas";
import { TotalsBlock } from "@/components/ui";
import { DocumentHeaderCard } from "@/components/money/document-header-card";
import { QuickActionRow, OverflowMenuButton } from "@/components/money/quick-action-row";
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
import { useShellNav } from "@/lib/shell-nav";
import { useInvoiceCapabilities } from "@/lib/use-record-capabilities";
import { usePermissions } from "@/lib/use-permissions";
import { deriveInvoiceDisplayPricing } from "@onetool/backend/pdf/invoicePricing";
import { formatCurrency, formatDocumentDate } from "@/lib/format";
import { recordRecentView } from "@/lib/recents";
import { useUser } from "@clerk/expo";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { useOnlineAction, useRequireOnline, useOpenOps, saveOffline } from "@/lib/offline/hooks";
import { pendingPaymentsForInvoice, remainingAfterPending } from "@/lib/offline/pending-payments";
import { useScreenChrome } from "@/lib/shell-chrome";

const METHOD_LABEL: Record<string, string> = {
	cash: "Cash",
	check: "Check",
	other: "Other",
};

// Invoice lifecycle stepper — captions come straight off the record; the
// shared Stepper prints "—" for an absent one. No "cancelled" node exists
// (done/current/todo only) — the status Badge carries that read instead.
function invoiceStepperSteps(
	invoice: { issuedDate: number; firstSentAt?: number; paidAt?: number },
	status: InvoiceStatus
): StepperStep[] {
	const issued = formatDocumentDate(invoice.issuedDate);
	const sent = invoice.firstSentAt ? formatDocumentDate(invoice.firstSentAt) : undefined;
	const paid = invoice.paidAt ? formatDocumentDate(invoice.paidAt) : undefined;

	switch (status) {
		case "draft":
			return [
				{ label: "Draft", caption: issued, state: "current" },
				{ label: "Sent", state: "todo" },
				{ label: "Paid", state: "todo" },
			];
		case "sent":
		case "overdue":
			return [
				{ label: "Draft", caption: issued, state: "done" },
				{ label: "Sent", caption: sent, state: "current" },
				{ label: "Paid", state: "todo" },
			];
		case "paid":
			return [
				{ label: "Draft", caption: issued, state: "done" },
				{ label: "Sent", caption: sent, state: "done" },
				{ label: "Paid", caption: paid, state: "done" },
			];
		case "cancelled":
			return [
				{ label: "Draft", caption: issued, state: "done" },
				{ label: "Sent", caption: sent, state: sent ? "done" : "todo" },
				{ label: "Paid", state: "todo" },
			];
	}
}

// Invoice detail, restyled to frame 1d's structure (stepper, line-item
// table, payments panel) with 2d's large total. Send goes through the
// portal (invoices.sendToClient); recording a payment always queues through
// the offline outbox.
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
	const shellNav = useShellNav();
	const orgToday = useOrgToday();
	const [sendOpen, setSendOpen] = useState(false);
	const [recordOpen, setRecordOpen] = useState(false);
	// null = closed; item null = adding, item set = editing that row.
	const [itemSheet, setItemSheet] = useState<{
		item: LineItemInitial | null;
	} | null>(null);

	const invoice = useCachedQuery(
		api.invoices.get,
		id ? { id: id as Id<"invoices"> } : "skip"
	);
	const items = useCachedQuery(
		api.invoiceLineItems.listByInvoice,
		id ? { invoiceId: id as Id<"invoices"> } : "skip"
	);
	// optionalUserQuery (same as invoices.get) — returns null, never throws.
	// undefined = Payments section loading; null = LOADED invoice-derived fallback.
	// NOT a screen-state driver — invoices.get owns the undefined/null branches.
	const withPayments = useCachedQuery(
		api.invoices.getWithPayments,
		id ? { id: id as Id<"invoices"> } : "skip"
	);
	const clients = useCachedQuery(api.clients.list, {});
	// Backend-served portal URL (one source of truth with the invite email).
	// Null when the client has no portal access; the resolver disables Share.
	const portalLink = useCachedQuery(
		api.invoices.getPortalLink,
		invoice ? { id: invoice._id } : "skip"
	);
	const capsData = useInvoiceCapabilities(invoice);
	const { can } = usePermissions();
	// Web-parity staleness hint: the saved PDF is older than the content.
	// Gated useQuery throws on missing permission, so gate with can().
	const latestDoc = useCachedQuery(
		api.documents.getLatest,
		invoice && can("documents", "view")
			? { documentType: "invoice" as const, documentId: id }
			: "skip"
	);
	const { online } = useOffline();
	const onlineAction = useOnlineAction();
	const requireOnline = useRequireOnline();
	// Payments queued on the outbox but not yet synced — chainKey is invoice:<id>
	// and only ever holds recordManualPayment ops.
	const pendingPayments = pendingPaymentsForInvoice(useOpenOps(`invoice:${id}`), id ?? "");

	const sendToClient = useMutation(api.invoices.sendToClient);
	const createLineItem = useMutation(api.invoiceLineItems.create);
	const updateLineItem = useMutation(api.invoiceLineItems.update);
	const removeLineItem = useMutation(api.invoiceLineItems.remove);

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// On-device "Recently viewed" trail for the Work tab. Fire-and-forget, and
	// only once the doc has loaded so the snapshot is a real title.
	const { user } = useUser();
	const collectorName = user?.fullName?.trim() || "you";
	const recentsScope = useOfflinePartition() ?? undefined;
	const recentId = invoice?._id;
	const recentTitle = invoice?.invoiceNumber;
	const recentSub = invoice ? clientName.get(invoice.clientId) : undefined;
	useEffect(() => {
		if (!recentId || !recentTitle) return;
		recordRecentView(recentsScope, {
			kind: "invoice",
			id: recentId,
			title: recentTitle,
			sub: recentSub,
		});
	}, [recentsScope, recentId, recentTitle, recentSub]);

	const displayStatus = invoice
		? (deriveInvoiceStatus(invoice, orgToday) as InvoiceStatus)
		: undefined;
	const actions =
		capsData && displayStatus ? resolveInvoiceActions(displayStatus, capsData.caps) : [];

	// Tray (phone only): Record payment primary, Resend secondary. Everything
	// else lives behind the "…" menu. Hooks must run every render, so this is
	// built before the loading/not-found guards below — it's plain data, not
	// another hook.
	const tray =
		headerMode === "root"
			? (() => {
					const built: {
						key: RecordActionKey;
						label: string;
						icon: typeof Send;
						onPress: () => void;
						disabledReason?: string;
					}[] = [];
					const recordAction = actions.find((a) => a.key === "record_payment");
					if (recordAction) {
						built.push({
							key: "record_payment",
							label: "Record payment",
							icon: Wallet,
							// Recording always queues through the offline outbox — never
							// connectivity-gated (Tier 4, PRD-mobile-offline §4.6).
							onPress: () => setRecordOpen(true),
							disabledReason:
								recordAction.disabledReason ??
								(withPayments === undefined ? "Loading payments…" : undefined),
						});
					}
					const resendAction = actions.find(
						(a) => a.key === "send_invoice" || a.key === "resend_invoice"
					);
					if (resendAction) {
						built.push({
							key: resendAction.key,
							label: resendAction.label,
							icon: Send,
							onPress: () => setSendOpen(true),
							disabledReason:
								resendAction.disabledReason ?? (!online ? "Needs a connection" : undefined),
						});
					}
					return built;
				})()
			: undefined;

	useScreenChrome(headerMode === "root" ? { tray: tray ?? [] } : null);

	// PARENT STATE — loading: skeleton document, keep the detail header.
	if (invoice === undefined) {
		return (
			<View style={[styles.flex, { backgroundColor: t.bg }]}>
				{headerMode === "pane" ? (
					onBack ? <PaneHeader onBack={onBack} /> : null
				) : null}
				<CanvasScroll>
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
				</CanvasScroll>
			</View>
		);
	}

	// PARENT STATE — not found: clean state, no auto-bounce (no router.back()).
	if (invoice === null) {
		return (
			<View style={[styles.flex, { backgroundColor: t.bg }]}>
				{headerMode === "pane" ? (
					onBack ? <PaneHeader onBack={onBack} /> : null
				) : null}
				<View style={styles.notFound}>
					<Text style={[styles.notFoundTitle, { color: t.ink }]}>Not found</Text>
					<Text style={[styles.notFoundBody, { color: t.sub }]}>
						This invoice may have been removed or belongs to another organization.
					</Text>
				</View>
			</View>
		);
	}

	const status = displayStatus as InvoiceStatus;
	const client = clientName.get(invoice.clientId) ?? "Client";
	const lateDays = daysLate(invoice.dueDate, orgToday);

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
	const serverRemaining = hasRows
		? (summary?.remainingAmount ?? 0)
		: isPaid
			? 0
			: summaryTotal;
	// Queued payments already took this cash; the sheet must prefill and cap against what's left.
	const remaining = remainingAfterPending(serverRemaining, pendingPayments);
	const pct = hasRows
		? Math.min(Math.max(Math.round(summary?.percentPaid ?? 0), 0), 100)
		: isPaid
			? 100
			: 0;

	// Overflow menu — every resolver action minus whatever the tray already
	// carries (record payment, send/resend).
	const trayKeys = new Set((tray ?? []).map((a) => a.key));
	const overflowActions = actions.filter((a) => !trayKeys.has(a.key));

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
		requireOnline("Editing line items");
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
		requireOnline("Editing line items");
		if (!itemSheet?.item) return;
		await removeLineItem({ id: itemSheet.item.id as Id<"invoiceLineItems"> });
	};

	// Line-item editing stays online-only (repricing risk) — gate the sheet's
	// open, not its save, so offline taps never reach the mutation.
	const openItem = (item: LineItemInitial | null) => {
		onlineAction("Editing line items", () => setItemSheet({ item }));
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
				onlineAction("Sending this invoice", () => setSendOpen(true));
				break;
			case "record_payment":
				// The sheet prefills the remaining balance, which is only knowable
				// once the payment rows arrive — opening early would seed the full
				// total and validate against it. Recording itself queues offline.
				if (withPayments === undefined) break;
				setRecordOpen(true);
				break;
			case "share_pay_link":
				void sharePayLink();
				break;
		}
	};

	// Tier 4 (PRD-mobile-offline): always queues through the outbox, online or
	// offline, and resolves once it's saved on device — never on the server's
	// reply, since a lost acknowledgement must never look like nothing happened.
	const submitPayment = async (
		amount: number,
		method: ManualMethod,
		note?: string
	) => {
		return await saveOffline(
			"payments.recordManualPayment",
			{ invoiceId: invoice._id, amount, method, note },
			{
				display: {
					title: `Payment ${formatCurrency(amount, { exact: true })} on ${invoice.invoiceNumber}`,
					detail: `${METHOD_LABEL[method]} · collected by ${collectorName}`,
				},
			}
		);
	};

	const openClient = () => {
		if (shellNav) {
			shellNav.open({ kind: "client", id: invoice.clientId });
		} else {
			router.push({
				pathname: "/clients/[clientId]",
				params: { clientId: invoice.clientId },
			} as unknown as Href);
		}
	};

	return (
		<View style={[styles.flex, { backgroundColor: t.bg }]}>
			{headerMode === "pane" ? (
				onBack ? <PaneHeader onBack={onBack} /> : null
			) : null}
			<CanvasScroll>
				{/* Header block — number/badge, the large total, title, client link. */}
				<DocumentHeaderCard
					eyebrow={invoice.invoiceNumber}
					status={status}
					clientName={client}
					onClientPress={openClient}
					amount={invoice.total}
					subline={
						status === "overdue" ? (
							<View style={styles.dueRow}>
								<CalendarX2 size={13} color={badgeTone.late.fg} />
								<Text style={[styles.dueLate, { color: badgeTone.late.fg }]}>
									Due {formatDocumentDate(invoice.dueDate)}
									{lateDays > 0
										? ` · ${lateDays} day${lateDays === 1 ? "" : "s"} late`
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
					{headerMode === "root" ? (
						overflowActions.length > 0 ? (
							<View style={styles.headerMenuRow}>
								<OverflowMenuButton actions={overflowActions} onAction={onAction} />
							</View>
						) : null
					) : actions.length > 0 ? (
						<View style={styles.actionsWrap}>
							<QuickActionRow actions={actions} onAction={onAction} />
						</View>
					) : null}
					{portalLink &&
					(status === "sent" || status === "overdue") ? (
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

				{/* Lifecycle stepper (frame 1d). */}
				<Panel>
					<View style={styles.stepperWrap}>
						<Stepper steps={invoiceStepperSteps(invoice, status)} />
					</View>
				</Panel>

				{/* Payments — progress + a Panel list of installment rows. */}
				<View style={styles.section}>
					<SectionLabel title="Payments" />
					<Panel>
						<View style={styles.paymentHead}>
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
						</View>

						{/* Installment timeline: green check = settled (with method when
						    recorded in the field), dashed hollow = still owed. */}
						{withPayments !== undefined && hasRows
							? payments.map((payment, i) => {
									const paid = payment.status === "paid";
									const last =
										i === payments.length - 1 && pendingPayments.length === 0;
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

						{/* Queued on the device, not yet synced — distinct from a settled
						    row: a faint hollow node (never the green check) and a status
						    caption instead of a paid date. */}
						{pendingPayments.map((pending, i) => {
							const last = i === pendingPayments.length - 1;
							const captionColor =
								pending.status === "conflict" || pending.status === "failed"
									? t.danger
									: pending.status === "auth_paused"
										? t.danger
										: t.sub;
							const captionText =
								pending.status === "conflict" || pending.status === "failed"
									? "Couldn't sync — needs review"
									: pending.status === "auth_paused"
										? "Sign in to sync"
										: "Not yet synced";
							return (
								<View key={pending.opId} style={styles.timelineRow}>
									<View style={styles.timelineRail}>
										<View
											style={[
												styles.timelineNode,
												{
													backgroundColor: t.card,
													borderWidth: 2,
													borderColor: captionColor,
													borderStyle: "dashed",
												},
											]}
										/>
										{!last ? (
											<View
												style={[styles.timelineLine, { backgroundColor: t.line }]}
											/>
										) : null}
									</View>
									<View style={[styles.timelineBody, !last && styles.timelineGap]}>
										<View style={styles.timelineTop}>
											<Text
												style={[styles.payLabel, { color: t.sub }]}
												numberOfLines={1}
											>
												{METHOD_LABEL[pending.method]} payment
											</Text>
											<Text style={[styles.payAmount, { color: t.sub }]}>
												{formatCurrency(pending.amount, { exact: true })}
											</Text>
										</View>
										<Text style={[styles.paySub, { color: captionColor }]}>
											{captionText}
										</Text>
									</View>
								</View>
							);
						})}
					</Panel>
				</View>

				{/* Line items — web table in a Panel: ITEM / QTY / AMOUNT head,
				    description sub-lines, right-aligned tabular amounts, totals foot. */}
				<View style={styles.section}>
					<SectionLabel
						title={items && items.length > 0 ? `Line items · ${items.length}` : "Line items"}
						right={
							latestDoc &&
							invoice.contentUpdatedAt &&
							invoice.contentUpdatedAt > latestDoc.generatedAt ? (
								<Text style={[styles.staleHint, { color: t.faint }]}>PDF outdated</Text>
							) : undefined
						}
					/>
					<Panel
						header={
							<View style={[styles.tableHead, { backgroundColor: t.secondary }]}>
								<Text style={[styles.thItem, { color: t.sub }]}>ITEM</Text>
								<Text style={[styles.thQty, { color: t.sub }]}>QTY</Text>
								<Text style={[styles.thAmt, { color: t.sub }]}>AMOUNT</Text>
							</View>
						}
					>
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
							<Text style={[styles.emptyLine, { color: t.sub }]}>
								No itemized lines
							</Text>
						) : (
							items.map((item) => (
								<Pressable
									key={item._id}
									accessibilityRole={contentEditable ? "button" : undefined}
									onPress={
										contentEditable
											? () => openItem(toInitial(item))
											: undefined
									}
									style={({ pressed }) => [
										styles.lineRow,
										pressed && contentEditable && styles.linePressed,
									]}
								>
									<View style={styles.lineItemCol}>
										<Text
											style={[styles.lineDesc, { color: t.ink }]}
											numberOfLines={2}
										>
											{item.description}
										</Text>
										<Text style={[styles.lineSub, { color: t.sub }]}>
											{item.unit ? `${item.unit} · ` : ""}
											{formatCurrency(item.unitPrice, { exact: true })}
										</Text>
									</View>
									<Text style={[styles.lineQty, { color: t.sub }]}>
										{item.quantity}
									</Text>
									<Text style={[styles.lineAmount, { color: t.ink }]}>
										{formatCurrency(item.total, { exact: true })}
									</Text>
								</Pressable>
							))
						)}
						{items !== undefined && contentEditable ? (
							<Pressable
								accessibilityRole="button"
								onPress={() => openItem(null)}
								style={({ pressed }) => [
									styles.addRow,
									pressed && styles.linePressed,
								]}
							>
								<Plus size={16} color={t.primarySolid} strokeWidth={2.5} />
								<Text style={[styles.addLabel, { color: t.primarySolid }]}>
									Add line item
								</Text>
							</Pressable>
						) : null}
						{/* Totals footer, on `muted`. */}
						<View style={[styles.totalsFooter, { backgroundColor: t.muted }]}>
							<TotalsBlock
								rows={totalsRows}
								total={{
									label: "Total",
									value: formatCurrency(invoice.total, { exact: true }),
								}}
							/>
						</View>
					</Panel>
					{showSettledLockNote ? (
						<Text style={[styles.lockNote, { color: t.faint }]}>
							Line items locked — a payment has been recorded.
						</Text>
					) : null}
				</View>

				{/* Metadata KV — Invoice # / Issued / Due / Paid (Paid only when present) */}
				<View style={styles.section}>
					<SectionLabel title="Details" />
					<Panel>
						<MetaRow label="Invoice #" value={invoice.invoiceNumber} />
						<MetaRow label="Issued" value={formatDocumentDate(invoice.issuedDate)} />
						<MetaRow label="Due" value={formatDocumentDate(invoice.dueDate)} />
						{invoice.paidAt ? (
							<MetaRow label="Paid" value={formatDocumentDate(invoice.paidAt)} />
						) : null}
					</Panel>
				</View>
			</CanvasScroll>

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
				resend={status !== "draft"}
				firstSend={invoice.status === "draft" && !invoice.firstSentAt}
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
		</View>
	);
}

// Thin route wrapper — iPhone-identical (renders the body in "root" mode).
export default function InvoiceDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	if (!id) return null;
	return <InvoiceDetailBody id={id} />;
}

function MetaRow({ label, value }: { label: string; value: string }) {
	const t = useTokens();
	return (
		<View style={styles.metaRow}>
			<Text style={[styles.metaLabel, { color: t.sub }]}>{label}</Text>
			<Text style={[styles.metaValue, { color: t.ink }]}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },

	actionsWrap: { marginTop: 14 },
	headerMenuRow: {
		position: "absolute",
		top: 18,
		right: 18,
	},

	section: { gap: 10 },
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

	stepperWrap: { padding: 16 },

	tableHead: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		paddingHorizontal: 14,
	},
	thItem: {
		flex: 1,
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	thQty: {
		width: 44,
		textAlign: "right",
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	thAmt: {
		width: 84,
		textAlign: "right",
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	lineRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
		paddingVertical: 12,
		paddingHorizontal: 14,
	},
	lineItemCol: { flex: 1, minWidth: 0, gap: 2 },
	lineDesc: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
	},
	lineSub: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	lineQty: {
		width: 44,
		textAlign: "right",
		fontFamily: fontFamily.medium,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},
	lineAmount: {
		width: 84,
		textAlign: "right",
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},
	emptyLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		paddingVertical: 18,
		paddingHorizontal: 14,
	},
	linePressed: { opacity: 0.7 },
	totalsFooter: { paddingHorizontal: 14, paddingVertical: 12 },
	lineSkeletonBlock: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
	lineSkeleton: { height: 40, borderRadius: radii.sm },

	paymentHead: { padding: 14, paddingBottom: 4, gap: 2 },
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
		paddingHorizontal: 14,
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

	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 14,
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
