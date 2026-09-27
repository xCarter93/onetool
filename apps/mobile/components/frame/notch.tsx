import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { fontFamily, frame } from "@/lib/theme";

export type NotchContent =
	| { kind: "label"; text: string; icon?: LucideIcon }
	| { kind: "crumb"; parent: string; title: string };

/** Top padding a canvas screen needs so its first line clears the notch. */
export const NOTCH_CLEARANCE = frame.notchHeight + 12;

const W = frame.notchCurve;
const H = frame.notchHeight;

/** Rail-colored tab hanging into the top of the canvas; says where you are. */
export function Notch({ content }: { content: NotchContent }) {
	const label =
		content.kind === "crumb"
			? `${content.parent}, ${content.title}`
			: content.text;
	return (
		<View style={styles.wrap} pointerEvents="none" accessibilityRole="header" accessibilityLabel={label}>
			<Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
				<Path d={`M0 0C${W / 2} 0 ${W / 2} ${H} ${W} ${H}V0Z`} fill={frame.rail} />
			</Svg>
			<View style={styles.body}>
				{content.kind === "crumb" ? (
					<>
						<Text style={styles.parent} numberOfLines={1}>
							{content.parent}
						</Text>
						<ChevronRight size={11} color={frame.railMuted} strokeWidth={2.2} />
						<Text style={styles.title} numberOfLines={1}>
							{content.title}
						</Text>
					</>
				) : (
					<>
						{content.icon ? (
							<content.icon size={13} color={frame.railAccent} strokeWidth={2} />
						) : null}
						<Text style={styles.title} numberOfLines={1}>
							{content.text}
						</Text>
					</>
				)}
			</View>
			<Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
				<Path d={`M${W} 0C${W / 2} 0 ${W / 2} ${H} 0 ${H}V0Z`} fill={frame.rail} />
			</Svg>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		top: -1,
		alignSelf: "center",
		flexDirection: "row",
		height: H,
		zIndex: 3,
	},
	body: {
		backgroundColor: frame.rail,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 2,
		paddingBottom: 1,
		maxWidth: 240,
	},
	parent: {
		fontFamily: fontFamily.medium,
		fontSize: 12,
		color: frame.railMuted,
		flexShrink: 1,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
		color: frame.railText,
		flexShrink: 1,
	},
});
