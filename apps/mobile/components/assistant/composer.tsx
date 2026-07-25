import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowUp } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

const PROMPT_MAX_LENGTH = 4000;

interface ComposerProps {
	value: string;
	onChangeText: (text: string) => void;
	onSend: () => void;
	disabled: boolean;
}

/** Multiline text input + send button — matches the frosted primary treatment. */
export function Composer({ value, onChangeText, onSend, disabled }: ComposerProps) {
	const t = useTokens();
	const [focused, setFocused] = useState(false);
	const canSend = value.trim().length > 0 && !disabled;

	return (
		<View style={styles.wrap}>
			<View
				style={[
					styles.field,
					{
						borderColor: focused ? t.frostedBorder : t.line,
						backgroundColor: t.card,
					},
				]}
			>
				<TextInput
					value={value}
					onChangeText={onChangeText}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					placeholder="Ask about your business…"
					placeholderTextColor={t.faint}
					multiline
					maxLength={PROMPT_MAX_LENGTH}
					style={[styles.input, { color: t.ink }]}
				/>
				<Pressable
					onPress={canSend ? onSend : undefined}
					disabled={!canSend}
					accessibilityRole="button"
					accessibilityLabel="Send message"
					style={[
						styles.sendButton,
						{ backgroundColor: canSend ? t.primarySolid : t.secondary },
					]}
				>
					<ArrowUp size={18} color={canSend ? "#ffffff" : t.faint} strokeWidth={2.4} />
				</Pressable>
			</View>
			<Text style={[styles.disclaimer, { color: t.faint }]}>
				The assistant can make changes you ask for — double-check anything important.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		paddingHorizontal: 14,
		paddingTop: 8,
	},
	field: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.card,
		paddingLeft: 14,
		paddingRight: 6,
		paddingVertical: 6,
	},
	input: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		maxHeight: 110,
		paddingVertical: 8,
	},
	sendButton: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	disclaimer: {
		fontFamily: fontFamily.regular,
		fontSize: type.xs,
		textAlign: "center",
		marginTop: 6,
	},
});
