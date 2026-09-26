import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { describeMutationError } from "@/lib/mutation-error";
import { Button } from "@/components/ui";
import { AppCalendar } from "@/components/AppCalendar";
import {
	dateIdFromUtcMs,
	todayDateId,
	utcMsFromDateId,
} from "@/lib/date";
import { FormSheet } from "@/components/sheets/form-sheet";

// Extend a quote's valid-until date. Silent toward the client (no email) —
// but extending an EXPIRED quote revives it to sent on the backend, so the
// consequence line and the confirm button both say so.
export function ExtendValidUntilSheet({
	visible,
	onClose,
	quoteNumber,
	currentValidUntil,
	expired,
	onSubmit,
}: {
	visible: boolean;
	onClose: () => void;
	quoteNumber: string;
	/** UTC-midnight epoch ms, or null when the quote has no date yet. */
	currentValidUntil: number | null;
	expired: boolean;
	onSubmit: (validUntil: number) => Promise<void>;
}) {
	const t = useTokens();
	// An expired quote's stored date is in the past — never preselect a date
	// the server would reject.
	const seedId = (() => {
		const currentId =
			currentValidUntil !== null
				? dateIdFromUtcMs(currentValidUntil)
				: undefined;
		return currentId && currentId >= todayDateId() ? currentId : undefined;
	})();
	const [selectedId, setSelectedId] = useState<string | undefined>(seedId);
	const [saving, setSaving] = useState(false);

	// Re-seed per open (house guarded render-time derivation).
	const [prevVisible, setPrevVisible] = useState(false);
	if (visible !== prevVisible) {
		setPrevVisible(visible);
		if (visible) {
			setSelectedId(seedId);
			setSaving(false);
		}
	}

	const dirty = selectedId !== seedId;

	const attemptClose = useCallback(() => {
		if (saving) return;
		if (!dirty) {
			onClose();
			return;
		}
		Alert.alert(
			"Discard this date?",
			"You picked a date but haven't extended to it yet.",
			[
				{ text: "Keep editing", style: "cancel" },
				{ text: "Discard", style: "destructive", onPress: onClose },
			]
		);
	}, [saving, dirty, onClose]);

	const selectedLabel = selectedId
		? new Date(utcMsFromDateId(selectedId)).toLocaleDateString(undefined, {
				timeZone: "UTC",
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;

	const submit = async () => {
		if (!selectedId || saving) return;
		setSaving(true);
		try {
			await onSubmit(utcMsFromDateId(selectedId));
			onClose();
		} catch (err) {
			// Extending an expired quote revives it to sent, which can debit the
			// clientSends meter and refuse — show the real reason.
			Alert.alert(
				"Couldn't extend that date",
				describeMutationError(err, "Please try again.").message
			);
			setSaving(false);
		}
	};

	return (
		<FormSheet visible={visible} onDismiss={attemptClose} dirty={dirty} snapPoint="85%">
			<View style={[styles.root, { backgroundColor: t.bg }]}>
				<View style={styles.topBar}>
					<Text style={[styles.topTitle, { color: t.ink }]}>
						Extend valid until
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

				<Text style={[styles.context, { color: t.sub }]}>
					{expired
						? `Extending ${quoteNumber} makes it available to your client again.`
						: `${quoteNumber} stays with your client — no email goes out.`}
				</Text>

				<View style={styles.calendarWrap}>
					<AppCalendar
						selectedDate={selectedId}
						onDateSelect={setSelectedId}
						minDate={todayDateId()}
					/>
				</View>

				<View
					style={[
						styles.footer,
						{ borderTopColor: t.line, backgroundColor: t.card },
					]}
				>
					<Button
						title={
							saving
								? "Extending…"
								: selectedLabel
									? expired
										? `Extend to ${selectedLabel} & make available`
										: `Extend to ${selectedLabel}`
									: "Pick a date"
						}
						variant="solid"
						disabled={!selectedId || saving}
						onPress={submit}
					/>
				</View>
			</View>
		</FormSheet>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
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
	context: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		paddingHorizontal: 18,
		paddingBottom: 8,
	},
	calendarWrap: {
		flex: 1,
		paddingHorizontal: 12,
		paddingTop: 4,
	},
	footer: {
		borderTopWidth: 1,
		padding: 18,
		paddingBottom: 28,
	},
});
