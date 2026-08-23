import { useState } from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Mail, X } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { describeMutationError } from "@/lib/mutation-error";
import { useEntitlements } from "@/lib/use-entitlements";
import { Button, Eyebrow, TotalsBlock } from "@/components/ui";
import { MoneyAmount } from "./money-amount";

export interface PreviewLineItem {
	key: string;
	description: string;
	sub: string;
	amount: string;
}

// The send confirm step (aligned decision: native document preview, not a
// portal WebView or PDF): what the client will see in the portal, composed
// from record data — org-free document header, line items, totals — with the
// recipient spelled out above the one Send button. The email itself is the
// branded portal invite; this previews the document's content.
export function SendPreviewSheet({
	visible,
	onClose,
	kind,
	number,
	title,
	clientName,
	amount,
	recipientEmail,
	items,
	totalsRows,
	totalValue,
	resend,
	firstSend,
	onSend,
}: {
	visible: boolean;
	onClose: () => void;
	kind: "quote" | "invoice";
	number?: string;
	title?: string;
	clientName: string;
	amount: number;
	recipientEmail: string | null;
	items: PreviewLineItem[];
	totalsRows: { label: string; value: string; negative?: boolean }[];
	totalValue: string;
	/** Already sent — button reads "Resend", no status implication. */
	resend?: boolean;
	/**
	 * This send would debit the clientSends meter (the doc has never been
	 * sent). Resends never debit, so the meter line and the exhausted
	 * disable apply only when this is true.
	 */
	firstSend: boolean;
	onSend: () => Promise<void>;
}) {
	const t = useTokens();
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Meter absent = loading, business (unlimited), or signed out — in every
	// case there is nothing to show and nothing to disable.
	const { meter } = useEntitlements();
	const sends = firstSend ? meter("clientSends") : undefined;
	const sendsExhausted =
		sends !== undefined && sends.remaining !== null && sends.remaining <= 0;

	const close = () => {
		setError(null);
		onClose();
	};

	const send = async () => {
		setSending(true);
		setError(null);
		try {
			await onSend();
			close();
		} catch (err) {
			setError(
				describeMutationError(
					err,
					`Couldn't send this ${kind}. Check the client's portal access and try again.`
				).message
			);
		} finally {
			setSending(false);
		}
	};

	const noun = kind === "quote" ? "Quote" : "Invoice";

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={close}
		>
			<View style={[styles.root, { backgroundColor: t.bg }]}>
				<View style={styles.topBar}>
					<Text style={[styles.topTitle, { color: t.ink }]}>
						{resend ? `Resend ${kind}` : `Send ${kind}`}
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close"
						onPress={close}
						hitSlop={8}
						style={[styles.close, { backgroundColor: t.secondary }]}
					>
						<X size={16} color={t.ink} />
					</Pressable>
				</View>
				<ScrollView
					style={styles.flex}
					contentContainerStyle={styles.scroll}
				>
					{/* The document, as the portal will present it. */}
					<View
						style={[
							styles.doc,
							{ backgroundColor: t.card, borderColor: t.line },
						]}
					>
						<View style={styles.docHeader}>
							{number ? <Eyebrow>{`${noun} ${number}`}</Eyebrow> : <Eyebrow>{noun}</Eyebrow>}
							{title ? (
								<Text style={[styles.docTitle, { color: t.ink }]} numberOfLines={2}>
									{title}
								</Text>
							) : null}
							<Text style={[styles.docClient, { color: t.sub }]} numberOfLines={1}>
								Prepared for {clientName}
							</Text>
							<View style={styles.docAmount}>
								<MoneyAmount amount={amount} size={28} />
							</View>
						</View>
						<View style={[styles.divider, { backgroundColor: t.line }]} />
						{items.length === 0 ? (
							<Text style={[styles.emptyLine, { color: t.faint }]}>
								No itemized lines
							</Text>
						) : (
							items.map((item, i) => (
								<View
									key={item.key}
									style={[
										styles.itemRow,
										{
											borderBottomColor: t.lineSoft,
											borderBottomWidth: i === items.length - 1 ? 0 : 1,
										},
									]}
								>
									<View style={styles.itemBody}>
										<Text
											style={[styles.itemDesc, { color: t.ink }]}
											numberOfLines={2}
										>
											{item.description}
										</Text>
										<Text style={[styles.itemSub, { color: t.sub }]}>
											{item.sub}
										</Text>
									</View>
									<Text style={[styles.itemAmount, { color: t.ink }]}>
										{item.amount}
									</Text>
								</View>
							))
						)}
						<View style={[styles.divider, { backgroundColor: t.line }]} />
						<View style={styles.totalsWrap}>
							<TotalsBlock
								rows={totalsRows}
								total={{ label: "Total", value: totalValue }}
							/>
						</View>
					</View>
				</ScrollView>
				<View style={[styles.footer, { borderTopColor: t.line, backgroundColor: t.card }]}>
					<View style={styles.recipientRow}>
						<Mail size={14} color={t.faint} />
						<Text style={[styles.recipient, { color: t.sub }]} numberOfLines={1}>
							{recipientEmail
								? `Sending to ${recipientEmail}`
								: "No primary contact email on this client"}
						</Text>
					</View>
					{sends && sends.limit !== null && sends.remaining !== null ? (
						<Text
							style={[
								styles.meterLine,
								{ color: sendsExhausted ? t.warning : t.faint },
							]}
						>
							{sendsExhausted
								? "You've used all of this month's document sends. They reset at the start of next month."
								: `${sends.remaining} of ${sends.limit} document sends left this month`}
						</Text>
					) : null}
					{error ? (
						<Text style={[styles.errorLine, { color: t.destructive }]}>
							{error}
						</Text>
					) : null}
					<Button
						title={
							sending
								? "Sending…"
								: resend
									? `Resend ${kind}`
									: `Send ${kind}`
						}
						variant="solid"
						disabled={sending || !recipientEmail || sendsExhausted}
						onPress={send}
					/>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	flex: { flex: 1 },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 18,
		paddingTop: 18,
		paddingBottom: 6,
	},
	topTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h3,
		textTransform: "capitalize",
	},
	close: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	scroll: { padding: 18, paddingTop: 10 },
	doc: {
		borderRadius: radii.rLg,
		borderWidth: 1,
		overflow: "hidden",
	},
	docHeader: { padding: 18, gap: 4 },
	docTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	docClient: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	docAmount: { marginTop: 4 },
	divider: { height: 1, marginHorizontal: 18 },
	itemRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 18,
	},
	itemBody: { flex: 1, minWidth: 0, gap: 2 },
	itemDesc: { fontFamily: fontFamily.medium, fontSize: type.rowTitle },
	itemSub: { fontFamily: fontFamily.regular, fontSize: type.meta },
	itemAmount: {
		fontFamily: fontFamily.semibold,
		fontSize: type.rowTitle,
		fontVariant: ["tabular-nums"],
	},
	emptyLine: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		padding: 18,
	},
	totalsWrap: { paddingHorizontal: 18, paddingBottom: 16, paddingTop: 4 },
	footer: {
		borderTopWidth: 1,
		padding: 18,
		paddingBottom: 28,
		gap: 12,
	},
	recipientRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
	},
	recipient: {
		flex: 1,
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	meterLine: {
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
	},
	errorLine: {
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
	},
});
