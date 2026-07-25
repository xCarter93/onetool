import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

interface SearchFieldProps {
	value: string;
	onChangeText: (next: string) => void;
	placeholder?: string;
	/** Programmatic label — the magnifier glyph is decorative, not a label. */
	label?: string;
}

export function SearchField({
	value,
	onChangeText,
	placeholder = "Search clients, projects, quotes, invoices…",
	label = "Search work",
}: SearchFieldProps) {
	const t = useTokens();

	return (
		<View
			style={[styles.bar, { backgroundColor: t.card, borderColor: t.line }]}
		>
			<Search size={18} color={t.faint} />
			<TextInput
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={t.faint}
				style={[styles.input, { color: t.ink }]}
				accessibilityLabel={label}
				accessibilityHint="Results filter as you type"
				autoCorrect={false}
				autoCapitalize="none"
				returnKeyType="search"
				clearButtonMode="never"
			/>
			{value.length > 0 ? (
				<Pressable
					onPress={() => onChangeText("")}
					// Painted box is 26 wide but fills the 46pt bar height; hitSlop
					// widens it to 44 WITHOUT leaving the bar's bounds (RN does not
					// hit-test outside a parent).
					hitSlop={{ left: 4, right: 9 }}
					style={styles.clear}
					accessibilityRole="button"
					accessibilityLabel="Clear search"
				>
					<X size={16} color={t.sub} />
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		height: 46,
		paddingHorizontal: 13,
		borderWidth: 1,
		borderRadius: radii.ctrl,
	},
	input: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		paddingVertical: 0,
	},
	clear: {
		width: 26,
		minHeight: touch.min,
		alignItems: "center",
		justifyContent: "center",
	},
});
