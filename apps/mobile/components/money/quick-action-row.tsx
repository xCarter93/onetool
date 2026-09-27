import { Alert, StyleSheet, View } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { MoreHorizontal } from "lucide-react-native";
import { radii, touch, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import type { ResolvedAction } from "@/lib/record-actions";

// A disabled action stays visible and explains itself on tap (portal-
// reachability reasons) — the aligned "disable, don't hide" rule.
function fireAction(action: ResolvedAction, onAction: (key: ResolvedAction["key"]) => void) {
	if (action.disabled) {
		Alert.alert("Can't do that yet", action.disabledReason);
		return;
	}
	onAction(action.key);
}

// Native overflow menu for a resolver action list. The SwiftUI host sizes
// itself to its child, so the child must have a fixed size.
export function OverflowMenuButton({
	actions,
	onAction,
	title,
}: {
	actions: ResolvedAction[];
	onAction: (key: ResolvedAction["key"]) => void;
	title?: string;
}) {
	const t = useTokens();
	if (actions.length === 0) return null;
	return (
		<View style={styles.more}>
			<MenuView
				title={title}
				onPressAction={({ nativeEvent }) => {
					const action = actions.find((a) => a.key === nativeEvent.event);
					if (action) fireAction(action, onAction);
				}}
				actions={actions.map((a) => ({ id: a.key, title: a.label }))}
			>
				<View
					style={[styles.moreFace, { backgroundColor: t.card, borderColor: t.line }]}
					accessible
					accessibilityRole="button"
					accessibilityLabel={title ?? "More actions"}
				>
					<MoreHorizontal size={18} color={t.ink} />
				</View>
			</MenuView>
		</View>
	);
}

// Renders the status→CTA resolver's output inline: primary slot = the
// screen's one solid button, secondary = outline, overflow behind •••. Used
// in iPad pane mode, where every action stays in the body (the phone tray
// takes over primary/secondary and the header "…" menu takes overflow).
export function QuickActionRow({
	actions,
	onAction,
}: {
	actions: ResolvedAction[];
	onAction: (key: ResolvedAction["key"]) => void;
}) {
	const primary = actions.find((a) => a.slot === "primary");
	const secondary = actions.find((a) => a.slot === "secondary");
	const overflow = actions.filter((a) => a.slot === "overflow");

	if (!primary && !secondary && overflow.length === 0) return null;

	return (
		<View style={styles.row}>
			{primary ? (
				<Button
					title={primary.label}
					variant="solid"
					onPress={() => fireAction(primary, onAction)}
					style={StyleSheet.flatten([
						styles.grow,
						{ opacity: primary.disabled ? 0.55 : 1 },
					])}
				/>
			) : null}
			{secondary ? (
				<Button
					title={secondary.label}
					variant="secondary"
					onPress={() => fireAction(secondary, onAction)}
					style={StyleSheet.flatten([
						styles.grow,
						{ opacity: secondary.disabled ? 0.55 : 1 },
					])}
				/>
			) : null}
			<OverflowMenuButton actions={overflow} onAction={onAction} />
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: 8,
	},
	grow: {
		flex: 1,
	},
	more: {
		width: touch.min,
		height: touch.min,
		alignSelf: "center",
	},
	moreFace: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
