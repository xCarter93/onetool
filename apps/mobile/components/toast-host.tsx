import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleCheck } from "lucide-react-native";
import { useToast } from "@/lib/toast";
import { fontFamily, frame } from "@/lib/theme";

const ENTER = FadeInUp.duration(180);
const EXIT = FadeOutUp.duration(140);

export function ToastHost() {
	const toast = useToast();
	const insets = useSafeAreaInsets();
	const reduced = useReducedMotion();
	return (
		<View pointerEvents="none" style={[styles.host, { top: insets.top + 6 }]}>
			{toast ? (
				<Animated.View
					key={toast.id}
					entering={reduced ? undefined : ENTER}
					exiting={reduced ? undefined : EXIT}
					style={styles.toast}
					accessibilityLiveRegion="polite"
					accessibilityRole="alert"
				>
					<CircleCheck size={16} color={frame.railSuccess} strokeWidth={2.2} />
					<Text style={styles.text} numberOfLines={2}>
						{toast.message}
					</Text>
				</Animated.View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	host: {
		position: "absolute",
		left: 16,
		right: 16,
		alignItems: "center",
		zIndex: 100,
	},
	toast: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		maxWidth: 420,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: frame.railRaised,
		borderWidth: 1,
		borderColor: frame.railBorder,
		boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
	},
	text: {
		flexShrink: 1,
		fontFamily: fontFamily.medium,
		fontSize: 13.5,
		color: frame.railText,
	},
});
