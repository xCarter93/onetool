import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

// Full-bleed BG.png with a slow Ken Burns push: scale 1.02→1.12, translateY 0→-10,
// ease-out, 16s. Reduced-motion: static scale 1.02, no translate.
export function KenBurnsBackground() {
	const reduceMotion = useReducedMotion();
	const t = useSharedValue(0);

	useEffect(() => {
		if (reduceMotion) return;
		t.value = withTiming(1, {
			duration: 16000,
			easing: Easing.out(Easing.quad),
		});
	}, [reduceMotion, t]);

	const style = useAnimatedStyle(() => ({
		transform: [
			{ scale: 1.02 + t.value * 0.1 },
			{ translateY: t.value * -10 },
		],
	}));

	return (
		<Animated.Image
			source={require("../../assets/BG.png")}
			style={[styles.image, style]}
			resizeMode="cover"
		/>
	);
}

const styles = StyleSheet.create({
	image: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: "100%",
		height: "100%",
	},
});
