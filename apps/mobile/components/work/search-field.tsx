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
	/**
	 * Handle on the TextInput so the owner can focus it (the header magnifier
	 * jumps here). NOT named `ref`: a plain prop keeps this a normal component
	 * and sidesteps the forwardRef/`ref`-prop footgun.
	 */
	inputRef?: React.RefObject<TextInput | null>;
}

/** iPad pane search field — a web-styled input (white, 1px `input` border, 4px
 * radius, 40 tall). The phone has no equivalent; its composer is the search bar. */
export function SearchField({
	value,
	onChangeText,
	placeholder = "Search everything",
	label = "Search work",
	inputRef,
}: SearchFieldProps) {
	const t = useTokens();

	return (
		<View style={[styles.bar, { backgroundColor: t.card, borderColor: t.input }]}>
			<Search size={16} color={t.faint} />
			<TextInput
				ref={inputRef}
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
					// Painted box is 26 wide but fills the 40pt bar height; hitSlop
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
		height: 40,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderRadius: radii.ctrl,
	},
	input: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
		paddingVertical: 0,
	},
	clear: {
		width: 26,
		minHeight: touch.min,
		alignItems: "center",
		justifyContent: "center",
	},
});
