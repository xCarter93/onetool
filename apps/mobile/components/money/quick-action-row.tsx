import { useRef } from "react";
import {
	ActionSheetIOS,
	Alert,
	findNodeHandle,
	Platform,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { BlurView } from "expo-blur";
import { MoreHorizontal } from "lucide-react-native";
import { dock, radii, touch, useTokens } from "@/lib/theme";
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
	// iPad presents the sheet as a popover; unanchored, iOS pops it from the
	// screen centre with no dim (same fix as the rail's ＋ in pad-sidebar).
	const moreAnchor = useRef<View>(null);
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
					anchor: findNodeHandle(moreAnchor.current) ?? undefined,
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

	// No shadow on the floating bar: a box-shadow on the (transparent) row
	// renders a soft plate across the whole bar's bounds — over the dot canvas
	// it reads as a background blocking the texture (visual pass round 2). The
	// pills carry their own fills; the canvas shows through the gaps.
	return (
		<View style={styles.row}>
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
					ref={moreAnchor}
					accessibilityRole="button"
					accessibilityLabel="More actions"
					onPress={openOverflow}
					style={({ pressed }) => [
						styles.more,
						// Floating bar: glass like the dock, so the dot grid reads
						// through it (frame 1h) — an opaque plate looks like a hole
						// in the canvas texture. Inline bars stay card-colored.
						floating
							? {
									backgroundColor: pressed ? t.secondary : dock.bg,
									borderColor: dock.border,
									overflow: "hidden" as const,
								}
							: {
									backgroundColor: pressed ? t.secondary : t.card,
									borderColor: t.line,
								},
					]}
				>
					{floating ? (
						<BlurView
							intensity={dock.blur}
							tint="light"
							style={StyleSheet.absoluteFill}
							pointerEvents="none"
						/>
					) : null}
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
