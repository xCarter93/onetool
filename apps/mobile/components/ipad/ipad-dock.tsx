import { Pressable, StyleSheet, Text, View } from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { Plus, Sparkles } from "lucide-react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import type { CreateMenuItem } from "@/components/frame/context-tier";

/** Web's assistant dock at the foot of the iPad canvas, with the create menu beside it. */
export function IpadDock({
	onAssistant,
	createItems,
}: {
	onAssistant: () => void;
	createItems: CreateMenuItem[];
}) {
	const t = useTokens();
	return (
		<View style={[styles.bar, { borderTopColor: t.line, backgroundColor: t.bg }]}>
			<Pressable
				onPress={onAssistant}
				accessibilityRole="button"
				accessibilityLabel="Ask the assistant"
				style={({ pressed }) => [
					styles.pill,
					{ backgroundColor: pressed ? t.muted : t.card, borderColor: t.line },
				]}
			>
				<View style={[styles.tile, { backgroundColor: t.frostedBg }]}>
					<Sparkles size={17} color={t.frostedInk} strokeWidth={2} />
				</View>
				<View style={styles.text}>
					<Text style={[styles.title, { color: t.ink }]}>Assistant</Text>
					<Text style={[styles.sub, { color: t.sub }]} numberOfLines={1}>
						Ask about your clients, schedule and quotes
					</Text>
				</View>
				<View style={[styles.chat, { borderColor: t.input }]}>
					<Text style={[styles.chatText, { color: t.ink }]}>Chat</Text>
				</View>
			</Pressable>
			{createItems.length > 0 ? (
				<MenuView
					title="Create"
					onPressAction={({ nativeEvent }) =>
						createItems.find((i) => i.key === nativeEvent.event)?.run()
					}
					actions={createItems.map((i) => ({ id: i.key, title: i.label, image: i.symbol }))}
				>
					<View
						style={[styles.plus, { backgroundColor: t.card, borderColor: t.line }]}
						accessible
						accessibilityRole="button"
						accessibilityLabel="Create"
					>
						<Plus size={20} color={t.ink} strokeWidth={2.2} />
					</View>
				</MenuView>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderTopWidth: 1,
	},
	pill: {
		flex: 1,
		maxWidth: 560,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 8,
		paddingLeft: 8,
		paddingRight: 8,
		borderRadius: radii.card,
		borderWidth: 1,
	},
	tile: {
		width: 36,
		height: 36,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	text: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: 12.5,
		marginTop: 1,
	},
	chat: {
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	chatText: {
		fontFamily: fontFamily.medium,
		fontSize: 13,
	},
	plus: {
		width: 54,
		height: 54,
		borderRadius: radii.card,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
