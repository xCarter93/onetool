import { useCallback, useState } from "react";
import {
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Banknote, Check, Landmark, Wallet, X } from "lucide-react-native";
import { badgeTone, fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button, Eyebrow, SegmentedToggle } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { FormSheet } from "@/components/sheets/form-sheet";

export type ManualMethod = "cash" | "check" | "other";

const METHODS = [
	{ value: "cash" as const, label: "Cash", Icon: Banknote },
	{ value: "check" as const, label: "Check", Icon: Landmark },
	{ value: "other" as const, label: "Other", Icon: Wallet },
];

// Field payment capture (Jobber's record-payment pattern, flow 9c0c812f):
// amount defaults to the remaining balance and edits DOWN only, the confirm
// button carries the exact amount it will commit, and success is its own
// step inside the sheet — no ambiguity about what was just recorded.
//
// Recording always queues through the offline outbox (PRD-mobile-offline §4.6:
// every write goes through it, online or offline) — onSubmit resolves once the
// change is saved on the device, not once the server confirms it, so the
// success step can no longer promise a definite invoicePaid/remaining outcome.
export function RecordPaymentSheet({
	visible,
	onClose,
	invoiceNumber,
	remaining,
	onSubmit,
}: {
	visible: boolean;
	onClose: () => void;
	invoiceNumber: string;
	remaining: number;
	/** Resolves to whether the payment was saved on the device (queued to sync). */
	onSubmit: (
		amount: number,
		method: ManualMethod,
		note?: string
	) => Promise<boolean>;
}) {
	const t = useTokens();
	const seedAmountText = remaining > 0 ? remaining.toFixed(2) : "";
	const [amountText, setAmountText] = useState(seedAmountText);
	const [method, setMethod] = useState<ManualMethod>("cash");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState<{ amount: number } | null>(null);

	// Re-seed the form each time the sheet opens (remaining can change between
	// opens as payments land). Guarded render-time derivation — the house
	// pattern; setState-in-effect is a lint error here.
	const [prevVisible, setPrevVisible] = useState(false);
	if (visible !== prevVisible) {
		setPrevVisible(visible);
		if (visible) {
			setAmountText(seedAmountText);
			setMethod("cash");
			setNote("");
			setDone(null);
			setSaving(false);
		}
	}

	// Success screen is never dirty (nothing left to lose) — let it swipe away freely.
	const dirty =
		!done &&
		(amountText !== seedAmountText || method !== "cash" || note !== "");

	const attemptClose = useCallback(() => {
		if (saving) return;
		if (!dirty) {
			onClose();
			return;
		}
		Alert.alert(
			"Discard this payment?",
			"Your changes haven't been saved.",
			[
				{ text: "Keep editing", style: "cancel" },
				{ text: "Discard", style: "destructive", onPress: onClose },
			]
		);
	}, [saving, dirty, onClose]);

	const amount = Number.parseFloat(amountText.replace(/[^0-9.]/g, ""));
	const amountValid =
		Number.isFinite(amount) && amount > 0 && amount <= remaining + 0.005;

	const submit = async () => {
		if (!amountValid || saving) return;
		setSaving(true);
		try {
			const saved = await onSubmit(amount, method, note.trim() || undefined);
			if (saved) setDone({ amount });
		} catch {
			Alert.alert("Couldn't record that payment", "Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<FormSheet visible={visible} onDismiss={attemptClose} dirty={dirty} snapPoint="75%">
			<View style={[styles.root, { backgroundColor: t.bg }]}>
				<View style={styles.topBar}>
					<Text style={[styles.topTitle, { color: t.ink }]}>
						Record payment
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close"
						onPress={attemptClose}
						hitSlop={8}
						style={[styles.close, { backgroundColor: t.secondary }]}
					>
						<X size={16} color={t.ink} />
					</Pressable>
				</View>

				{done ? (
					// SUCCESS — the sheet's own closing screen (Jobber pattern).
					<View style={styles.success}>
						<View
							style={[styles.successRing, { backgroundColor: badgeTone.ok.bg }]}
						>
							<Check size={30} color={t.success} strokeWidth={3} />
						</View>
						<Text style={[styles.successTitle, { color: t.ink }]}>
							Payment saved
						</Text>
						<Text style={[styles.successBody, { color: t.sub }]}>
							{formatCurrency(done.amount, { exact: true })} recorded against{" "}
							{invoiceNumber}. It will sync automatically.
						</Text>
						<Button title="Done" variant="solid" onPress={onClose} style={styles.successBtn} />
					</View>
				) : (
					<>
						<ScrollView
							style={styles.flex}
							contentContainerStyle={styles.scroll}
							keyboardShouldPersistTaps="handled"
						>
							<View style={styles.field}>
								<Eyebrow>Amount</Eyebrow>
								<View
									style={[
										styles.amountBox,
										{ backgroundColor: t.card, borderColor: t.line },
									]}
								>
									<Text style={[styles.dollarSign, { color: t.faint }]}>$</Text>
									<TextInput
										value={amountText}
										onChangeText={setAmountText}
										keyboardType="decimal-pad"
										placeholder="0.00"
										placeholderTextColor={t.faint}
										style={[styles.amountInput, { color: t.ink }]}
										accessibilityLabel="Payment amount in dollars"
									/>
								</View>
								<Text
									style={[
										styles.helper,
										{
											color:
												amountText && !amountValid ? t.danger : t.sub,
										},
									]}
								>
									{amountText && !amountValid
										? `Enter an amount up to ${formatCurrency(remaining, { exact: true })}`
										: `${formatCurrency(remaining, { exact: true })} outstanding on ${invoiceNumber}`}
								</Text>
							</View>

							<View style={styles.field}>
								<Eyebrow>Method</Eyebrow>
								<SegmentedToggle
									segments={METHODS}
									value={method}
									onChange={setMethod}
								/>
							</View>

							<View style={styles.field}>
								<Eyebrow>Note</Eyebrow>
								<TextInput
									value={note}
									onChangeText={setNote}
									placeholder="Check #, who paid, anything worth remembering"
									placeholderTextColor={t.faint}
									multiline
									style={[
										styles.noteInput,
										{
											backgroundColor: t.card,
											borderColor: t.line,
											color: t.ink,
										},
									]}
									accessibilityLabel="Payment note"
								/>
							</View>
						</ScrollView>
						<View
							style={[
								styles.footer,
								{ borderTopColor: t.line, backgroundColor: t.card },
							]}
						>
							<Button
								title={
									saving
										? "Recording…"
										: amountValid
											? `Record ${formatCurrency(amount, { exact: true })}`
											: "Record payment"
								}
								variant="solid"
								disabled={!amountValid || saving}
								onPress={submit}
							/>
						</View>
					</>
				)}
			</View>
		</FormSheet>
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
	topTitle: { fontFamily: fontFamily.bold, fontSize: type.h3 },
	close: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	scroll: { padding: 18, paddingTop: 10, gap: 20 },
	field: { gap: 8 },
	amountBox: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: radii.rLg,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 4,
	},
	dollarSign: {
		fontFamily: fontFamily.semibold,
		fontSize: 26,
	},
	amountInput: {
		flex: 1,
		fontFamily: fontFamily.bold,
		fontSize: 30,
		letterSpacing: -0.6,
		fontVariant: ["tabular-nums"],
		paddingVertical: 0,
	},
	helper: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	noteInput: {
		borderRadius: radii.r,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		minHeight: 76,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
		textAlignVertical: "top",
	},
	footer: {
		borderTopWidth: 1,
		padding: 18,
		paddingBottom: 28,
	},
	success: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	successRing: {
		width: 64,
		height: 64,
		borderRadius: 32,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 6,
	},
	successTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
	},
	successBody: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		textAlign: "center",
		lineHeight: 21,
	},
	successBtn: {
		alignSelf: "stretch",
		marginTop: 14,
	},
});
