import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fontFamily } from "@/lib/theme";

interface ProgressRingProps {
	percentage: number;
	size?: number;
	strokeWidth?: number;
	color?: string;
	backgroundColor?: string;
	showPercentage?: boolean;
	label?: string;
	sublabel?: string;
}

export function ProgressRing({
	percentage,
	size = 120,
	strokeWidth = 10,
	color = colors.primary,
	backgroundColor = colors.muted,
	showPercentage = true,
	label,
	sublabel,
}: ProgressRingProps) {
	const radius = (size - strokeWidth) / 2;
	const circumference = radius * 2 * Math.PI;
	const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
	const strokeDashoffset =
		circumference - (clampedPercentage / 100) * circumference;

	return (
		<View style={[styles.container, { width: size, height: size }]}>
			<Svg width={size} height={size} style={styles.svg}>
				{/* Background circle */}
				<Circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke={backgroundColor}
					strokeWidth={strokeWidth}
					fill="transparent"
				/>
				{/* Progress circle */}
				<Circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke={color}
					strokeWidth={strokeWidth}
					fill="transparent"
					strokeDasharray={circumference}
					strokeDashoffset={strokeDashoffset}
					strokeLinecap="round"
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
				/>
			</Svg>
			<View style={styles.content}>
				{showPercentage && (
					<Text style={styles.percentage}>
						{Math.round(clampedPercentage)}%
					</Text>
				)}
				{label && <Text style={styles.label}>{label}</Text>}
				{sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "relative",
		alignItems: "center",
		justifyContent: "center",
	},
	svg: {
		position: "absolute",
	},
	content: {
		alignItems: "center",
		justifyContent: "center",
	},
	percentage: {
		fontSize: 21,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
	},
	label: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
		marginTop: 2,
	},
	sublabel: {
		fontSize: 10,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 1,
	},
});
