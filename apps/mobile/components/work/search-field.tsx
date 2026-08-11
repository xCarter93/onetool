import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { fontFamily, hero, radii, touch, type, useTokens } from "@/lib/theme";

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
	/** Frosted-on-ink palette for the tab-root ink band. */
	onInk?: boolean;
}

export function SearchField({
	value,
	onChangeText,
	placeholder = "Search everything",
	label = "Search work",
	inputRef,
	onInk = false,
}: SearchFieldProps) {
	const t = useTokens();
	const bar = onInk
		? { backgroundColor: hero.cellBg, borderColor: hero.cellBorder }
		: { backgroundColor: t.card, borderColor: t.line };
	const glyph = onInk ? hero.textSub : t.faint;

	return (
		<View style={[styles.bar, bar]}>
			<Search size={18} color={glyph} />
			<TextInput
				ref={inputRef}
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={glyph}
				style={[styles.input, { color: onInk ? hero.text : t.ink }]}
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
					<X size={16} color={onInk ? hero.textMid : t.sub} />
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
