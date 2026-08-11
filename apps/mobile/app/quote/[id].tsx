import { useMemo, useState } from "react";
import {
	Alert,
	Image,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { CheckCircle2, XCircle } from "lucide-react-native";
import { SvgUri } from "react-native-svg";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, recordTint, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { Card, DotGrid, Eyebrow, TotalsBlock } from "@/components/ui";
import { DocumentHeaderCard } from "@/components/money/document-header-card";
import { StatusTrack, type TrackStep } from "@/components/money/status-track";
import { QuickActionRow } from "@/components/money/quick-action-row";
import { SendPreviewSheet } from "@/components/money/send-preview-sheet";
import {
	resolveQuoteActions,
	type QuoteStatus,
	type RecordActionKey,
} from "@/lib/record-actions";
import { useQuoteCapabilities } from "@/lib/use-record-capabilities";
import { formatCurrency, formatDocumentDate } from "@/lib/format";

// Lifecycle track states per status (frame 1h). Declined/expired terminate
// the track at the third node instead of pretending the path continues.
function trackSteps(status: QuoteStatus, hasInvoice: boolean): TrackStep[] {
	switch (status) {
		case "draft":
			return [
				{ key: "draft", label: "Draft", state: "current" },
				{ key: "sent", label: "Sent", state: "upcoming" },
				{ key: "approved", label: "Approved", state: "upcoming" },
				{ key: "invoiced", label: "Invoiced", state: "upcoming" },
			];
		case "sent":
			return [
				{ key: "draft", label: "Draft", state: "done" },
				{ key: "sent", label: "Sent", state: "current" },
				{ key: "approved", label: "Approved", state: "upcoming" },
				{ key: "invoiced", label: "Invoiced", state: "upcoming" },
			];
		case "approved":
			return [
				{ key: "draft", label: "Draft", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "approved", label: "Approved", state: hasInvoice ? "done" : "current" },
				{
					key: "invoiced",
					label: "Invoiced",
					state: hasInvoice ? "done" : "upcoming",
				},
			];
		case "declined":
			return [
				{ key: "draft", label: "Draft", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "declined", label: "Declined", state: "failed" },
				{ key: "invoiced", label: "Invoiced", state: "upcoming" },
			];
		case "expired":
			return [
				{ key: "draft", label: "Draft", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "expired", label: "Expired", state: "failed" },
				{ key: "invoiced", label: "Invoiced", state: "upcoming" },
			];
	}
}

// Quote detail, restyled to frame 1h (Mobile 3.0 slice 2): document header
// card with the money numeral + lifecycle StatusTrack, and the resolver's CTA
// pair pinned as a floating bar. Send goes through the portal (new
// quotes.sendToClient); approve/decline are the manual flips; convert is
// one tap once approved.
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
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const appHeaderMode = headerMode === "pane" ? "pane" : "detail";
	const renderHeader = (title?: string) =>
		headerMode === "pane" && onBack ? (
			<PaneHeader title={title} onBack={onBack} />
		) : (
			<AppHeader mode={appHeaderMode} title={title} />
		);
	// Signed signature URLs can expire mid-session — fall back to a caption on load error.
	const [sigError, setSigError] = useState(false);
	const [sendOpen, setSendOpen] = useState(false);
	const [converting, setConverting] = useState(false);

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
	const capsData = useQuoteCapabilities(quote);

	const sendToClient = useMutation(api.quotes.sendToClient);
	const updateQuote = useMutation(api.quotes.update);
	const createFromQuote = useMutation(api.invoices.createFromQuote);

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// quote === undefined → loading skeleton.
	if (quote === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<DotGrid style={StyleSheet.absoluteFill} />
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
				<DotGrid style={StyleSheet.absoluteFill} />
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
	const documentTitle = quote.title || undefined;
	const client = clientName.get(quote.clientId) ?? "Client";
	const status = quote.status as QuoteStatus;

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

	// Show/hide gate — drafts and expired quotes render NOTHING here (the chip
	// and track carry those states), and a draft never flashes a skeleton while
	// audit is still loading. Audit branches below are ALSO gated on the current
	// status (portal-island convention): a quote re-sent after a decline keeps
	// its stale audit row, and must read as awaiting, not declined.
	const showApproval =
		(status === "sent" || resolvedStatus) &&
		!(
			!quote.sentAt &&
			(audit === undefined || (auditEmpty && !resolvedStatus))
		);

	const actions = capsData
		? resolveQuoteActions(status, capsData.caps)
		: [];
	// The CTA pair pins as a floating bar (frame 1h); give the scroll room.
	const hasBar = actions.some(
		(a) => a.slot === "primary" || a.slot === "secondary"
	);

	const setStatus = async (next: "sent" | "approved" | "declined") => {
		try {
			await updateQuote({ id: quote._id, status: next });
		} catch {
			Alert.alert("Couldn't update this quote", "Please try again.");
		}
	};

	const convert = async () => {
		if (converting) return;
		setConverting(true);
		try {
			const invoiceId = await createFromQuote({ quoteId: quote._id });
			router.push({
				pathname: "/invoice/[id]",
				params: { id: invoiceId },
			} as unknown as Href);
		} catch {
			Alert.alert("Couldn't create the invoice", "Please try again.");
		} finally {
			setConverting(false);
		}
	};

	const onAction = (key: RecordActionKey) => {
		switch (key) {
			case "send_quote":
			case "resend_quote":
				setSendOpen(true);
				break;
			case "mark_sent":
				Alert.alert(
					"Mark this quote as sent?",
					"Use this when the client already has it — no email goes out.",
					[
						{ text: "Cancel", style: "cancel" },
						{ text: "Mark as sent", onPress: () => void setStatus("sent") },
					]
				);
				break;
			case "mark_approved":
				Alert.alert(
					"Mark this quote approved?",
					"Use this when the client said yes outside the portal.",
					[
						{ text: "Cancel", style: "cancel" },
						{ text: "Mark approved", onPress: () => void setStatus("approved") },
					]
				);
				break;
			case "mark_declined":
				Alert.alert("Mark this quote declined?", undefined, [
					{ text: "Cancel", style: "cancel" },
					{
						text: "Mark declined",
						style: "destructive",
						onPress: () => void setStatus("declined"),
					},
				]);
				break;
			case "get_signature":
				router.push({
					pathname: "/sign-quote",
					params: { id: quote._id },
				} as unknown as Href);
				break;
			case "convert_to_invoice":
				void convert();
				break;
			case "view_invoice":
				if (capsData?.invoiceId) {
					router.push({
						pathname: "/invoice/[id]",
						params: { id: capsData.invoiceId },
					} as unknown as Href);
				}
				break;
		}
	};

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{renderHeader(headerTitle)}
			<ScrollView
				contentContainerStyle={[
					styles.scroll,
					hasBar && { paddingBottom: 96 + insets.bottom },
				]}
			>
				{/* Document header — identity, money numeral, lifecycle track. */}
				<DocumentHeaderCard
					eyebrow={quote.quoteNumber ?? undefined}
					eyebrowColor={recordTint.quote.fg}
					clientName={client}
					status={status}
					title={documentTitle}
					amount={quote.total}
					subline={
						quote.validUntil ? (
							<Text style={[styles.validLine, { color: t.sub }]}>
								Valid until {formatDocumentDate(quote.validUntil)}
							</Text>
						) : undefined
					}
				>
					<View style={styles.trackWrap}>
						<StatusTrack
							steps={trackSteps(status, capsData?.caps.hasInvoice ?? false)}
						/>
					</View>
				</DocumentHeaderCard>

				{/* Line items + totals — the document body. */}
				<View style={styles.section}>
					<Eyebrow>
						{items && items.length > 0
							? `Line items · ${items.length}`
							: "Line items"}
					</Eyebrow>
					<Card style={styles.docCard}>
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
					</Card>
				</View>

				{/* Approval — read-only lifecycle history below the document. */}
				{showApproval ? (
					<View style={styles.section}>
						<Eyebrow>Approval</Eyebrow>
						<Card style={styles.approvalCard}>
							{audit === undefined ? (
								// Loading (only reachable for a sent quote — drafts are hidden).
								<View
									style={[styles.approvalSkeleton, { backgroundColor: t.muted }]}
								/>
							) : latest?.action === "approved" && status === "approved" ? (
								// Approved (audit row): contact email + date + signature.
								<>
									<View style={styles.approvalRow}>
										<CheckCircle2 size={18} color={t.success} />
										<Text style={[styles.approvalLabel, { color: t.ink }]}>
											Approved
										</Text>
									</View>
									<Text style={[styles.approvalCaption, { color: t.sub }]}>
										{latest.channel === "in_person"
											? [
													latest.contactEmail || "Signed in person",
													formatDocumentDate(latest.createdAt),
													latest.capturedByName
														? `captured by ${latest.capturedByName}`
														: "in person",
												].join(" · ")
											: `${latest.contactEmail} · ${formatDocumentDate(latest.createdAt)}`}
									</Text>
									{latest.signatureUrl && !sigError ? (
										latest.channel === "in_person" ? (
											// In-person signatures are stored as SVG — RN's Image
											// can't decode SVG, SvgUri renders the vector directly.
											<View
												accessibilityLabel="Client signature"
												style={[
													styles.signature,
													styles.signatureSvg,
													{ borderColor: t.line, backgroundColor: t.card },
												]}
											>
												<SvgUri
													uri={latest.signatureUrl}
													width="100%"
													height="100%"
													onError={() => setSigError(true)}
												/>
											</View>
										) : (
											<Image
												source={{ uri: latest.signatureUrl }}
												accessibilityLabel="Client signature"
												accessibilityRole="image"
												resizeMode="contain"
												onError={() => setSigError(true)}
												style={[
													styles.signature,
													{ borderColor: t.line, backgroundColor: t.card },
												]}
											/>
										)
									) : latest.signatureUrl && sigError ? (
										<Text style={[styles.approvalCaption, { color: t.faint }]}>
											Signature unavailable
										</Text>
									) : null}
								</>
							) : latest?.action === "declined" && status === "declined" ? (
								// Declined (audit row): decline reason.
								<>
									<View style={styles.approvalRow}>
										<XCircle size={18} color={t.danger} />
										<Text style={[styles.approvalLabel, { color: t.danger }]}>
											Declined
										</Text>
									</View>
									<Text style={[styles.approvalCaption, { color: t.sub }]}>
										{formatDocumentDate(latest.createdAt)}
									</Text>
									{latest.declineReason ? (
										<Text style={[styles.approvalCaption, { color: t.sub }]}>
											“{latest.declineReason}”
										</Text>
									) : null}
								</>
							) : auditEmpty && quote.status === "approved" ? (
								// Approved (resolved-without-audit): status + approvedAt.
								<>
									<View style={styles.approvalRow}>
										<CheckCircle2 size={18} color={t.success} />
										<Text style={[styles.approvalLabel, { color: t.ink }]}>
											Approved
										</Text>
									</View>
									{quote.approvedAt ? (
										<Text style={[styles.approvalCaption, { color: t.sub }]}>
											{formatDocumentDate(quote.approvedAt)}
										</Text>
									) : null}
								</>
							) : auditEmpty && quote.status === "declined" ? (
								// Declined (resolved-without-audit): status + declinedAt.
								<>
									<View style={styles.approvalRow}>
										<XCircle size={18} color={t.danger} />
										<Text style={[styles.approvalLabel, { color: t.danger }]}>
											Declined
										</Text>
									</View>
									{quote.declinedAt ? (
										<Text style={[styles.approvalCaption, { color: t.sub }]}>
											{formatDocumentDate(quote.declinedAt)}
										</Text>
									) : null}
								</>
							) : status === "sent" && quote.sentAt ? (
								// Awaiting — sent (incl. re-sent after a decline; the stale
								// audit row is ignored once the status moved back to sent).
								<Text style={[styles.approvalLabel, { color: t.ink }]}>
									Awaiting client approval{" "}
									<Text style={[styles.approvalCaption, { color: t.faint }]}>
										· sent {formatDocumentDate(quote.sentAt)}
									</Text>
								</Text>
							) : null}
						</Card>
					</View>
				) : null}

				<View style={{ height: 32 }} />
			</ScrollView>

			{/* Floating CTA bar (frame 1h) — the resolver's primary/secondary pair. */}
			{hasBar ? (
				<View
					style={[
						styles.ctaBar,
						{ bottom: Math.max(insets.bottom, 14) + 4 },
					]}
					pointerEvents="box-none"
				>
					<QuickActionRow actions={actions} onAction={onAction} floating />
				</View>
			) : null}

			<SendPreviewSheet
				visible={sendOpen}
				onClose={() => setSendOpen(false)}
				kind="quote"
				number={quote.quoteNumber ?? undefined}
				title={documentTitle}
				clientName={client}
				amount={quote.total}
				recipientEmail={capsData?.recipientEmail ?? null}
				items={(items ?? []).map((item) => ({
					key: item._id,
					description: item.description,
					sub: `${item.quantity} × ${formatCurrency(item.rate, { exact: true })}`,
					amount: formatCurrency(item.amount, { exact: true }),
				}))}
				totalsRows={totalsRows}
				totalValue={formatCurrency(quote.total, { exact: true })}
				resend={status === "sent"}
				onSend={async () => {
					await sendToClient({ id: quote._id });
				}}
			/>
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

	validLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		marginTop: 5,
	},
	trackWrap: {
		marginTop: 16,
	},

	section: { marginTop: 22, gap: 10 },
	docCard: { padding: 0, overflow: "hidden" },

	divider: { height: 1, marginHorizontal: 18 },

	// Inset the totals to align with line-item content + give the card a bottom edge.
	totalsWrap: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 6 },

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
	lineAmount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},

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

	approvalCard: { gap: 8 },
	approvalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	approvalLabel: { fontFamily: fontFamily.bold, fontSize: type.h4 },
	approvalCaption: { fontFamily: fontFamily.regular, fontSize: type.sm },
	approvalSkeleton: { height: 14, borderRadius: radii.sm, width: "100%" },
	signature: {
		width: 160,
		height: 64,
		borderRadius: radii.md,
		borderWidth: 1,
	},
	signatureSvg: {
		overflow: "hidden",
		padding: 4,
	},

	ctaBar: {
		position: "absolute",
		left: 16,
		right: 16,
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
