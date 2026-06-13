import { StyleSheet, View } from "react-native";
import Svg, {
	Circle,
	Defs,
	LinearGradient,
	Pattern,
	Rect,
	Stop,
} from "react-native-svg";

// Static tonal scrim + halftone grain (no motion — same SVG technique as
// components/ui/halftone-bg.tsx). Scrim: navy top wash → transparent middle →
// navy bottom for depth. Grain: white dot pattern at ~0.16 opacity.
export function LaunchScrim() {
	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill}>
			<Svg width="100%" height="100%" preserveAspectRatio="none">
				<Defs>
					<LinearGradient id="launchScrim" x1="0" y1="0" x2="0" y2="1">
						<Stop offset="0%" stopColor="#081222" stopOpacity={0.2} />
						<Stop offset="26%" stopColor="#081222" stopOpacity={0} />
						<Stop offset="54%" stopColor="#081222" stopOpacity={0} />
						<Stop offset="100%" stopColor="#060c18" stopOpacity={0.55} />
					</LinearGradient>
					<Pattern
						id="launchGrain"
						width={5}
						height={5}
						patternUnits="userSpaceOnUse"
					>
						<Circle cx={1} cy={1} r={0.6} fill="#ffffff" />
					</Pattern>
				</Defs>
				<Rect width="100%" height="100%" fill="url(#launchScrim)" />
				<Rect
					width="100%"
					height="100%"
					fill="url(#launchGrain)"
					opacity={0.16}
				/>
			</Svg>
		</View>
	);
}
