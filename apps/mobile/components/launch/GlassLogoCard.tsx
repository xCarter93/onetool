import { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
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

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// Frosted glass card holding the OneTool logo + the two-line tagline beneath it.
// Card entrance: opacity 0→1, translateY 18→0, scale 0.94→1, 1s, delay 350ms.
// Tagline entrance: opacity 0→1, translateY 10→0, 800ms, delay 950ms.
// Reduced-motion: everything renders at final state immediately; the BlurView is
// swapped for a flat rgba fill (RESEARCH Pitfall 5).
export function GlassLogoCard() {
	const reduceMotion = useReducedMotion();
	const { device } = useDevice();
	const isPad = device === "ipad";
	const card = useSharedValue(reduceMotion ? 1 : 0);
	const tag = useSharedValue(reduceMotion ? 1 : 0);

	useEffect(() => {
		if (reduceMotion) return;
		card.value = withDelay(
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
	}, [reduceMotion, card, tag]);

	const cardStyle = useAnimatedStyle(() => ({
		opacity: card.value,
		transform: [
			{ translateY: 18 - card.value * 18 },
			{ scale: 0.94 + card.value * 0.06 },
		],
	}));

	const tagStyle = useAnimatedStyle(() => ({
		opacity: tag.value,
		transform: [{ translateY: 10 - tag.value * 10 }],
	}));

	return (
		<View style={[styles.stage, isPad && styles.stagePad]}>
			{reduceMotion ? (
				<Animated.View style={[styles.card, styles.cardFlat, cardStyle]}>
					<Image
						source={require("../../assets/OneTool.png")}
						style={styles.logo}
						resizeMode="contain"
					/>
				</Animated.View>
			) : (
				<AnimatedBlurView
					intensity={28}
					tint="light"
					style={[styles.card, cardStyle]}
				>
					<Image
						source={require("../../assets/OneTool.png")}
						style={styles.logo}
						resizeMode="contain"
					/>
				</AnimatedBlurView>
			)}
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
	// iPad: confine the brand card to a contained element instead of stretching
	// across the large canvas. width:100% + maxWidth keeps the card/logo
	// proportional; alignSelf centers it. iPhone keeps the unbounded stage above.
	stagePad: {
		maxWidth: 420,
		alignSelf: "center",
	},
	card: {
		width: "100%",
		borderRadius: 24,
		paddingVertical: 30,
		paddingHorizontal: 26,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.5)",
		boxShadow: "0 18px 40px -14px rgba(3,17,37,0.55)",
	},
	cardFlat: {
		backgroundColor: "rgba(255,255,255,0.82)",
	},
	logo: {
		width: "100%",
		height: undefined,
		aspectRatio: 1536 / 1024,
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
