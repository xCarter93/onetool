import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface RingProps {
	pct: number;
	size?: number;
	stroke?: number;
	color: string;
	track?: string;
	children?: React.ReactNode;
}

// Mirrors components/ProgressRing.tsx stroke-dashoffset math (prototype Ring).
// track defaults to the dark-card value; light-bg callers pass track="#eef1f5".
export function Ring({
	pct,
	size = 96,
	stroke = 11,
	color,
	track = "rgba(255,255,255,0.12)",
	children,
}: RingProps) {
	const radius = (size - stroke) / 2;
	const circumference = radius * 2 * Math.PI;
	const clamped = Math.min(Math.max(pct, 0), 100);
	const strokeDashoffset = circumference - (clamped / 100) * circumference;
	const center = size / 2;

	return (
		<View style={{ width: size, height: size }}>
			<Svg width={size} height={size} style={StyleSheet.absoluteFill}>
				<Circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke={track}
					strokeWidth={stroke}
				/>
				<Circle
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={strokeDashoffset}
					transform={`rotate(-90 ${center} ${center})`}
				/>
			</Svg>
			<View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
});
