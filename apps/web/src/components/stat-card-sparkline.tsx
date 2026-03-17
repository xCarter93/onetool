"use client";

import { useId, useMemo } from "react";
import { AreaChart, Area } from "recharts";

interface StatCardSparklineProps {
	data: Array<{ date: string; [key: string]: number | string }>;
	dataKey: string;
	color: string;
	isActive: boolean;
	width: number;
	height?: number;
}

export function StatCardSparkline({
	data,
	dataKey,
	color,
	isActive,
	width,
	height = 28,
}: StatCardSparklineProps) {
	const strokeColor = isActive ? color : "var(--muted-foreground)";
	const strokeOpacity = isActive ? 1 : 0.2;
	const uid = useId();
	const gradientId = `sparkline-gradient-${uid}-${dataKey}`;

	const isFlatLine = useMemo(() => {
		if (!data.length) return false;
		const values = data.map((d) => Number(d[dataKey])).filter(Number.isFinite);
		if (values.length === 0) return false;
		return values.every((v) => v === values[0]);
	}, [data, dataKey]);

	if (width <= 0 || !data.length) {
		return null;
	}

	// Flat-line: render a simple horizontal line at vertical center
	if (isFlatLine) {
		const midY = height / 2;
		return (
			<svg width={width} height={height}>
				<line
					x1={0}
					y1={midY}
					x2={width}
					y2={midY}
					stroke={strokeColor}
					strokeWidth={1.5}
					strokeOpacity={strokeOpacity}
				/>
			</svg>
		);
	}

	return (
		<AreaChart
			width={width}
			height={height}
			data={data}
			margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop
						offset="0%"
						stopColor={strokeColor}
						stopOpacity={isActive ? 0.2 : 0}
					/>
					<stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
				</linearGradient>
			</defs>
			<Area
				type="monotone"
				dataKey={dataKey}
				stroke={strokeColor}
				strokeWidth={1.5}
				strokeOpacity={strokeOpacity}
				fill={`url(#${gradientId})`}
				dot={false}
				isAnimationActive={false}
			/>
		</AreaChart>
	);
}
