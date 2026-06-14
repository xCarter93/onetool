import { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { fontFamily } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

// OneTool logo + two-line tagline on the launch overlay. No frosted-glass card —
// the bare logo animates in over the KenBurns backdrop.
// Logo entrance: opacity 0→1, translateY 18→0, scale 0.94→1, 1s, delay 350ms.
// Tagline entrance: opacity 0→1, translateY 10→0, 800ms, delay 950ms.
// Reduced-motion: everything renders at final state immediately.
export function GlassLogoCard() {
	const reduceMotion = useReducedMotion();
	const { device } = useDevice();
	const isPad = device === "ipad";
	const logo = useSharedValue(reduceMotion ? 1 : 0);
	const tag = useSharedValue(reduceMotion ? 1 : 0);

	useEffect(() => {
		if (reduceMotion) return;
		logo.value = withDelay(
			350,
			withTiming(1, {
				duration: 1000,
				easing: Easing.bezier(0.18, 0.9, 0.25, 1.05),
			})
		);
		tag.value = withDelay(
			950,
			withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) })
		);
	}, [reduceMotion, logo, tag]);

	const logoStyle = useAnimatedStyle(() => ({
		opacity: logo.value,
		transform: [
			{ translateY: 18 - logo.value * 18 },
			{ scale: 0.94 + logo.value * 0.06 },
		],
	}));

	const tagStyle = useAnimatedStyle(() => ({
		opacity: tag.value,
		transform: [{ translateY: 10 - tag.value * 10 }],
	}));

	return (
		<View style={[styles.stage, isPad && styles.stagePad]}>
			<Animated.View style={[styles.logoWrap, logoStyle]}>
				<Image
					source={require("../../assets/OneTool-wordmark.png")}
					style={styles.logo}
					resizeMode="contain"
				/>
			</Animated.View>
			<Animated.View style={tagStyle}>
				<Text style={styles.tagline}>
					One tool.{"\n"}
					<Text style={styles.taglineBold}>Everything connected.</Text>
				</Text>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	stage: {
		alignItems: "center",
		gap: 22,
		paddingHorizontal: 28,
		width: "100%",
	},
	// iPad: confine the brand lockup to a contained element instead of stretching
	// across the large canvas. width:100% + maxWidth keeps the logo proportional;
	// alignSelf centers it. iPhone keeps the unbounded stage above.
	stagePad: {
		maxWidth: 420,
		alignSelf: "center",
	},
	// Horizontal inset preserves the logo's prior on-screen size now that the
	// card padding is gone.
	logoWrap: {
		width: "100%",
		paddingHorizontal: 26,
	},
	logo: {
		width: "100%",
		height: undefined,
		aspectRatio: 908 / 237,
	},
	tagline: {
		textAlign: "center",
		color: "#f3f8ff",
		fontSize: 15,
		lineHeight: 22,
		fontFamily: fontFamily.regular,
		textShadowColor: "rgba(4,11,24,0.6)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 10,
	},
	taglineBold: {
		fontFamily: fontFamily.bold,
		color: "#f3f8ff",
	},
});
