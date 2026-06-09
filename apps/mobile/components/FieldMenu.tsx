import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { ChevronDown } from "lucide-react-native";
import { fontFamily, type, radii, useTokens } from "@/lib/theme";

export interface FieldMenuOption {
	value: string;
	label: string;
}

interface FieldMenuProps {
	value: string;
	options: FieldMenuOption[];
	onSelect: (value: string) => void;
	/** Trigger text for the default select-row trigger. Ignored when `children` is set. */
	label?: string;
	/** Render the trigger text in the muted placeholder color. */
	placeholder?: boolean;
	/** Disable the trigger (e.g. Project before a Client is chosen). */
	disabled?: boolean;
	/** Menu title shown above the actions (iOS only). */
	title?: string;
	/** Custom trigger (e.g. a status Badge). Overrides the default select-row look. */
	children?: ReactNode;
}

// Native single-choice picker. iOS renders a SwiftUI Menu with a checkmark on
// the selected action; Android a Compose dropdown. Replaces the old bottom-sheet
// picker for short enums and small entity lists.
export function FieldMenu({
	value,
	options,
	onSelect,
	label,
	placeholder,
	disabled,
	title,
	children,
}: FieldMenuProps) {
	const t = useTokens();
	// No menu to open when disabled or empty — render the trigger as an inert affordance.
	const inert = disabled || options.length === 0;

	const trigger = children ?? (
		<View
			accessibilityRole="button"
			accessibilityState={{ disabled: inert }}
			style={[
				styles.select,
				{
					borderColor: t.border,
					backgroundColor: t.card,
					opacity: inert ? 0.5 : 1,
				},
			]}
		>
			<Text
				style={[styles.selectText, { color: placeholder ? t.faint : t.ink }]}
				numberOfLines={1}
			>
				{label}
			</Text>
			<ChevronDown size={18} color={t.sub} />
		</View>
	);

	if (inert) return <>{trigger}</>;

	return (
		<MenuView
			title={title}
			onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
			actions={options.map((o) => ({
				id: o.value,
				title: o.label,
				state: o.value === value ? "on" : "off",
			}))}
		>
			{trigger}
		</MenuView>
	);
}

const styles = StyleSheet.create({
	select: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 14,
		paddingVertical: 14,
	},
	selectText: {
		flex: 1,
		fontSize: type.h4,
		fontFamily: fontFamily.regular,
		marginRight: 8,
	},
});
