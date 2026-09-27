import { OfflineBlockedError } from "@/lib/offline/hooks";
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
import { X } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { FormSheet } from "@/components/sheets/form-sheet";
import { SheetField, SheetInput } from "@/components/sheets/create-sheet";

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
	const seedDescription = initial?.description ?? "";
	const seedQuantityText = initial ? String(initial.quantity) : "1";
	const seedUnit = initial?.unit ?? "";
	const seedRateText = initial ? String(initial.rate) : "";
	const [description, setDescription] = useState(seedDescription);
	const [quantityText, setQuantityText] = useState(seedQuantityText);
	const [unit, setUnit] = useState(seedUnit);
	const [rateText, setRateText] = useState(seedRateText);
	const [saving, setSaving] = useState(false);

	// Re-seed per open (house guarded render-time derivation — setState in an
	// effect is a lint error here).
	const [prevVisible, setPrevVisible] = useState(false);
	if (visible !== prevVisible) {
		setPrevVisible(visible);
		if (visible) {
			setDescription(seedDescription);
			setQuantityText(seedQuantityText);
			setUnit(seedUnit);
			setRateText(seedRateText);
			setSaving(false);
		}
	}

	const dirty =
		description !== seedDescription ||
		quantityText !== seedQuantityText ||
		unit !== seedUnit ||
		rateText !== seedRateText;

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
		} catch (err) {
			if (!(err instanceof OfflineBlockedError)) {
				Alert.alert("Couldn't save that line item", "Please try again.");
			}
			setSaving(false);
		}
	};

	const attemptClose = useCallback(() => {
		if (saving) return;
		if (!dirty) {
			onClose();
			return;
		}
		Alert.alert(
			"Discard this line item?",
			"Your changes haven't been saved.",
			[
				{ text: "Keep editing", style: "cancel" },
				{ text: "Discard", style: "destructive", onPress: onClose },
			]
		);
	}, [saving, dirty, onClose]);

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
						} catch (err) {
							if (!(err instanceof OfflineBlockedError)) {
								Alert.alert("Couldn't delete that line item", "Please try again.");
							}
							setSaving(false);
						}
					},
				},
			]
		);
	};

	return (
		<FormSheet visible={visible} onDismiss={attemptClose} dirty={dirty} snapPoint="78%">
			<View style={[styles.root, { backgroundColor: t.bg }]}>
				<View style={styles.topBar}>
					<Text style={[styles.topTitle, { color: t.ink }]}>
						{initial ? "Edit line item" : "Add line item"}
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

				<ScrollView
					style={styles.flex}
					contentContainerStyle={styles.scroll}
					keyboardShouldPersistTaps="handled"
				>
					<SheetField label="Description">
						<SheetInput
							value={description}
							onChangeText={setDescription}
							placeholder="Spring cleanup, service call, materials…"
							multiline
							accessibilityLabel="Line item description"
						/>
					</SheetField>

					<View style={styles.pair}>
						<SheetField label="Quantity" style={styles.pairItem}>
							<SheetInput
								value={quantityText}
								onChangeText={setQuantityText}
								keyboardType="decimal-pad"
								placeholder="1"
								accessibilityLabel="Quantity"
							/>
						</SheetField>
						<SheetField
							label={unitRequired ? "Unit" : "Unit (optional)"}
							style={styles.pairItem}
						>
							<SheetInput
								value={unit}
								onChangeText={setUnit}
								placeholder="hour, sq ft, unit"
								autoCapitalize="none"
								accessibilityLabel="Unit of measure"
							/>
						</SheetField>
					</View>

					<SheetField label="Rate">
						<View
							style={[
								styles.rateBox,
								{ backgroundColor: t.card, borderColor: t.input },
							]}
						>
							<Text style={[styles.dollarSign, { color: t.faint }]}>$</Text>
							<TextInput
								value={rateText}
								onChangeText={setRateText}
								keyboardType="decimal-pad"
								placeholder="0.00"
								placeholderTextColor={t.faint}
								style={[styles.rateInput, { color: t.ink }]}
								accessibilityLabel="Rate per unit in dollars"
							/>
						</View>
					</SheetField>

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
	pair: { flexDirection: "row", gap: 12 },
	pairItem: { flex: 1 },
	rateBox: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: radii.ctrl,
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
		borderRadius: radii.ctrl,
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
