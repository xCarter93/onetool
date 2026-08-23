import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "@/lib/theme";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { AssistantHost } from "@/components/assistant/assistant-host";
import { AssistantInkHeader } from "@/components/assistant/ink-header";
import { buildScreenContext } from "@/lib/screen-context";

// Assistant sheet — the dock's assistant orb's destination (P3). The orb passes
// the path it was pressed over as `ctx`; iPad landscape gets an in-shell right
// panel instead (ipad-shell), this pushed route covers iPhone + iPad portrait.
export default function AssistantSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device, height } = useDevice();
	const { ctx } = useLocalSearchParams<{ ctx?: string }>();
	const screenContext = buildScreenContext(ctx);

	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="80%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					<AssistantInkHeader />
					<AssistantHost
						screenContext={screenContext}
						// Card is centered at 80% height (maxHeight above), so its bottom
						// edge sits 10% of the window above the screen bottom.
						keyboardBottomGap={Math.max(24, height * 0.1)}
					/>
				</View>
			</CenteredModal>
		);
	}

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom },
			]}
		>
			<AssistantInkHeader grabber />
			{/* The container already pads insets.bottom, so that's the gap between
			    the chat's bottom edge and the window bottom. */}
			<AssistantHost
				screenContext={screenContext}
				keyboardBottomGap={insets.bottom}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	padCard: {
		flex: 1,
		// The composer's disclaimer is the card's last line — without this it
		// sits flush against (and clips into) the rounded bottom edge.
		paddingBottom: 12,
	},
});
