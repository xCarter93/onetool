import { useId, useState } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { tokens } from "@/lib/theme";

// Web parity: apps/web/src/app/globals.css `.workspace-canvas` — 22px grid, 1px-radius
// dot, dot color = --foreground at 12% alpha. No token is literally "foreground @ 12%",
// so this composites the closest token (tokens.ink, web's --foreground analog) with the
// same 12% alpha web uses via hex alpha suffix (same trick as tokens.frostedBg etc).
const DOT_COLOR = `${tokens.ink}1F`; // "1F" hex alpha ≈ 12%
const SPACING = 22; // pt — 1:1 with web's background-size (CSS px -> RN pt)
const DOT_RADIUS = 1; // pt — 1:1 with web's radial-gradient 1px stop

/**
 * Decorative dot-grid texture, ported from the web workspace canvas background.
 * Drop in as an absolutely-positioned first child of a screen root; fills its
 * parent by default.
 *
 * Renders nothing until it measures a non-zero box via onLayout, then draws the
 * <Svg> at those exact pixel dimensions (never "100%"/absoluteFill sizing) —
 * on Fabric, percentage/absolute sizing inside an indefinite-height parent
 * escapes to full-screen and `overflow: hidden` does not clip it (see the
 * headerHeight measurement in app-header.tsx for the prior incident).
 */
export function DotGrid({
	style,
	// Same 22px pitch everywhere; the ink command hero passes its white variant.
	color = DOT_COLOR,
}: {
	style?: StyleProp<ViewStyle>;
	color?: string;
}) {
	// useId() can contain ":" — not safe inside a `url(#id)` pattern reference.
	const rawId = useId();
	const patternId = `dotGrid${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
	const [size, setSize] = useState({ width: 0, height: 0 });

	const onLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		setSize({ width, height });
	};

	return (
		<View
			style={[{ flex: 1 }, style]}
			onLayout={onLayout}
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			{size.width > 0 && size.height > 0 ? (
				<Svg width={size.width} height={size.height}>
					<Defs>
						<Pattern
							id={patternId}
							x={0}
							y={0}
							width={SPACING}
							height={SPACING}
							patternUnits="userSpaceOnUse"
						>
							<Circle
								cx={SPACING / 2}
								cy={SPACING / 2}
								r={DOT_RADIUS}
								fill={color}
							/>
						</Pattern>
					</Defs>
					<Rect
						width={size.width}
						height={size.height}
						fill={`url(#${patternId})`}
					/>
				</Svg>
			) : null}
		</View>
	);
}
