import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { fontFamily, tokens } from "@/lib/theme";

// Progress loader ~46px above the safe-area bottom: a 120x4 pill track with a
// blue→green gradient fill animating width 0→100%. The fill timing
// (1250ms delay + 2100ms duration = 3350ms = FLOOR_MS) means the bar completes
// exactly at the dismissal floor. Loader container fades up (delay 1150ms).
// Reduced-motion: fill shown full immediately, no fade.
export function ProgressLoader() {
	const reduceMotion = useReducedMotion();
	const insets = useSafeAreaInsets();

	const fill = useSharedValue(reduceMotion ? 1 : 0);
	const appear = useSharedValue(reduceMotion ? 1 : 0);

	useEffect(() => {
		if (reduceMotion) return;
		fill.value = withDelay(
			1250,
			withTiming(1, { duration: 2100, easing: Easing.bezier(0.5, 0, 0.2, 1) })
		);
		appear.value = withDelay(
			1150,
			withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) })
		);
	}, [reduceMotion, fill, appear]);

	const containerStyle = useAnimatedStyle(() => ({ opacity: appear.value }));
	const fillStyle = useAnimatedStyle(() => ({
		width: `${fill.value * 100}%`,
	}));

	return (
		<Animated.View
			pointerEvents="none"
			style={[styles.loader, { bottom: insets.bottom + 46 }, containerStyle]}
		>
			<View style={styles.track}>
				<Animated.View style={[styles.fill, fillStyle]}>
					<LinearGradient
						colors={[tokens.brand, tokens.success]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={StyleSheet.absoluteFill}
					/>
				</Animated.View>
			</View>
			<Text style={styles.micro}>GETTING SET UP</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	loader: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
		gap: 12,
	},
	track: {
		width: 120,
		height: 4,
		borderRadius: 99,
		backgroundColor: "rgba(255,255,255,0.28)",
		overflow: "hidden",
	},
	fill: {
		height: "100%",
		borderRadius: 99,
		overflow: "hidden",
	},
	micro: {
		fontSize: 11,
		fontFamily: fontFamily.bold,
		letterSpacing: 1.6,
		color: "rgba(255,255,255,0.8)",
		textShadowColor: "rgba(4,11,24,0.6)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 6,
	},
});
