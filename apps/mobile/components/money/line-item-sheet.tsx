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
import { X } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button, Eyebrow } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export interface LineItemDraft {
	description: string;
	quantity: number;
	unit: string;
	rate: number;
}

export interface LineItemInitial extends LineItemDraft {
	id: string;
}

// Per-row line-item editor (Jobber's add-line-item pattern, flow a963fd19):
// stacked fields, the computed amount pinned under them, one solid Save that
// carries the amount it will commit. Add and edit share the sheet — edit mode
// additionally offers Delete when the caller's permissions allow it.
export function LineItemSheet({
	visible,
	onClose,
	initial,
	unitRequired,
	canDelete,
	onSubmit,
	onDelete,
}: {
	visible: boolean;
	onClose: () => void;
	/** Present = editing this row; absent = adding a new one. */
	initial?: LineItemInitial | null;
	/** Quotes require a unit; invoices treat it as optional. */
	unitRequired: boolean;
	canDelete: boolean;
	onSubmit: (draft: LineItemDraft) => Promise<void>;
	onDelete?: () => Promise<void>;
}) {
	const t = useTokens();
	const [description, setDescription] = useState("");
	const [quantityText, setQuantityText] = useState("1");
	const [unit, setUnit] = useState("");
	const [rateText, setRateText] = useState("");
	const [saving, setSaving] = useState(false);

	// Re-seed per open (house guarded render-time derivation — setState in an
	// effect is a lint error here).
	const [prevVisible, setPrevVisible] = useState(false);
	if (visible !== prevVisible) {
		setPrevVisible(visible);
		if (visible) {
			setDescription(initial?.description ?? "");
			setQuantityText(initial ? String(initial.quantity) : "1");
			setUnit(initial?.unit ?? "");
			setRateText(initial ? String(initial.rate) : "");
			setSaving(false);
		}
	}

	const quantity = Number.parseFloat(quantityText.replace(/[^0-9.]/g, ""));
	const rate = Number.parseFloat(rateText.replace(/[^0-9.]/g, ""));
	// Mirrors the server's validateQuoteLineItemFields so an invalid value
	// never fires a mutation: description/unit non-empty (unit per record
	// type), quantity finite and positive, rate finite and non-negative.
	const quantityValid = Number.isFinite(quantity) && quantity > 0;
	const rateValid = Number.isFinite(rate) && rate >= 0;
	const valid =
		description.trim().length > 0 &&
		quantityValid &&
		rateValid &&
		(!unitRequired || unit.trim().length > 0);
	const amount = quantityValid && rateValid ? quantity * rate : null;

	const submit = async () => {
		if (!valid || saving) return;
		setSaving(true);
		try {
			await onSubmit({
				description: description.trim(),
				quantity,
				unit: unit.trim(),
				rate,
			});
			onClose();
		} catch {
			Alert.alert("Couldn't save that line item", "Please try again.");
			setSaving(false);
		}
	};

	const confirmDelete = () => {
		if (saving || !onDelete) return;
		Alert.alert(
			"Delete line item?",
			`"${description.trim() || "This line"}" comes off the document and the total updates.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						setSaving(true);
						try {
							await onDelete();
							onClose();
						} catch {
							Alert.alert("Couldn't delete that line item", "Please try again.");
							setSaving(false);
						}
					},
				},
			]
		);
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
						{initial ? "Edit line item" : "Add line item"}
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

				<ScrollView
					style={styles.flex}
					contentContainerStyle={styles.scroll}
					keyboardShouldPersistTaps="handled"
				>
					<View style={styles.field}>
						<Eyebrow>Description</Eyebrow>
						<TextInput
							value={description}
							onChangeText={setDescription}
							placeholder="Spring cleanup, service call, materials…"
							placeholderTextColor={t.faintDecor}
							multiline
							style={[
								styles.descriptionInput,
								{
									backgroundColor: t.card,
									borderColor: t.line,
									color: t.ink,
								},
							]}
							accessibilityLabel="Line item description"
						/>
					</View>

					<View style={styles.pair}>
						<View style={[styles.field, styles.pairItem]}>
							<Eyebrow>Quantity</Eyebrow>
							<TextInput
								value={quantityText}
								onChangeText={setQuantityText}
								keyboardType="decimal-pad"
								placeholder="1"
								placeholderTextColor={t.faintDecor}
								style={[
									styles.numberInput,
									{
										backgroundColor: t.card,
										borderColor: t.line,
										color: t.ink,
									},
								]}
								accessibilityLabel="Quantity"
							/>
						</View>
						<View style={[styles.field, styles.pairItem]}>
							<Eyebrow>{unitRequired ? "Unit" : "Unit (optional)"}</Eyebrow>
							<TextInput
								value={unit}
								onChangeText={setUnit}
								placeholder="hour, sq ft, unit"
								placeholderTextColor={t.faintDecor}
								autoCapitalize="none"
								style={[
									styles.numberInput,
									{
										backgroundColor: t.card,
										borderColor: t.line,
										color: t.ink,
									},
								]}
								accessibilityLabel="Unit of measure"
							/>
						</View>
					</View>

					<View style={styles.field}>
						<Eyebrow>Rate</Eyebrow>
						<View
							style={[
								styles.rateBox,
								{ backgroundColor: t.card, borderColor: t.line },
							]}
						>
							<Text style={[styles.dollarSign, { color: t.faintDecor }]}>$</Text>
							<TextInput
								value={rateText}
								onChangeText={setRateText}
								keyboardType="decimal-pad"
								placeholder="0.00"
								placeholderTextColor={t.faintDecor}
								style={[styles.rateInput, { color: t.ink }]}
								accessibilityLabel="Rate per unit in dollars"
							/>
						</View>
					</View>

					<View
						style={[
							styles.amountRow,
							{ backgroundColor: t.card, borderColor: t.line },
						]}
					>
						<Text style={[styles.amountLabel, { color: t.sub }]}>Amount</Text>
						<Text style={[styles.amountValue, { color: t.ink }]}>
							{amount !== null
								? formatCurrency(amount, { exact: true })
								: "—"}
						</Text>
					</View>

					{initial && canDelete ? (
						<Pressable
							accessibilityRole="button"
							onPress={confirmDelete}
							disabled={saving}
							style={styles.deleteRow}
						>
							<Text
								style={[
									styles.deleteText,
									{ color: t.danger, opacity: saving ? 0.5 : 1 },
								]}
							>
								Delete line item
							</Text>
						</Pressable>
					) : null}
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
								? "Saving…"
								: amount !== null && valid
									? `Save · ${formatCurrency(amount, { exact: true })}`
									: "Save line item"
						}
						variant="solid"
						disabled={!valid || saving}
						onPress={submit}
					/>
				</View>
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
	pair: { flexDirection: "row", gap: 12 },
	pairItem: { flex: 1 },
	descriptionInput: {
		borderRadius: radii.r,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		minHeight: 68,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
		textAlignVertical: "top",
	},
	numberInput: {
		borderRadius: radii.r,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
		letterSpacing: 0,
		fontVariant: ["tabular-nums"],
	},
	rateBox: {
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
		fontSize: 22,
	},
	rateInput: {
		flex: 1,
		fontFamily: fontFamily.bold,
		fontSize: 24,
		letterSpacing: -0.4,
		fontVariant: ["tabular-nums"],
		paddingVertical: 0,
	},
	amountRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderRadius: radii.rLg,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	amountLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	amountValue: {
		fontFamily: fontFamily.bold,
		fontSize: type.h3,
		fontVariant: ["tabular-nums"],
		letterSpacing: -0.3,
	},
	deleteRow: {
		alignItems: "center",
		paddingVertical: 4,
	},
	deleteText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	footer: {
		borderTopWidth: 1,
		padding: 18,
		paddingBottom: 28,
	},
});
