import { useOfflinePartition } from "@/lib/offline/partition-context";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useMutation } from "convex/react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
	CheckCircle2,
	Eye,
	MessageSquare,
	Plus,
	Receipt,
	Send,
	XCircle,
} from "lucide-react-native";
import { SvgUri } from "react-native-svg";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { MentionModal } from "@/components/MentionModal";
import { PaneHeader } from "@/components/ipad/pane-header";
import { CanvasScroll, Panel, SectionLabel, Stepper, type StepperStep } from "@/components/canvas";
import { TotalsBlock } from "@/components/ui";
import { DocumentHeaderCard } from "@/components/money/document-header-card";
import { QuickActionRow, OverflowMenuButton } from "@/components/money/quick-action-row";
import { SendPreviewSheet } from "@/components/money/send-preview-sheet";
import {
	LineItemSheet,
	type LineItemDraft,
	type LineItemInitial,
} from "@/components/money/line-item-sheet";
import { ExtendValidUntilSheet } from "@/components/money/extend-valid-until-sheet";
import {
	resolveQuoteActions,
	type QuoteStatus,
	type RecordActionKey,
} from "@/lib/record-actions";
import { useShellNav } from "@/lib/shell-nav";
import { describeMutationError } from "@/lib/mutation-error";
import { useQuoteCapabilities } from "@/lib/use-record-capabilities";
import { usePermissions } from "@/lib/use-permissions";
import { formatCurrency, formatDocumentDate } from "@/lib/format";
import { recordRecentView } from "@/lib/recents";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { useOnlineAction, useRequireOnline, useOpenOps } from "@/lib/offline/hooks";
import { canSignOffline } from "@/lib/offline/quote-signing";
import { useScreenChrome } from "@/lib/shell-chrome";

