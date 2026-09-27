import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { Plus, Search, Sparkles, X } from "lucide-react-native";
import { fontFamily, frame } from "@/lib/theme";
import {
	registerComposerInput,
	type ComposerSearch,
	type TrayAction,
} from "@/lib/shell-chrome";

export interface CreateMenuItem {
	key: string;
	label: string;
	symbol: MenuAction["image"];
	run: () => void;
}

function AssistantButton({ onPress }: { onPress: () => void }) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel="Ask the assistant"
			style={({ pressed }) => [styles.square, pressed && styles.pressed]}
		>
			<Sparkles size={18} color={frame.railAccent} strokeWidth={2} />
		</Pressable>
	);
}

function CreateButton({ items }: { items: CreateMenuItem[] }) {
	if (items.length === 0) return null;
	return (
		<MenuView
			title="Create"
			onPressAction={({ nativeEvent }) =>
				items.find((i) => i.key === nativeEvent.event)?.run()
			}
			actions={items.map((i) => ({ id: i.key, title: i.label, image: i.symbol }))}
		>
			<View
				style={styles.square}
				accessible
				accessibilityRole="button"
				accessibilityLabel="Create"
			>
				<Plus size={20} color={frame.railText} strokeWidth={2.2} />
			</View>
		</MenuView>
	);
}

/**
 * Tab-root tier: search, assistant and create. With `search` bound the field is
 * a live input (Work); otherwise it jumps to Work with the field focused.
 */
export function Composer({
	search,
	onSearchPress,
	onAssistant,
	createItems,
	onFocusChange,
}: {
	search?: ComposerSearch;
	onSearchPress: () => void;
	onAssistant: () => void;
	createItems: CreateMenuItem[];
	onFocusChange?: (focused: boolean) => void;
}) {
	const placeholder = search?.placeholder ?? "Search clients, quotes, invoices…";
	return (
		<View style={styles.tier}>
			{search ? (
				<View style={[styles.field, styles.fieldLive]}>
					<Search size={17} color={frame.railMuted} strokeWidth={2} />
					<TextInput
						ref={registerComposerInput}
						value={search.value}
						onChangeText={search.onChangeText}
						placeholder={placeholder}
						placeholderTextColor={frame.railMuted}
						selectionColor={frame.railAccent}
						style={styles.input}
						returnKeyType="search"
						autoCorrect={false}
						autoCapitalize="none"
						clearButtonMode="never"
						accessibilityLabel="Search"
						onFocus={() => onFocusChange?.(true)}
						onBlur={() => onFocusChange?.(false)}
					/>
					{search.value.length > 0 ? (
						<Pressable
							onPress={() => search.onChangeText("")}
							accessibilityRole="button"
							accessibilityLabel="Clear search"
							hitSlop={10}
						>
							<X size={16} color={frame.railMuted} strokeWidth={2} />
						</Pressable>
					) : null}
				</View>
			) : (
				<Pressable
					onPress={onSearchPress}
					accessibilityRole="search"
					accessibilityLabel="Search everything"
					style={({ pressed }) => [styles.field, pressed && styles.pressed]}
				>
					<Search size={17} color={frame.railMuted} strokeWidth={2} />
					<Text style={styles.placeholder} numberOfLines={1}>
						Search…
					</Text>
				</Pressable>
			)}
			<AssistantButton onPress={onAssistant} />
			<CreateButton items={createItems} />
		</View>
	);
}

/** Record tier: the first action is the filled primary, then up to two secondaries. */
export function ActionTray({
	actions,
	onRun,
	onAssistant,
}: {
	actions: TrayAction[];
	onRun: (key: string) => void;
	onAssistant: () => void;
}) {
	const [primary, ...rest] = actions;
	const press = (a: TrayAction) => {
		if (a.disabledReason) {
			Alert.alert(a.label, a.disabledReason);
			return;
		}
		onRun(a.key);
	};
	return (
		<View style={styles.tier}>
			{primary ? (
				<Pressable
					onPress={() => press(primary)}
					accessibilityRole="button"
					accessibilityLabel={primary.label}
					accessibilityState={{ disabled: !!primary.disabledReason }}
					style={({ pressed }) => [
						styles.primary,
						primary.disabledReason ? styles.disabled : null,
						pressed && styles.pressed,
					]}
				>
					<primary.icon size={16} color={frame.railAccentInk} strokeWidth={2.2} />
					<Text style={styles.primaryText} numberOfLines={1}>
						{primary.label}
					</Text>
				</Pressable>
			) : null}
			{rest.slice(0, 2).map((a) => (
				<Pressable
					key={a.key}
					onPress={() => press(a)}
					accessibilityRole="button"
					accessibilityLabel={a.label}
					accessibilityState={{ disabled: !!a.disabledReason }}
					style={({ pressed }) => [
						styles.secondary,
						a.disabledReason ? styles.disabled : null,
						pressed && styles.pressedRaised,
					]}
				>
					<a.icon size={16} color={frame.railText} strokeWidth={2} />
					<Text style={styles.secondaryText} numberOfLines={1}>
						{a.label}
					</Text>
				</Pressable>
			))}
			<AssistantButton onPress={onAssistant} />
		</View>
	);
}

const styles = StyleSheet.create({
	tier: {
		height: frame.tierHeight,
		flexDirection: "row",
		gap: 6,
	},
	field: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingLeft: 12,
		paddingRight: 12,
		borderRadius: 12,
		backgroundColor: frame.railRaised,
	},
	fieldLive: {
		borderWidth: 1,
		borderColor: frame.railBorder,
	},
	placeholder: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 15,
		color: frame.railMuted,
	},
	input: {
		flex: 1,
		height: "100%",
		fontFamily: fontFamily.regular,
		// 16px keeps iOS from zooming the field; web's mobile input rule.
		fontSize: 16,
		color: frame.railText,
	},
	square: {
		width: frame.tierHeight,
		height: frame.tierHeight,
		borderRadius: 12,
		backgroundColor: frame.railRaised,
		alignItems: "center",
		justifyContent: "center",
	},
	primary: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 10,
		backgroundColor: frame.railAccent,
		paddingHorizontal: 12,
	},
	primaryText: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: frame.railAccentInk,
		flexShrink: 1,
	},
	secondary: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minWidth: frame.tierHeight,
		paddingHorizontal: 13,
		borderRadius: 10,
		backgroundColor: frame.railRaised,
		flexShrink: 1,
	},
	secondaryText: {
		fontFamily: fontFamily.medium,
		fontSize: 13,
		color: frame.railText,
		flexShrink: 1,
	},
	disabled: {
		opacity: 0.45,
	},
	pressed: {
		opacity: 0.8,
	},
	pressedRaised: {
		backgroundColor: frame.railBorder,
	},
});
