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
	const { device } = useDevice();
	const { ctx } = useLocalSearchParams<{ ctx?: string }>();
	const screenContext = buildScreenContext(ctx);

	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="80%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					<AssistantInkHeader />
					<AssistantHost screenContext={screenContext} />
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
			<AssistantHost screenContext={screenContext} />
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
	},
});
