import {
	ActionSheetIOS,
	Alert,
	Platform,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { MoreHorizontal } from "lucide-react-native";
import { radii, touch, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import type { ResolvedAction } from "@/lib/record-actions";

// Renders the status→CTA resolver's output: primary slot = the screen's one
// solid button, secondary = frosted, overflow behind •••. A disabled action
// stays visible and explains itself on tap (portal-reachability reasons) —
// the aligned "disable, don't hide" rule.
export function QuickActionRow({
	actions,
	onAction,
	/** Frame 1h pins the quote pair as a floating bar over the dock. */
	floating,
}: {
	actions: ResolvedAction[];
	onAction: (key: ResolvedAction["key"]) => void;
	floating?: boolean;
}) {
	const t = useTokens();
	const primary = actions.find((a) => a.slot === "primary");
	const secondary = actions.find((a) => a.slot === "secondary");
	const overflow = actions.filter((a) => a.slot === "overflow");

	if (!primary && !secondary && overflow.length === 0) return null;

	const fire = (action: ResolvedAction) => {
		if (action.disabled) {
			Alert.alert("Can't do that yet", action.disabledReason);
			return;
		}
		onAction(action.key);
	};

	const openOverflow = () => {
		if (overflow.length === 0) return;
		if (Platform.OS === "ios") {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: [...overflow.map((a) => a.label), "Cancel"],
					cancelButtonIndex: overflow.length,
				},
				(index) => {
					const action = overflow[index];
					if (action) fire(action);
				}
			);
		} else {
			Alert.alert("More actions", undefined, [
				...overflow.map((a) => ({
					text: a.label,
					onPress: () => fire(a),
				})),
				{ text: "Cancel", style: "cancel" as const },
			]);
		}
	};

	return (
		<View style={[styles.row, floating && styles.floating]}>
			{primary ? (
				<Button
					title={primary.label}
					variant="solid"
					onPress={() => fire(primary)}
					style={StyleSheet.flatten([
						styles.grow,
						{ opacity: primary.disabled ? 0.55 : 1 },
					])}
				/>
			) : null}
			{secondary ? (
				<Button
					title={secondary.label}
					variant="primary"
					blurred={floating}
					onPress={() => fire(secondary)}
					style={StyleSheet.flatten([
						styles.grow,
						{ opacity: secondary.disabled ? 0.55 : 1 },
					])}
				/>
			) : null}
			{overflow.length > 0 ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="More actions"
					onPress={openOverflow}
					style={({ pressed }) => [
						styles.more,
						{
							backgroundColor: pressed ? t.secondary : t.card,
							borderColor: t.line,
						},
					]}
				>
					<MoreHorizontal size={18} color={t.ink} />
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: 8,
	},
	floating: {
		boxShadow: "0 12px 32px rgba(15,30,40,.14)",
	},
	grow: {
		flex: 1,
	},
	more: {
		width: touch.min,
		minHeight: touch.min,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