// "Viewed · 2h ago" — hours-level detail the day-granularity formatRelativeDay
// doesn't carry. Local to this screen; the signature card is the only caller.
function hoursAgoLabel(ts: number, now: number): string {
	const minutes = Math.max(0, Math.round((now - ts) / 60000));
	if (minutes < 60) return minutes <= 1 ? "Viewed just now" : `Viewed · ${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `Viewed · ${hours}h ago`;
	const days = Math.round(hours / 24);
	return `Viewed · ${days}d ago`;
}

// Lifecycle stepper steps — captions come straight off the record (the
// Stepper itself prints "—" for an absent caption). No "declined"/"expired"
// node exists in the shared Stepper (done/current/todo only); the status
// Badge on the header card carries that read instead.
function quoteStepperSteps(
	quote: { _creationTime: number; sentAt?: number; firstSentAt?: number; approvedAt?: number },
	status: QuoteStatus,
	hasInvoice: boolean
): StepperStep[] {
	const draft = formatDocumentDate(quote._creationTime);
	const sentAt = quote.sentAt ?? quote.firstSentAt;
	const sent = sentAt ? formatDocumentDate(sentAt) : undefined;
	const approved = quote.approvedAt ? formatDocumentDate(quote.approvedAt) : undefined;

	switch (status) {
		case "draft":
			return [
				{ label: "Draft", caption: draft, state: "current" },
				{ label: "Sent", state: "todo" },
				{ label: "Approved", state: "todo" },
				{ label: "Invoiced", state: "todo" },
			];
		case "sent":
			return [
				{ label: "Draft", caption: draft, state: "done" },
				{ label: "Sent", caption: sent, state: "current" },
				{ label: "Approved", state: "todo" },
				{ label: "Invoiced", state: "todo" },
			];
		case "approved":
			return [
				{ label: "Draft", caption: draft, state: "done" },
				{ label: "Sent", caption: sent, state: "done" },
				{ label: "Approved", caption: approved, state: hasInvoice ? "done" : "current" },
				{ label: "Invoiced", state: hasInvoice ? "done" : "todo" },
			];
		case "declined":
		case "expired":
			return [
				{ label: "Draft", caption: draft, state: "done" },
				{ label: "Sent", caption: sent, state: "done" },
				{ label: "Approved", state: "todo" },
				{ label: "Invoiced", state: "todo" },
			];
	}
}

// Quote detail, restyled to frame 1d's structure (stepper, signature card,
// line-item table) with 2d's large total. Send goes through the portal (new
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
	// iPad pane: cross-links to the invoice/client swap the pane selection instead
	// of pushing a full-screen page over the shell. iPhone: null → router.push.
	const shellNav = useShellNav();
	// Signed signature URLs can expire mid-session — fall back to a caption on
	// load error. Keyed by the URL that failed so a refreshed one renders again
	// instead of staying stuck on the caption for the rest of the mount.
	const [sigErrorUrl, setSigErrorUrl] = useState<string | null>(null);
	const [sendOpen, setSendOpen] = useState(false);
	const [converting, setConverting] = useState(false);
	// null = closed; item null = adding, item set = editing that row.
	const [itemSheet, setItemSheet] = useState<{
		item: LineItemInitial | null;
	} | null>(null);
	const [extendOpen, setExtendOpen] = useState(false);
	const [mentionVisible, setMentionVisible] = useState(false);
	const [now] = useState(() => Date.now());

	const quote = useCachedQuery(
		api.quotes.get,
		id ? { id: id as Id<"quotes"> } : "skip"
	);
	const items = useCachedQuery(
		api.quoteLineItems.listByQuote,
		id ? { quoteId: id as Id<"quotes"> } : "skip"
	);
	const clients = useCachedQuery(api.clients.list, {});
	// getApprovalAudit is a userQuery that THROWS on missing/forbidden — the "skip"
	// guard is the only gate; the app-level error boundary handles the throw path.
	// audit drives ONLY the Signature block; quotes.get stays the sole screen driver.
	const audit = useCachedQuery(
		api.quotes.getApprovalAudit,
		id ? { quoteId: id as Id<"quotes"> } : "skip"
	);
	const capsData = useQuoteCapabilities(quote);
	const { can } = usePermissions();
	// Web-parity staleness hint: the saved PDF is older than the content.
	// Gated useQuery throws on missing permission, so gate with can().
	const latestDoc = useCachedQuery(
		api.documents.getLatest,
		quote && can("documents", "view")
			? { documentType: "quote" as const, documentId: id }
			: "skip"
	);
	// BoldSign viewedAt for the "Viewed · Xh ago" line — same query web's quote
	// page already reads (quote-detail-tabs' Signatures tab). Read-only reuse of
	// data the backend already exposes, no new backend surface.
	const signatureDocs = useCachedQuery(
		api.documents.getAllDocumentsWithSignatures,
		quote && can("documents", "view")
			? { documentType: "quote" as const, documentId: id }
			: "skip"
	);
	const { online } = useOffline();
	const onlineAction = useOnlineAction();
	const requireOnline = useRequireOnline();
	const pendingSignatureOp = useOpenOps(`quote:${id}`).find(
		(op) => op.operation === "quotes.approveInPerson",
	);

	const sendToClient = useMutation(api.quotes.sendToClient);
	const updateQuote = useMutation(api.quotes.update);
	const createFromQuote = useMutation(api.invoices.createFromQuote);
	const createLineItem = useMutation(api.quoteLineItems.create);
	const updateLineItem = useMutation(api.quoteLineItems.update);
	const removeLineItem = useMutation(api.quoteLineItems.remove);
	const extendValidUntil = useMutation(api.quotes.extendValidUntil);

	const clientName = useMemo(() => {
		const map = new Map<string, string>();
		clients?.forEach((c) => map.set(c._id, c.companyName));
		return map;
	}, [clients]);

	// On-device "Recently viewed" trail for the Work tab. Fire-and-forget, and
	// only once the doc has loaded so the snapshot is a real title.
	const recentsScope = useOfflinePartition() ?? undefined;
	const recentId = quote?._id;
	const recentTitle =
		quote?.title?.trim() || quote?.quoteNumber?.trim() || "Quote";
	const recentSub = quote ? clientName.get(quote.clientId) : undefined;
	useEffect(() => {
		if (!recentId) return;
		recordRecentView(recentsScope, {
			kind: "quote",
			id: recentId,
			title: recentTitle,
			sub: recentSub,
		});
	}, [recentsScope, recentId, recentTitle, recentSub]);

	const status = quote ? (quote.status as QuoteStatus) : undefined;
	const actions = capsData && status ? resolveQuoteActions(status, capsData.caps) : [];

	// Online-only (repricing/portal-email risk) — same as convert below.
	const convert = async () => {
		if (!quote || converting) return;
		setConverting(true);
		try {
			const invoiceId = await createFromQuote({ quoteId: quote._id });
			if (shellNav) {
				shellNav.open({ kind: "invoice", id: invoiceId });
			} else {
				router.push({
					pathname: "/invoice/[id]",
					params: { id: invoiceId },
				} as unknown as Href);
			}
		} catch {
			Alert.alert("Couldn't create the invoice", "Please try again.");
		} finally {
			setConverting(false);
		}
	};

	// Tray (phone only): Send/Resend primary, Convert (or View invoice once one
	// exists) secondary. Everything else lives behind the "…" menu. Hooks must
	// run every render, so this is built before the loading/not-found guards
	// below — it's just plain data, not another hook.
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
					const sendAction = actions.find(
						(a) => a.key === "send_quote" || a.key === "resend_quote"
					);
					if (sendAction) {
						built.push({
							key: sendAction.key,
							label: sendAction.label,
							icon: Send,
							onPress: () => setSendOpen(true),
							disabledReason:
								sendAction.disabledReason ?? (!online ? "Needs a connection" : undefined),
						});
					}
					const convertAction = actions.find(
						(a) => a.key === "convert_to_invoice" || a.key === "view_invoice"
					);
					if (convertAction) {
						const isView = convertAction.key === "view_invoice";
						built.push({
							key: convertAction.key,
							label: isView ? "View invoice" : "Convert",
							icon: Receipt,
							onPress: isView
								? () => {
										if (!capsData?.invoiceId) return;
										if (shellNav) {
											shellNav.open({ kind: "invoice", id: capsData.invoiceId });
										} else {
											router.push({
												pathname: "/invoice/[id]",
												params: { id: capsData.invoiceId },
											} as unknown as Href);
										}
									}
								: () => void convert(),
							disabledReason:
								convertAction.disabledReason ??
								(!isView && !online ? "Needs a connection" : undefined),
						});
					}
					return built;
				})()
			: undefined;

	useScreenChrome(headerMode === "root" ? { tray: tray ?? [] } : null);

	// quote === undefined → loading skeleton.
	if (quote === undefined) {
		return (
			<View style={[styles.flex, { backgroundColor: t.bg }]}>
				{headerMode === "pane" ? (
					onBack ? <PaneHeader onBack={onBack} /> : null
				) : null}
				<CanvasScroll>
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
				</CanvasScroll>
			</View>
		);
	}

	// quote === null → clean Not found (no auto-bounce).
	if (quote === null) {
		return (
			<View style={[styles.flex, { backgroundColor: t.bg }]}>
				{headerMode === "pane" ? (
					onBack ? <PaneHeader onBack={onBack} /> : null
				) : null}
				<View style={styles.notFound}>
					<Text style={[styles.notFoundTitle, { color: t.ink }]}>
						Not found
					</Text>
					<Text style={[styles.notFoundBody, { color: t.sub }]}>
						This quote may have been removed or belongs to another
						organization.
					</Text>
				</View>
			</View>
		);
	}

	const documentTitle = quote.title || undefined;
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

	// Show/hide gate — drafts and expired quotes render NOTHING here (the badge
	// and stepper carry those states), and a draft never flashes a skeleton while
	// audit is still loading. Audit branches below are ALSO gated on the current
	// status (portal-island convention): a quote re-sent after a decline keeps
	// its stale audit row, and must read as awaiting, not declined.
	const showSignature =
		(status === "sent" || resolvedStatus) &&
		!(
			!quote.sentAt &&
			(audit === undefined || (auditEmpty && !resolvedStatus))
		);
	const awaitingSignature =
		status === "sent" && !latest && !(auditEmpty && resolvedStatus);
	// Most recent document that actually carries a BoldSign envelope — viewedAt
	// only means something for the still-outstanding one.
	const latestSignatureDoc = (signatureDocs ?? [])
		.filter((d) => d.boldsign?.viewedAt)
		.sort((a, b) => b.generatedAt - a.generatedAt)[0];
	const viewedLabel =
		awaitingSignature && latestSignatureDoc?.boldsign.viewedAt
			? hoursAgoLabel(latestSignatureDoc.boldsign.viewedAt, now)
			: null;

	// Overflow menu — every resolver action minus whatever the tray already
	// carries (send/resend, convert/view invoice).
	const trayKeys = new Set((tray ?? []).map((a) => a.key));
	const overflowActions = actions.filter((a) => !trayKeys.has(a.key));

	// Slice 4: quote content is draft-only editable. Sent quotes funnel the
	// edit intent through a revert-to-draft confirm; everything else reads as
	// today's read-only document.
	const canModify = capsData?.caps.canModify ?? false;
	const contentEditable = status === "draft" && canModify;
	const canFunnelEdit = status === "sent" && canModify;
	const canDeleteItems = can("quotes", "delete");
	const pdfStale =
		!!latestDoc &&
		!!quote.contentUpdatedAt &&
		quote.contentUpdatedAt > latestDoc.generatedAt;

	const toInitial = (item: {
		_id: string;
		description: string;
		quantity: number;
		unit: string;
		rate: number;
	}): LineItemInitial => ({
		id: item._id,
		description: item.description,
		quantity: item.quantity,
		unit: item.unit,
		rate: item.rate,
	});

	// Line-item editing stays online-only (repricing risk) — gate the open,
	// not the save, so offline taps never reach a mutation.
	const openItem = (item: LineItemInitial | null) => {
		onlineAction("Editing line items", () => {
			if (contentEditable) {
				setItemSheet({ item });
				return;
			}
			if (canFunnelEdit) {
				Alert.alert(
					"Move to draft to edit?",
					"The client's link will stop working until you resend.",
					[
						{ text: "Cancel", style: "cancel" },
						{
							text: "Move to draft",
							onPress: async () => {
								try {
									await updateQuote({ id: quote._id, status: "draft" });
									setItemSheet({ item });
								} catch {
									Alert.alert("Couldn't update this quote", "Please try again.");
								}
							},
						},
					]
				);
			}
		});
	};

	const saveItem = async (draft: LineItemDraft) => {
		requireOnline("Editing line items");
		if (itemSheet?.item) {
			await updateLineItem({
				id: itemSheet.item.id as Id<"quoteLineItems">,
				description: draft.description,
				quantity: draft.quantity,
				unit: draft.unit,
				rate: draft.rate,
			});
		} else {
			const nextSort =
				items && items.length > 0
					? Math.max(...items.map((i) => i.sortOrder)) + 1
					: 0;
			await createLineItem({
				quoteId: quote._id,
				description: draft.description,
				quantity: draft.quantity,
				unit: draft.unit,
				rate: draft.rate,
				sortOrder: nextSort,
			});
		}
	};

	const deleteItem = async () => {
		requireOnline("Editing line items");
		if (!itemSheet?.item) return;
		await removeLineItem({ id: itemSheet.item.id as Id<"quoteLineItems"> });
	};

	const setStatus = async (next: "draft" | "sent" | "approved" | "declined") => {
		try {
			await updateQuote({ id: quote._id, status: next });
		} catch (err) {
			// Draft→sent flips debit the clientSends meter and can refuse —
			// surface the real message instead of a generic retry prompt.
			Alert.alert(
				"Couldn't update this quote",
				describeMutationError(err, "Please try again.").message
			);
		}
	};

	const onAction = (key: RecordActionKey) => {
		switch (key) {
			case "send_quote":
			case "resend_quote":
				onlineAction("Sending this quote", () => setSendOpen(true));
				break;
			case "mark_sent":
				onlineAction("Marking this quote as sent", () =>
					Alert.alert(
						"Mark this quote as sent?",
						"Use this when the client already has it — no email goes out.",
						[
							{ text: "Cancel", style: "cancel" },
							{ text: "Mark as sent", onPress: () => void setStatus("sent") },
						]
					)
				);
				break;
			case "mark_approved":
				onlineAction("Marking this quote approved", () =>
					Alert.alert(
						"Mark this quote approved?",
						"Use this when the client said yes outside the portal.",
						[
							{ text: "Cancel", style: "cancel" },
							{ text: "Mark approved", onPress: () => void setStatus("approved") },
						]
					)
				);
				break;
			case "mark_declined":
				onlineAction("Marking this quote declined", () =>
					Alert.alert("Mark this quote declined?", undefined, [
						{ text: "Cancel", style: "cancel" },
						{
							text: "Mark declined",
							style: "destructive",
							onPress: () => void setStatus("declined"),
						},
					])
				);
				break;
			case "get_signature":
				// Otherwise online-only: preparing a quote for signing (ensureQuotePdf)
				// is an online step unless a current, server-snapshotted document is
				// already cached.
				if (!online && !canSignOffline(quote, latestDoc ?? null)) {
					Alert.alert(
						"Connect to prepare this quote for signing",
						"This quote needs an online refresh before a signature can be captured offline."
					);
					break;
				}
				router.push({
					pathname: "/sign-quote",
					params: { id: quote._id },
				} as unknown as Href);
				break;
			case "convert_to_invoice":
				onlineAction("Converting this quote to an invoice", () => void convert());
				break;
			case "extend_valid_until":
				onlineAction("Extending the valid-until date", () => setExtendOpen(true));
				break;
			case "revert_to_draft":
				onlineAction("Reverting to draft", () =>
					Alert.alert(
						"Revert to draft?",
						"The client's link will stop working until you resend.",
						[
							{ text: "Cancel", style: "cancel" },
							{
								text: "Revert to draft",
								onPress: () => void setStatus("draft"),
							},
						]
					)
				);
				break;
			case "view_invoice":
				if (capsData?.invoiceId) {
					if (shellNav) {
						shellNav.open({ kind: "invoice", id: capsData.invoiceId });
					} else {
						router.push({
							pathname: "/invoice/[id]",
							params: { id: capsData.invoiceId },
						} as unknown as Href);
					}
				}
				break;
		}
	};

	const openClient = () => {
		if (shellNav) {
			shellNav.open({ kind: "client", id: quote.clientId });
		} else {
			router.push({
				pathname: "/clients/[clientId]",
				params: { clientId: quote.clientId },
			} as unknown as Href);
		}
	};

	const canGetSignature = actions.some((a) => a.key === "get_signature");

	return (
		<View style={[styles.flex, { backgroundColor: t.bg }]}>
			{headerMode === "pane" ? (
				onBack ? <PaneHeader onBack={onBack} /> : null
			) : null}
			<CanvasScroll>
				{/* Header block — number/badge, the large total, title, client link. */}
				<DocumentHeaderCard
					eyebrow={quote.quoteNumber ?? undefined}
					status={status ?? quote.status}
					clientName={client}
					onClientPress={openClient}
					title={documentTitle}
					amount={quote.total}
					subline={
						quote.validUntil ? (
							<Text style={[styles.validLine, { color: t.sub }]}>
								Valid until {formatDocumentDate(quote.validUntil)}
							</Text>
						) : undefined
					}
					menu={
						headerMode === "root" ? (
							<OverflowMenuButton actions={overflowActions} onAction={onAction} />
						) : undefined
					}
				>
					{headerMode === "root" ? null : (
						<View style={styles.actionsWrap}>
							<QuickActionRow actions={actions} onAction={onAction} />
						</View>
					)}
				</DocumentHeaderCard>

				{/* Team chat — same slot as client/project detail. */}
				<Pressable
					onPress={() => setMentionVisible(true)}
					accessibilityRole="button"
					accessibilityLabel="Open team chat"
					style={({ pressed }) => [
						styles.teamChat,
						{ backgroundColor: t.frostedBg, borderColor: t.frostedBorder },
						pressed && styles.linePressed,
					]}
				>
					<MessageSquare size={18} color={t.frostedInk} />
					<Text style={[styles.teamChatText, { color: t.frostedInk }]}>
						Team chat
					</Text>
				</Pressable>

				{/* Lifecycle stepper (frame 1d). */}
				<Panel>
					<View style={styles.stepperWrap}>
						<Stepper
							steps={quoteStepperSteps(quote, status ?? "draft", capsData?.caps.hasInvoice ?? false)}
						/>
					</View>
				</Panel>

				{/* Signature — read-only lifecycle below the stepper. */}
				{showSignature ? (
					<View style={styles.section}>
						<SectionLabel title="Signature" />
						<Panel>
							<Pressable
								onPress={
									awaitingSignature && canGetSignature
										? () => onAction("get_signature")
										: undefined
								}
								disabled={!(awaitingSignature && canGetSignature)}
								accessibilityRole={
									awaitingSignature && canGetSignature ? "button" : undefined
								}
								style={styles.signatureRow}
							>
								{pendingSignatureOp ? (
									// Captured offline: the server hasn't seen it yet, so the
									// quote's own status stays "sent" until the drainer syncs it.
									<Text
										style={[
											styles.approvalLabel,
											{
												color:
													pendingSignatureOp.status === "conflict" ||
													pendingSignatureOp.status === "failed" ||
													pendingSignatureOp.status === "auth_paused"
														? t.danger
														: t.sub,
											},
										]}
									>
										{pendingSignatureOp.status === "conflict" ||
										pendingSignatureOp.status === "failed"
											? "Signature couldn't sync — needs review"
											: pendingSignatureOp.status === "auth_paused"
												? "Sign in to sync this signature"
												: "Signature saved, waiting to sync"}
									</Text>
								) : audit === undefined ? (
									// Loading (only reachable for a sent quote).
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
										{latest.signatureUrl && sigErrorUrl !== latest.signatureUrl ? (
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
														onError={() => setSigErrorUrl(latest.signatureUrl)}
													/>
												</View>
											) : (
												<Image
													source={{ uri: latest.signatureUrl }}
													accessibilityLabel="Client signature"
													accessibilityRole="image"
													contentFit="contain"
													cachePolicy="disk"
													onError={() => setSigErrorUrl(latest.signatureUrl)}
													style={[
														styles.signature,
														{ borderColor: t.line, backgroundColor: t.card },
													]}
												/>
											)
										) : latest.signatureUrl ? (
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
								) : awaitingSignature ? (
									// Awaiting signature (frame 1d): the specific card the brief
									// calls out — plus "Viewed · Xh ago" when the data has it.
									<>
										<Text style={[styles.approvalLabel, { color: t.ink }]}>
											Awaiting signature
										</Text>
										{viewedLabel ? (
											<View style={styles.viewedRow}>
												<Eye size={13} color={t.faint} />
												<Text style={[styles.approvalCaption, { color: t.faint }]}>
													{viewedLabel}
												</Text>
											</View>
										) : null}
									</>
								) : null}
							</Pressable>
						</Panel>
					</View>
				) : null}

				{/* Line items — web table in a Panel: ITEM / QTY / AMOUNT head,
				    description sub-lines, right-aligned tabular amounts, totals foot. */}
				<View style={styles.section}>
					<SectionLabel
						title={items && items.length > 0 ? `Line items · ${items.length}` : "Line items"}
						right={
							pdfStale ? (
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
							<Text style={[styles.noLines, { color: t.faint }]}>
								No itemized lines
							</Text>
						) : (
							items.map((item) => (
								<Pressable
									key={item._id}
									accessibilityRole={
										contentEditable || canFunnelEdit ? "button" : undefined
									}
									onPress={
										contentEditable || canFunnelEdit
											? () => openItem(toInitial(item))
											: undefined
									}
									style={({ pressed }) => [
										styles.lineRow,
										pressed && (contentEditable || canFunnelEdit) && styles.linePressed,
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
											{formatCurrency(item.rate, { exact: true })}
										</Text>
									</View>
									<Text style={[styles.lineQty, { color: t.sub }]}>
										{item.quantity}
									</Text>
									<Text style={[styles.lineAmount, { color: t.ink }]}>
										{formatCurrency(item.amount, { exact: true })}
									</Text>
								</Pressable>
							))
						)}
						{items !== undefined && (contentEditable || canFunnelEdit) ? (
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
									value: formatCurrency(quote.total, { exact: true }),
								}}
							/>
						</View>
					</Panel>
				</View>
			</CanvasScroll>

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
				firstSend={!quote.firstSentAt && !quote.sentAt}
				onSend={async () => {
					await sendToClient({ id: quote._id });
				}}
			/>

			<LineItemSheet
				visible={itemSheet !== null}
				onClose={() => setItemSheet(null)}
				initial={itemSheet?.item ?? null}
				unitRequired
				canDelete={canDeleteItems}
				onSubmit={saveItem}
				onDelete={deleteItem}
			/>

			<ExtendValidUntilSheet
				visible={extendOpen}
				onClose={() => setExtendOpen(false)}
				quoteNumber={quote.quoteNumber ?? "This quote"}
				currentValidUntil={quote.validUntil ?? null}
				expired={status === "expired"}
				onSubmit={async (validUntil) => {
					await extendValidUntil({ id: quote._id, validUntil });
				}}
			/>

			{/* Team chat — entityName mirrors web's quote label exactly
			    (quotes/[quoteId] overview-tab). */}
			<MentionModal
				visible={mentionVisible}
				onClose={() => setMentionVisible(false)}
				entityType="quote"
				entityId={quote._id}
				entityName={
					quote.title || `Quote #${quote.quoteNumber || quote._id.slice(-6)}`
				}
			/>
		</View>
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

	validLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		marginTop: 5,
	},
	actionsWrap: { marginTop: 14 },
	// Mirrors the client/project detail "Team chat" affordance (same shape).
	teamChat: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 44,
		borderRadius: radii.rSm,
		borderWidth: 1,
	},
	teamChatText: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},

	stepperWrap: { padding: 16 },

	section: { gap: 10 },
	staleHint: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},

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
	lineDesc: { fontFamily: fontFamily.semibold, fontSize: type.h4 },
	lineSub: { fontFamily: fontFamily.regular, fontSize: type.sm },
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

	noLines: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		paddingVertical: 18,
		paddingHorizontal: 14,
	},
	linePressed: { opacity: 0.7 },
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
	totalsFooter: { paddingHorizontal: 14, paddingVertical: 12 },

	skeletonHeader: {
		height: 120,
		borderRadius: radii.rLg,
		borderWidth: 1,
	},
	skeletonLines: { marginTop: 14, gap: 10 },
	skeletonLine: { height: 48, borderRadius: radii.r },
	lineSkeletonBlock: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
	lineSkeleton: { height: 40, borderRadius: radii.sm },

	signatureRow: { padding: 14, gap: 8 },
	approvalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	approvalLabel: { fontFamily: fontFamily.bold, fontSize: type.h4 },
	approvalCaption: { fontFamily: fontFamily.regular, fontSize: type.sm },
	approvalSkeleton: { height: 14, borderRadius: radii.sm, width: "100%" },
	viewedRow: { flexDirection: "row", alignItems: "center", gap: 5 },
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
