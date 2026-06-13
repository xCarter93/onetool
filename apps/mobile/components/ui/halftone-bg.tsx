import React from "react";
import {
	Image,
	StyleSheet,
	View,
	useWindowDimensions,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import Svg, {
	Defs,
	LinearGradient,
	Rect,
	Stop,
} from "react-native-svg";

interface HalftoneBgProps {
	brand?: number;
	children?: React.ReactNode;
	imageFit?: "cover" | "width";
	imageOffsetTop?: number;
	style?: StyleProp<ViewStyle>;
}

const BG_ASPECT_RATIO = 1264 / 842;
const FADE_COLOR = "#f5f7f9";

type FadeStop = {
	offset: string;
	opacity: number;
};

function FadeLayer({
	id,
	style,
	stops,
}: {
	id: string;
	style: StyleProp<ViewStyle>;
	stops: FadeStop[];
}) {
	return (
		<View pointerEvents="none" style={style}>
			<Svg width="100%" height="100%" preserveAspectRatio="none">
				<Defs>
					<LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
						{stops.map((stop) => (
							<Stop
								key={stop.offset}
								offset={stop.offset}
								stopColor={FADE_COLOR}
								stopOpacity={stop.opacity}
							/>
						))}
					</LinearGradient>
				</Defs>
				<Rect width="100%" height="100%" fill={`url(#${id})`} />
			</Svg>
		</View>
	);
}

export function HalftoneBg({
	brand = 0.6,
	children,
	imageFit = "cover",
	imageOffsetTop = 0,
	style,
}: HalftoneBgProps) {
	const { width } = useWindowDimensions();
	const imageOpacity = 0.3 + brand * 0.45;
	const fitWidthImageHeight = width / BG_ASPECT_RATIO;
	const fitWidthStyle =
		imageFit === "width"
			? {
					top: imageOffsetTop,
					width,
					height: fitWidthImageHeight,
				}
			: null;
	const bottomFadeStyle =
		imageFit === "width"
			? [
					styles.bottomFade,
					{
						top: imageOffsetTop + fitWidthImageHeight * 0.42,
						height: fitWidthImageHeight * 0.58,
					},
				]
			: styles.bottomFade;

	return (
		<View style={[styles.root, style]}>
			<Image
				source={require("../../assets/BG.png")}
				style={[
					imageFit === "width" ? styles.fitWidthImage : StyleSheet.absoluteFill,
					fitWidthStyle,
					{ opacity: imageOpacity },
				]}
				resizeMode={imageFit === "width" ? "contain" : "cover"}
			/>
			<FadeLayer
				id="halftoneScrim"
				style={StyleSheet.absoluteFill}
				stops={[
					{ offset: "0%", opacity: 0.08 },
					{ offset: "58%", opacity: 0.2 },
					{ offset: "100%", opacity: 0.28 },
				]}
			/>
			<FadeLayer
				id="halftoneBottomFade"
				style={bottomFadeStyle}
				stops={[
					{ offset: "0%", opacity: 0 },
					{ offset: "38%", opacity: 0.62 },
					{ offset: "76%", opacity: 0.96 },
					{ offset: "100%", opacity: 1 },
				]}
			/>
			<View style={styles.content}>{children}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		position: "relative",
		overflow: "hidden",
	},
	fitWidthImage: {
		position: "absolute",
		left: 0,
	},
	bottomFade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 220,
	},
	content: {
		flex: 1,
	},
});
