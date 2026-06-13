import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

// Looping diagonal white light sweep — rgba(255,255,255,0.32), rotate 8deg,
// translating across the screen on a 4.6s loop after a 1.4s delay. Reduced-motion:
// not rendered at all (returns null).
export function LightSweep() {
	const reduceMotion = useReducedMotion();
	const { width } = useWindowDimensions();
	const t = useSharedValue(0);

	useEffect(() => {
		if (reduceMotion) return;
		t.value = withDelay(
			1400,
			withRepeat(
				withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.ease) }),
				-1,
				false
			)
		);
	}, [reduceMotion, t]);

	const bandWidth = width * 0.6;

	const style = useAnimatedStyle(() => {
		const from = -bandWidth;
		const to = width + bandWidth;
		// Fade in early in the travel, fade out near the end (mirrors the prototype
		// keyframes: opacity 0 → 1 by ~18% → 0 by ~55%).
		const opacity =
			t.value < 0.18
				? t.value / 0.18
				: t.value < 0.55
					? 1 - (t.value - 0.18) / 0.37
					: 0;
		return {
			opacity,
			transform: [{ translateX: from + (to - from) * t.value }, { rotate: "8deg" }],
		};
	});

	if (reduceMotion) return null;

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill}>
			<Animated.View style={[styles.band, { width: bandWidth }, style]}>
				<LinearGradient
					colors={[
						"rgba(255,255,255,0)",
						"rgba(255,255,255,0.32)",
						"rgba(255,255,255,0)",
					]}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 0 }}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	band: {
		position: "absolute",
		top: "-40%",
		height: "200%",
	},
});
