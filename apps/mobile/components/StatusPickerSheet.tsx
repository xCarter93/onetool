import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";

export interface StatusOption {
	value: string;
	label: string;
}

interface StatusPickerSheetProps {
	visible: boolean;
	value: string;
	options: StatusOption[];
	onSelect: (value: string) => void;
	onClose: () => void;
	title?: string;
}

// Reusable enum bottom-sheet (client + project status). Caller supplies options.
// RN-core Modal (matches the P20 DaySheet decision — not @gorhom/bottom-sheet).
export function StatusPickerSheet({
	visible,
	value,
	options,
	onSelect,
	onClose,
	title = "Select status",
}: StatusPickerSheetProps) {
	const t = useTokens();
	const insets = useSafeAreaInsets();

	const handleSelect = (next: string) => {
		onSelect(next);
		onClose();
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<Pressable style={styles.backdrop} onPress={onClose} />
			<View
				style={[
					styles.sheet,
					{ backgroundColor: t.card, paddingBottom: insets.bottom + 12 },
				]}
			>
				<View style={[styles.grabber, { backgroundColor: t.border }]} />
				<View style={styles.header}>
					<View style={{ flex: 1 }} />
					<Text style={[styles.title, { color: t.ink }]}>{title}</Text>
					<View style={styles.headerAction}>
						<Pressable
							onPress={onClose}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="Close"
							style={styles.closeBtn}
						>
							<X size={22} color={t.sub} />
						</Pressable>
					</View>
				</View>

				<View style={styles.list}>
					{options.map((option, idx) => {
						const isSelected = option.value === value;
						return (
							<Pressable
								key={option.value}
								onPress={() => handleSelect(option.value)}
								accessibilityRole="button"
								accessibilityState={{ selected: isSelected }}
								style={({ pressed }) => [
									styles.row,
									{
										borderBottomColor: t.line,
										borderBottomWidth: idx === options.length - 1 ? 0 : 1,
										backgroundColor: pressed ? t.surface : "transparent",
									},
								]}
							>
								<Text
									style={[
										styles.rowLabel,
										{
											color: t.ink,
											fontFamily: isSelected
												? fontFamily.semibold
												: fontFamily.regular,
										},
									]}
								>
									{option.label}
								</Text>
								{isSelected ? <Check size={20} color={t.accent} /> : null}
							</Pressable>
						);
					})}
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	sheet: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 12,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 12,
	},
	title: {
		flex: 2,
		textAlign: "center",
		fontSize: 20,
		lineHeight: 26,
		fontFamily: fontFamily.bold,
	},
	headerAction: {
		flex: 1,
		alignItems: "flex-end",
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	list: {
		paddingHorizontal: 20,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 52,
		paddingVertical: 14,
	},
	rowLabel: {
		fontSize: type.body,
	},
});
