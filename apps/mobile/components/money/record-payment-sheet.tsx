import { useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Modal,
	Platform,
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
	onSubmit: (
		amount: number,
		method: ManualMethod,
		note?: string
	) => Promise<{ invoicePaid: boolean; remaining: number }>;
}) {
	const t = useTokens();
	const [amountText, setAmountText] = useState("");
	const [method, setMethod] = useState<ManualMethod>("cash");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState<{
		amount: number;
		invoicePaid: boolean;
		remaining: number;
	} | null>(null);

	// Re-seed the form each time the sheet opens (remaining can change between
	// opens as payments land). Guarded render-time derivation — the house
	// pattern; setState-in-effect is a lint error here.
	const [prevVisible, setPrevVisible] = useState(false);
	if (visible !== prevVisible) {
		setPrevVisible(visible);
		if (visible) {
			setAmountText(remaining > 0 ? remaining.toFixed(2) : "");
			setMethod("cash");
			setNote("");
			setDone(null);
			setSaving(false);
		}
	}

	const amount = Number.parseFloat(amountText.replace(/[^0-9.]/g, ""));
	const amountValid =
		Number.isFinite(amount) && amount > 0 && amount <= remaining + 0.005;

	const submit = async () => {
		if (!amountValid || saving) return;
		setSaving(true);
		try {
			const result = await onSubmit(amount, method, note.trim() || undefined);
			setDone({ amount, ...result });
		} catch {
			Alert.alert("Couldn't record that payment", "Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<KeyboardAvoidingView
				style={[styles.root, { backgroundColor: t.bg }]}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<View style={styles.topBar}>
					<Text style={[styles.topTitle, { color: t.ink }]}>
						Record payment
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close"
						onPress={onClose}
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
							Payment recorded
						</Text>
						<Text style={[styles.successBody, { color: t.sub }]}>
							{formatCurrency(done.amount, { exact: true })} recorded against{" "}
							{invoiceNumber}.
							{done.invoicePaid
								? " This invoice is now paid in full."
								: ` ${formatCurrency(done.remaining, { exact: true })} remaining.`}
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
									<Text style={[styles.dollarSign, { color: t.faintDecor }]}>$</Text>
									<TextInput
										value={amountText}
										onChangeText={setAmountText}
										keyboardType="decimal-pad"
										placeholder="0.00"
										placeholderTextColor={t.faintDecor}
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
									placeholderTextColor={t.faintDecor}
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
			</KeyboardAvoidingView>
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
