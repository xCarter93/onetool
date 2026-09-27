import React from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { X } from "lucide-react-native";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { TypeTile } from "@/components/canvas";
import { useDevice } from "@/lib/use-device";
import { fontFamily, radii, type RecordKind, useTokens } from "@/lib/theme";

/**
 * One layout for every create/edit route sheet: tile + title + close, a
 * scrolling form, and a footer pinned above the keyboard. iPhone presents it as
 * a native formSheet (root stack options), iPad as a centered card.
 */
export function CreateSheet({
	kind,
	title,
	subtitle,
	onClose,
	footer,
	children,
	overlay,
}: {
	kind?: RecordKind;
	title: string;
	subtitle?: string;
	onClose: () => void;
	footer?: React.ReactNode;
	children: React.ReactNode;
	/** In-sheet overlays (date pickers) that must sit above the form. */
	overlay?: React.ReactNode;
}) {
	const t = useTokens();
	const { device } = useDevice();
	const insets = useSafeAreaInsets();
	const pad = device === "ipad";

	const body = (
		<KeyboardAvoidingView behavior="padding" style={styles.flex}>
			<View style={[styles.header, { borderBottomColor: t.line }]}>
				{kind ? <TypeTile kind={kind} size={36} /> : null}
				<View style={styles.headerText}>
					<Text style={[styles.title, { color: t.ink }]} accessibilityRole="header" numberOfLines={1}>
						{title}
					</Text>
					{subtitle ? (
						<Text style={[styles.subtitle, { color: t.sub }]} numberOfLines={1}>
							{subtitle}
						</Text>
					) : null}
				</View>
				<Pressable
					onPress={onClose}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Close"
					style={({ pressed }) => [styles.close, pressed && { backgroundColor: t.secondary }]}
				>
					<X size={20} color={t.sub} strokeWidth={2} />
				</Pressable>
			</View>
			<ScrollView
				style={styles.flex}
				contentContainerStyle={styles.body}
				keyboardShouldPersistTaps="handled"
			>
				{children}
			</ScrollView>
			{footer ? (
				<View
					style={[
						styles.footer,
						{
							borderTopColor: t.line,
							backgroundColor: t.card,
							paddingBottom: pad ? 16 : Math.max(insets.bottom, 12),
						},
					]}
				>
					{footer}
				</View>
			) : null}
			{overlay}
		</KeyboardAvoidingView>
	);

	if (pad) {
		return (
			<CenteredModal onScrimPress={onClose} maxHeight="88%">
				<View style={[styles.flex, styles.padCard, { backgroundColor: t.card }]}>{body}</View>
			</CenteredModal>
		);
	}

	return (
		<View style={[styles.flex, styles.phone, { backgroundColor: t.card }]}>
			<View style={[styles.grabber, { backgroundColor: t.line }]} />
			{body}
		</View>
	);
}

/** Web form field: 12/600 sentence-case label above the control, optional hint or error below. */
export function SheetField({
	label,
	hint,
	error,
	children,
	style,
}: {
	label: string;
	hint?: string;
	error?: string | null;
	children: React.ReactNode;
	style?: object;
}) {
	const t = useTokens();
	return (
		<View style={[styles.field, style]}>
			<Text style={[styles.label, { color: t.ink }]}>{label}</Text>
			{children}
			{error ? (
				<Text style={[styles.hint, { color: t.danger }]}>{error}</Text>
			) : hint ? (
				<Text style={[styles.hint, { color: t.sub }]}>{hint}</Text>
			) : null}
		</View>
	);
}

/** 16px text keeps iOS from zooming; 44px tall; border in the `input` token. */
export const SheetInput = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(
	function SheetInput({ style, invalid, multiline, ...rest }, ref) {
		const t = useTokens();
		return (
			<TextInput
				ref={ref}
				placeholderTextColor={t.sub}
				multiline={multiline}
				textAlignVertical={multiline ? "top" : "center"}
				style={[
					styles.input,
					multiline && styles.multiline,
					{ borderColor: invalid ? t.danger : t.input, backgroundColor: t.card, color: t.ink },
					style,
				]}
				{...rest}
			/>
		);
	},
);

/** Footer row: buttons share the width. */
export function SheetActions({ children }: { children: React.ReactNode }) {
	return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	phone: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	padCard: {
		borderRadius: 8,
		overflow: "hidden",
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: 2,
		marginTop: 8,
		marginBottom: 2,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 14,
		borderBottomWidth: 1,
	},
	headerText: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 18,
	},
	subtitle: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 1,
	},
	close: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	body: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 24,
		gap: 16,
	},
	footer: {
		borderTopWidth: 1,
		paddingHorizontal: 16,
		paddingTop: 12,
	},
	actions: {
		flexDirection: "row",
		gap: 8,
	},
	field: {
		gap: 6,
	},
	label: {
		fontFamily: fontFamily.semibold,
		fontSize: 12.5,
	},
	hint: {
		fontFamily: fontFamily.regular,
		fontSize: 12.5,
	},
	input: {
		minHeight: 44,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontFamily: fontFamily.regular,
		fontSize: 16,
		// RN#42589: pin kern so the iOS placeholder can't randomly letter-space.
		letterSpacing: 0,
	},
	multiline: {
		minHeight: 88,
	},
});
