import { useState, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { ChevronsUpDown } from "lucide-react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";

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
	const [size, setSize] = useState<{ width: number; height: number } | null>(null);
	// No menu to open when disabled or empty — render the trigger as an inert affordance.
	const inert = disabled || options.length === 0;

	const trigger = children ?? (
		<View
			accessibilityRole="button"
			accessibilityState={{ disabled: inert }}
			style={[
				styles.select,
				{
					borderColor: t.input,
					backgroundColor: t.card,
					opacity: inert ? 0.5 : 1,
				},
			]}
		>
			<Text
				style={[styles.selectText, { color: placeholder ? t.sub : t.ink }]}
				numberOfLines={1}
			>
				{label}
			</Text>
			<ChevronsUpDown size={16} color={t.sub} />
		</View>
	);

	if (inert) return <>{trigger}</>;

	// The trigger owns the layout and the menu host is overlaid on it. The host
	// sizes itself to its child, so the transparent anchor takes the trigger's
	// measured size; a flex anchor would collapse to 0x0 and swallow no taps.
	return (
		<View
			collapsable={false}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				if (width !== size?.width || height !== size?.height) setSize({ width, height });
			}}
		>
			{trigger}
			{size ? (
				<View style={StyleSheet.absoluteFill}>
					<MenuView
						title={title}
						onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
						actions={options.map((o) => ({
							id: o.value,
							title: o.label,
							state: o.value === value ? "on" : "off",
						}))}
					>
						<View style={size} />
					</MenuView>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	select: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		minHeight: 44,
	},
	selectText: {
		flex: 1,
		fontSize: 16,
		fontFamily: fontFamily.regular,
		marginRight: 8,
	},
});
